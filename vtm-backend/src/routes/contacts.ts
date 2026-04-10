import { Router } from "express";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import rateLimit from "express-rate-limit";
import { normalizeEmail, normalizeUsername, hashPIIForLookup } from "../utils/piiCrypto";
import { signAvatarGetUrl } from "../r2ImagesClient";


const router = Router();
router.use(requireAuth);


/**
 * Avatar: DB stores key (avatars/...), API returns signed URL or null
 */
async function maybeSignAvatar(avatarKey: string | null | undefined) {
  if (!avatarKey) return null;
  if (!avatarKey.startsWith("avatars/")) return avatarKey;
  return signAvatarGetUrl({ key: avatarKey, expiresInSec: 300 });
}


const contactsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


const contactInviteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


const contactDecisionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


function coerceString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}


function param1(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}


async function resolveUserByIdentifier(identifierRaw: string) {
  const identifier = identifierRaw.trim();
  if (!identifier) return null;


  if (identifier.includes("@")) {
    const normalized = normalizeEmail(identifier);
    if (!normalized) return null;
    const emailHash = hashPIIForLookup(normalized);
    return prisma.user.findUnique({
      where: { emailHash },
      select: { id: true, username: true, avatarUrl: true },
    });
  }


  if (identifier.startsWith("c")) {
    const byId = await prisma.user.findUnique({
      where: { id: identifier },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (byId) return byId;
  }


  const usernameNorm = normalizeUsername(identifier);
  if (!usernameNorm) return null;


  return prisma.user.findUnique({
    where: { usernameNorm },
    select: { id: true, username: true, avatarUrl: true },
  });
}


async function isBlockedEitherWay(a: string, b: string) {
  const found = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!found;
}


/**
 * GET /api/contacts
 */
router.get("/", contactsLimiter, async (req, res, next) => {
  try {
    const ownerId = requireUserId(req);


    const rows = await prisma.contact.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        contact: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            voiceStatus: true,
            lastSeenAt: true,
          },
        },
      },
    });


    const contacts = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        createdAt: r.createdAt,
        user: {
          id: r.contact.id,
          username: r.contact.username,
          avatarUrl: await maybeSignAvatar(r.contact.avatarUrl),
          voiceStatus: r.contact.voiceStatus,
          lastSeenAt: r.contact.lastSeenAt ? r.contact.lastSeenAt.toISOString() : null,
        },
      }))
    );


    return res.status(200).json({ contacts });
  } catch (err) {
    next(err);
  }
});


/**
 * DELETE /api/contacts/:contactUserId
 */
