// src/routes/rejoin.ts
import { Router } from "express";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import rateLimit from "express-rate-limit";
import { signAvatarGetUrl } from "../r2ImagesClient";


const router = Router();


// lightweight spam protection (per user)
const rejoinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


// Helper: DB stores avatar KEY (avatars/...), API returns signed URL or null
async function maybeSignAvatar(avatarKey: string | null | undefined) {
  if (!avatarKey) return null;


  // If legacy full URL exists, just pass it through
  if (!avatarKey.startsWith("avatars/")) return avatarKey;


  return signAvatarGetUrl({ key: avatarKey, expiresInSec: 300 });
}

// ✅ Recently-left list for the logged-in user
// GET /api/rejoin/recently-left
router.get("/recently-left", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    // Find conversation memberships where the user left
    const rows = await prisma.conversationMember.findMany({
      where: {
        userId,
        leftAt: { not: null },
      },
      orderBy: { leftAt: "desc" },
      take: 50,
      select: {
        conversationId: true,
        leftAt: true,
        conversation: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            members: {
              where: { leftAt: null }, // active members now
              select: {
                user: { select: { id: true, username: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });


    const payload = await Promise.all(
      rows.map(async (r) => {
        const convo = r.conversation;
        const other = convo.members.map((m) => m.user).find((u) => u.id !== userId) ?? null;
        const avatarUrl = await maybeSignAvatar(other?.avatarUrl ?? null);


        return {
          conversationId: r.conversationId,
          leftAt: r.leftAt?.toISOString() ?? null,
          otherUserId: other?.id ?? null,
          otherUsername: other?.username ?? convo.title ?? "chat",
          avatarUrl,
        };
      })
    );


    return res.json(payload);
  } catch (e) {
    next(e);
  }
});


// ✅ Incoming rejoin requests for ME (show in Requests UI)
router.get("/requests", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const rows = await prisma.conversationRejoinInvite.findMany({
      where: { toUserId: userId, status: "PENDING" },
      orderBy: { updatedAt: "desc" },
      include: {
        fromUser: { select: { id: true, username: true, avatarUrl: true } },
      },
    });


    // Keep payload shape similar to your existing invite UI
    return res.json(
      await Promise.all(
        rows.map(async (r) => ({
          kind: "rejoin" as const,
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          conversationId: r.conversationId,
          fromUser: {
            id: r.fromUser.id,
            username: r.fromUser.username,
            avatarUrl: await maybeSignAvatar(r.fromUser.avatarUrl),
          },
        }))
      )
    );
  } catch (e) {
    next(e);
  }
});




// ✅ Outgoing rejoin requests I SENT (show in Pending UI)
router.get("/requests/outgoing", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const rows = await prisma.conversationRejoinInvite.findMany({
      where: { fromUserId: userId, status: "PENDING" },
      orderBy: { updatedAt: "desc" },
      include: {
        toUser: { select: { id: true, username: true, avatarUrl: true } },
      },
    });


    return res.json(
      await Promise.all(
        rows.map(async (r) => ({
          kind: "rejoin" as const,
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          conversationId: r.conversationId,
          toUser: {
            id: r.toUser.id,
            username: r.toUser.username,
            avatarUrl: await maybeSignAvatar(r.toUser.avatarUrl),
          },
        }))
      )
    );
  } catch (e) {
    next(e);
  }
});


// ✅ Accept rejoin: puts the *LEAVER* (fromUserId) back into the convo
router.post("/requests/:id/accept", requireAuth, rejoinLimiter, async (req, res, next) => {
  try {
    const accepterId = requireUserId(req);
    const id = String((req.params as any).id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });


    const inv = await prisma.conversationRejoinInvite.findFirst({
      where: { id, toUserId: accepterId, status: "PENDING" },
      select: { id: true, conversationId: true, fromUserId: true, toUserId: true },
    });
    if (!inv) return res.status(404).json({ error: "Invite not found" });

       const [conversation, fromMembership, toMembership] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: inv.conversationId },
        select: { id: true },
      }),
      prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: inv.conversationId,
            userId: inv.fromUserId,
          },
        },
        select: { id: true, leftAt: true },
      }),
      prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: inv.conversationId,
            userId: inv.toUserId,
          },
        },
        select: { id: true, leftAt: true },
      }),
    ]);


    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }


    const fromIsLeft = !!fromMembership?.leftAt;
    const toIsLeft = !!toMembership?.leftAt;


    let rejoinUserId: string | null = null;
    let activeUserId: string | null = null;


    if (fromIsLeft && !toIsLeft) {
      rejoinUserId = inv.fromUserId;
      activeUserId = inv.toUserId;
    } else if (toIsLeft && !fromIsLeft) {
      rejoinUserId = inv.toUserId;
      activeUserId = inv.fromUserId;
    } else {
      return res.status(409).json({ error: "Conversation is no longer active" });
    }


    await prisma.$transaction(async (tx) => {
      await tx.conversationRejoinInvite.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED" },
      });


      await tx.conversationMember.upsert({
        where: {
          conversationId_userId: {
            conversationId: inv.conversationId,
            userId: rejoinUserId,
          },
        },
        create: {
          conversationId: inv.conversationId,
          userId: rejoinUserId,
          hiddenAt: null,
          leftAt: null,
        },
        update: {
          hiddenAt: null,
          leftAt: null,
        },
      });


      await tx.conversationMember.updateMany({
        where: {
          conversationId: inv.conversationId,
          userId: { in: [activeUserId, rejoinUserId] },
        },
        data: { hiddenAt: null },
      });
    });


    return res.json({ ok: true, conversationId: inv.conversationId });
  } catch (e) {
    next(e);
  }
});


// ✅ Reject rejoin
router.post("/requests/:id/reject", requireAuth, rejoinLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const id = String((req.params as any).id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });


    const inv = await prisma.conversationRejoinInvite.findFirst({
      where: { id, toUserId: userId, status: "PENDING" },
      select: { id: true },
    });
    if (!inv) return res.status(404).json({ error: "Invite not found" });


    await prisma.conversationRejoinInvite.update({
      where: { id: inv.id },
      data: { status: "REJECTED" },
    });


    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ✅ Cancel outgoing rejoin
router.post("/requests/:id/cancel", requireAuth, rejoinLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const id = String((req.params as any).id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });


    const inv = await prisma.conversationRejoinInvite.findFirst({
      where: {
        id,
        fromUserId: userId,
        status: "PENDING",
      },
      select: { id: true },
    });


    if (!inv) return res.status(404).json({ 
      error: "Invite not found",
      code: "REJOIN_REQUEST_CANCEL_INVALID",
     });


    await prisma.conversationRejoinInvite.update({
      where: { id: inv.id },
      data: { status: "CANCELLED" },
    });


    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});



export default router;