router.delete("/:contactUserId", contactDecisionLimiter, async (req, res, next) => {
  try {
    const ownerId = requireUserId(req);
    const contactId = param1((req.params as any).contactUserId);


    if (!contactId) return res.status(400).json({ error: "Invalid contact id" });


    await prisma.contact.deleteMany({
      where: { ownerId, contactId },
    });


    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/contacts/block/:userId
 */
router.post("/block/:userId", contactDecisionLimiter, async (req, res, next) => {
  try {
    const blockerId = requireUserId(req);
    const blockedId = param1((req.params as any).userId);


    if (!blockedId) return res.status(400).json({ error: "Invalid user id" });
    if (blockedId === blockerId) return res.status(400).json({ error: "You cannot block yourself" });


    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId },
      select: { id: true },
    });


    await prisma.$transaction([
      prisma.contact.deleteMany({
        where: {
          OR: [
            { ownerId: blockerId, contactId: blockedId },
            { ownerId: blockedId, contactId: blockerId },
          ],
        },
      }),
      prisma.contactInvite.updateMany({
        where: {
          OR: [
            { fromUserId: blockerId, toUserId: blockedId, status: "PENDING" },
            { fromUserId: blockedId, toUserId: blockerId, status: "PENDING" },
          ],
        },
        data: { status: "REJECTED" },
      }),
    ]);


    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * DELETE /api/contacts/block/:userId
 */
router.delete("/block/:userId", contactDecisionLimiter, async (req, res, next) => {
  try {
    const blockerId = requireUserId(req);
    const blockedId = param1((req.params as any).userId);


    if (!blockedId) return res.status(400).json({ error: "Invalid user id" });


    await prisma.block.deleteMany({
      where: { blockerId, blockedId },
    });


    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/contacts/presence
 * Batch lookup for my saved contacts only
 */
router.post("/presence", contactsLimiter, async (req, res, next) => {
  try {
    const ownerId = requireUserId(req);
    const userIds = req.body?.userIds;


    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "Invalid userIds" });
    }


    const requestedIds = Array.from(
      new Set(
        userIds
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
      )
    ).slice(0, 100);


    if (!requestedIds.length) {
      return res.json({ users: [] });
    }


    const allowedContacts = await prisma.contact.findMany({
      where: {
        ownerId,
        contactId: { in: requestedIds },
      },
      select: {
        contactId: true,
        contact: {
          select: {
            id: true,
            lastSeenAt: true,
          },
        },
      },
    });


    return res.json({
      users: allowedContacts.map((row) => ({
        id: row.contact.id,
        lastSeenAt: row.contact.lastSeenAt ? row.contact.lastSeenAt.toISOString() : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/contacts/request
 */
router.post("/request", contactInviteLimiter, async (req, res, next) => {
  try {
    const fromUserId = requireUserId(req);
    const identifier = coerceString((req.body as any)?.identifier);
    if (!identifier) return res.status(400).json({ error: "Valid identifier is required" });


    const toUser = await resolveUserByIdentifier(identifier);


    if (!toUser) return res.status(201).json({ status: "CREATED" as const });


    if (toUser.id === fromUserId) {
      return res.status(400).json({ error: "You cannot add yourself" });
    }


    if (await isBlockedEitherWay(fromUserId, toUser.id)) {
      return res.status(201).json({ status: "CREATED" as const });
    }


    const already = await prisma.contact.findFirst({
      where: { ownerId: fromUserId, contactId: toUser.id },
      select: { id: true },
    });
    if (already) {
      return res.status(200).json({ status: "ALREADY_ADDED" as const });
    }


    const reversePending = await prisma.contactInvite.findUnique({
      where: { fromUserId_toUserId: { fromUserId: toUser.id, toUserId: fromUserId } },
      select: { id: true, status: true },
    });
    if (reversePending && reversePending.status === "PENDING") {
      return res.status(200).json({ status: "INCOMING_PENDING" as const });
    }


    const existingInvite = await prisma.contactInvite.findUnique({
      where: { fromUserId_toUserId: { fromUserId, toUserId: toUser.id } },
      select: { id: true, status: true },
    });


    if (existingInvite) {
      if (existingInvite.status === "PENDING") {
        return res.status(200).json({ status: "PENDING_ALREADY" as const });
      }


      await prisma.contactInvite.update({
        where: { id: existingInvite.id },
        data: { status: "PENDING" },
      });
      return res.status(201).json({ status: "CREATED" as const });
    }


    await prisma.contactInvite.create({
      data: { fromUserId, toUserId: toUser.id, status: "PENDING" },
      select: { id: true },
    });


    return res.status(201).json({ status: "CREATED" as const });
  } catch (err) {
    next(err);
  }
});


/**
 * GET /api/contacts/requests
 */
router.get("/requests", contactsLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const invites = await prisma.contactInvite.findMany({
      where: { toUserId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, username: true, avatarUrl: true } },
      },
    });


    const payload = await Promise.all(
      invites.map(async (inv) => ({
        id: inv.id,
        createdAt: inv.createdAt.toISOString(),
        fromUser: {
          id: inv.fromUser.id,
          username: inv.fromUser.username,
          avatarUrl: await maybeSignAvatar(inv.fromUser.avatarUrl),
        },
      }))
    );


    return res.json(payload);
  } catch (err) {
    next(err);
  }
});


/**
 * GET /api/contacts/requests/outgoing
 */
router.get("/requests/outgoing", contactsLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const invites = await prisma.contactInvite.findMany({
      where: { fromUserId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        toUser: { select: { id: true, username: true, avatarUrl: true } },
      },
    });


    const payload = await Promise.all(
      invites.map(async (inv) => ({
        id: inv.id,
        createdAt: inv.createdAt.toISOString(),
        toUser: {
          id: inv.toUser.id,
          username: inv.toUser.username,
          avatarUrl: await maybeSignAvatar(inv.toUser.avatarUrl),
        },
      }))
    );


    return res.json(payload);
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/contacts/requests/:inviteId/accept
 */
router.post("/requests/:inviteId/accept", contactDecisionLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const inviteId = param1((req.params as any).inviteId);
    if (!inviteId) return res.status(400).json({ error: "Invalid inviteId" });


    const invite = await prisma.contactInvite.findFirst({
      where: { id: inviteId, toUserId: userId, status: "PENDING" },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    });


    if (!invite) return res.status(404).json({ error: "Invite not found" });


    await prisma.$transaction([
      prisma.contactInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED" },
      }),
      prisma.contact.upsert({
        where: {
          ownerId_contactId: {
            ownerId: invite.fromUserId,
            contactId: invite.toUserId,
          },
        },
        update: {},
        create: {
          ownerId: invite.fromUserId,
          contactId: invite.toUserId,
        },
      }),
      prisma.contact.upsert({
        where: {
          ownerId_contactId: {
            ownerId: invite.toUserId,
            contactId: invite.fromUserId,
          },
        },
        update: {},
        create: {
          ownerId: invite.toUserId,
          contactId: invite.fromUserId,
        },
      }),
    ]);


    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/contacts/requests/:inviteId/reject
 */
router.post("/requests/:inviteId/reject", contactDecisionLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const inviteId = param1((req.params as any).inviteId);
    if (!inviteId) return res.status(400).json({ error: "Invalid inviteId" });


    const invite = await prisma.contactInvite.findFirst({
      where: { id: inviteId, toUserId: userId, status: "PENDING" },
      select: { id: true },
    });


    if (!invite) return res.status(404).json({ error: "Invite not found" });


    await prisma.contactInvite.update({
      where: { id: invite.id },
      data: { status: "REJECTED" },
    });


    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


export default router;
