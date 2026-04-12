// src/routes/conversations.ts
import { Router } from "express";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import { synthesizeMessageAudio } from "../voice/synthesizeMessageAudio";
import { deleteObjectFromR2 } from "../r2Client";
import { hashPIIForLookup, normalizeEmail, normalizeUsername } from "../utils/piiCrypto";
import { signAvatarGetUrl } from "../r2ImagesClient";
import rateLimit from "express-rate-limit";


const router = Router();


/**
 * ✅ Per-user limiters for write / abuse-prone endpoints
 * Note: baseline limiter in server.ts still applies to /api/*
 */
const convoRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // ✅ invite requests per minute per user
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


const convoMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40, // ✅ message sends per minute per user (includes TTS work)
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


// Optional: accept/reject limiter (lightweight but prevents spam clicks)
const convoDecisionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


function coerceEmojiMapping(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return null;


  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}


// ✅ Fix TS: req.params can be string | string[]
function param1(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}


// Helper: DB stores avatar KEY (avatars/...), API returns signed URL or null
async function maybeSignAvatar(avatarKey: string | null | undefined) {
  if (!avatarKey) return null;


  // Only sign keys we expect. If you ever stored full URLs before,
  // this prevents passing "https://..." into the signer.
  if (!avatarKey.startsWith("avatars/")) return avatarKey;


  return signAvatarGetUrl({ key: avatarKey, expiresInSec: 300 });
}


/**
 * GET /api/conversations
 * Returns conversations where logged-in user is a MEMBER AND has not hidden it.
 *
 * ✅ avatarUrl returned here will be the OTHER USER's signed avatar for 1:1 chats.
 *
 * ✅ IMPORTANT CHANGE: exclude conversations where this user has LEFT (leftAt != null)
 * This prevents a "deleted/left" bubble from reappearing automatically.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const conversations = await prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId,
            hiddenAt: null,
            leftAt: null, // ✅ must still be an active member
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        members: {
          where: { hiddenAt: null, leftAt: null }, // ✅ only active visible members
          include: {
            user: { select: { id: true, username: true, avatarUrl: true } }, // avatarUrl is KEY
          },
        },
      },
    });


    const payload = await Promise.all(
      conversations.map(async (c) => {
        const memberUsers = c.members.map((m) => m.user);
        const other = memberUsers.find((u) => u.id !== userId) ?? null;


        const signedOtherAvatar = await maybeSignAvatar(other?.avatarUrl ?? null);
        const computedTitle = other?.username ? `${other.username}` : c.title;


        return {
          id: c.id,
          title: computedTitle,
          lastMessage: c.messages[0]?.text ?? null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          avatarUrl: signedOtherAvatar,
          otherUserId: other?.id ?? null,
          otherUsername: other?.username ?? null,
        };
      })
    );


    res.json(payload);
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/conversations/request
 *
 * ✅ DOES NOT create a conversation.
 * ✅ Creates (or reuses) an invite row unique by (fromUserId,toUserId).
 *
 * ✅ IMPORTANT CHANGE:
 * If a conversation already exists between the users BUT the requester has left it (leftAt != null),
 * DO NOT auto-return ALREADY_CONNECTED. Instead, return a response that the frontend can treat as "pending request"
 * so the user can re-accept. (We do NOT create the rejoin invite here; you said you created routes/rejoin.ts for that.)
 */
router.post("/request", requireAuth, convoRequestLimiter, async (req, res, next) => {
  try {
    const fromUserId = requireUserId(req);
    const identifierRaw = String((req.body as any)?.identifier ?? "").trim();


    if (!identifierRaw) {
      return res.status(400).json({ error: "Valid identifier is required" });
    }


    // Resolve recipient user by:
    // - email
    // - username
    // - userId (cuid-ish)
    const toUser = await (async () => {
      // 1) email
      if (identifierRaw.includes("@")) {
        const normalized = normalizeEmail(identifierRaw.toLowerCase());
        if (!normalized) return null;
        const emailHash = hashPIIForLookup(normalized);
        return prisma.user.findUnique({
          where: { emailHash },
          select: { id: true },
        });
      }


      // 2) userId shortcut (optional)
      if (identifierRaw.startsWith("c")) {
        const byId = await prisma.user.findUnique({
          where: { id: identifierRaw },
          select: { id: true },
        });
        if (byId) return byId;
      }


      // 3) username
      const usernameNorm = normalizeUsername(identifierRaw);
      if (!usernameNorm) return null;


      return prisma.user.findUnique({
        where: { usernameNorm },
        select: { id: true },
      });
    })();


    // avoid self-invite
    if (toUser && toUser.id === fromUserId) {
      return res.status(400).json({ error: "You cannot invite yourself" });
    }


    // ✅ avoid enumeration: if recipient doesn't exist, still respond "CREATED"
    if (!toUser) {
      return res.status(201).json({ status: "CREATED" as const });
    }


    // ✅ if conversation already exists between these two...
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        AND: [{ members: { some: { userId: fromUserId } } }, { members: { some: { userId: toUser.id } } }],
      },
      select: { id: true },
    });


if (existingConversation) {
  const convoId = existingConversation.id;


  const myMember = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: convoId, userId: fromUserId } },
    select: { leftAt: true },
  });


  // ✅ If requester is still active, they are already chatting.
  if (!myMember?.leftAt) {
    return res.status(200).json({
      status: "ALREADY_CONNECTED" as const,
      conversationId: convoId,
    });
  }


  // ✅ Requester LEFT: send a REJOIN invite to whoever is still active in that conversation
  const activeMembers = await prisma.conversationMember.findMany({
    where: { conversationId: convoId, leftAt: null },
    select: { userId: true },
  });


  // If nobody is active anymore, fall through to the normal invite flow below.
if (activeMembers.length > 0) {
  const toUserId =
    activeMembers.map((m) => m.userId).find((id) => id !== fromUserId) ?? activeMembers[0].userId;


  // ✅ If it's already pending, don't "resend" — just tell the client it's sent.
  const existingPending = await prisma.conversationRejoinInvite.findUnique({
    where: { conversationId_toUserId: { conversationId: convoId, toUserId } },
    select: { status: true },
  });


  if (existingPending?.status === "PENDING") {
    return res.status(200).json({ status: "REJOIN_SENT" as const });
    // (optional later: return { status: "REJOIN_ALREADY" as const } if you add that enum)
  }


  await prisma.conversationRejoinInvite.upsert({
    where: { conversationId_toUserId: { conversationId: convoId, toUserId } },
    create: {
      conversationId: convoId,
      fromUserId,
      toUserId,
      status: "PENDING",
    },
    update: {
      fromUserId,
      status: "PENDING",
      updatedAt: new Date(),
    },
  });


  return res.status(200).json({ status: "REJOIN_SENT" as const });
}


  // else: no active members -> continue to normal invite code below
}


    // ✅ If THEY already invited ME and it's still pending, don't allow reverse invite
    const reversePending = await prisma.conversationInvite.findUnique({
      where: { fromUserId_toUserId: { fromUserId: toUser.id, toUserId: fromUserId } },
      select: { id: true, status: true },
    });


    if (reversePending && reversePending.status === "PENDING") {
      return res.status(200).json({ status: "INCOMING_PENDING" as const });
    }


    // ✅ enforce single invite row per pair
    const existingInvite = await prisma.conversationInvite.findUnique({
      where: { fromUserId_toUserId: { fromUserId, toUserId: toUser.id } },
      select: { id: true, status: true },
    });


    if (existingInvite) {
      if (existingInvite.status === "PENDING") {
        return res.status(200).json({ status: "PENDING_ALREADY" as const });
      }


      // REJECTED (or any non-pending): flip back to PENDING = "resend"
      await prisma.conversationInvite.update({
        where: { id: existingInvite.id },
        data: { status: "PENDING", conversationId: null },
      });


      return res.status(201).json({ status: "CREATED" as const });
    }


    await prisma.conversationInvite.create({
      data: {
        fromUserId,
        toUserId: toUser.id,
        status: "PENDING",
      },
      select: { id: true },
    });


    return res.status(201).json({ status: "CREATED" as const });
  } catch (err) {
    next(err);
  }
});


/**
 * GET /api/conversations/requests
 * Incoming PENDING invites for logged-in user.
 *
 * ✅ Signs fromUser.avatarUrl before returning.
 */
router.get("/requests", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const invites = await prisma.conversationInvite.findMany({
      where: { toUserId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, username: true, avatarUrl: true } }, // avatarUrl is KEY
      },
    });


    const payload = await Promise.all(
      invites.map(async (inv) => {
        const signedFromAvatar = await maybeSignAvatar(inv.fromUser.avatarUrl ?? null);


        return {
          id: inv.id,
          createdAt: inv.createdAt.toISOString(),
          fromUser: {
            id: inv.fromUser.id,
            username: inv.fromUser.username,
            avatarUrl: signedFromAvatar,
          },
        };
      })
    );


    res.json(payload);
  } catch (err) {
    next(err);
  }
});


/**
 * GET /api/conversations/requests/outgoing
 * Outgoing PENDING invites sent by logged-in user.
 *
 * ✅ Signs toUser.avatarUrl before returning.
 */
router.get("/requests/outgoing", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const invites = await prisma.conversationInvite.findMany({
      where: { fromUserId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        toUser: { select: { id: true, username: true, avatarUrl: true } }, // avatarUrl is KEY
      },
    });


    const payload = await Promise.all(
      invites.map(async (inv) => {
        const signedToAvatar = await maybeSignAvatar(inv.toUser.avatarUrl ?? null);


        return {
          id: inv.id,
          createdAt: inv.createdAt.toISOString(),
          toUser: {
            id: inv.toUser.id,
            username: inv.toUser.username,
            avatarUrl: signedToAvatar,
          },
        };
      })
    );


    res.json(payload);
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/conversations/requests/:inviteId/accept
 * ✅ Creates conversation here (on acceptance)
 */
router.post("/requests/:inviteId/accept", requireAuth, convoDecisionLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const inviteId = param1((req.params as any).inviteId);
    if (!inviteId) return res.status(400).json({ error: "Invalid inviteId" });


    const invite = await prisma.conversationInvite.findFirst({
      where: { id: inviteId, toUserId: userId, status: "PENDING" },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    });


    if (!invite) return res.status(404).json({ error: "Invite not found" });


    // Safety: if conversation already exists (race condition), return it.
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        AND: [{ members: { some: { userId: invite.fromUserId } } }, { members: { some: { userId: invite.toUserId } } }],
      },
      select: { id: true },
    });


    if (existingConversation) {
      await prisma.conversationInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", conversationId: existingConversation.id },
      });


      await prisma.contact.upsert({
        where: { ownerId_contactId: { ownerId: invite.fromUserId, contactId: invite.toUserId } },
        update: {},
        create: { ownerId: invite.fromUserId, contactId: invite.toUserId },
      });


      await prisma.contact.upsert({
        where: { ownerId_contactId: { ownerId: invite.toUserId, contactId: invite.fromUserId } },
        update: {},
        create: { ownerId: invite.toUserId, contactId: invite.fromUserId },
      });


      // ✅ ensure membership is active if it existed
      await prisma.conversationMember.updateMany({
        where: { 
          conversationId: existingConversation.id, 
          userId: {in: [invite.fromUserId, invite.toUserId] },
        },
        data: { hiddenAt: null, leftAt: null },
      });


      return res.json({ ok: true, conversationId: existingConversation.id });
    }


    const convoTitle = "chat";


    const created = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          title: convoTitle,
          members: {
            create: [
              { userId: invite.fromUserId, hiddenAt: null, leftAt: null },
              { userId: invite.toUserId, hiddenAt: null, leftAt: null },
            ],
          },
        },
        select: { id: true },
      });


      await tx.conversationInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", conversationId: conversation.id },
      });


      await tx.contact.upsert({
        where: { ownerId_contactId: { ownerId: invite.fromUserId, contactId: invite.toUserId } },
        update: {},
        create: { ownerId: invite.fromUserId, contactId: invite.toUserId },
      });


      await tx.contact.upsert({
        where: { ownerId_contactId: { ownerId: invite.toUserId, contactId: invite.fromUserId } },
        update: {},
        create: { ownerId: invite.toUserId, contactId: invite.fromUserId },
      });


      return conversation;
    });


    res.json({ ok: true, conversationId: created.id });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/conversations/requests/:inviteId/reject
 */
router.post("/requests/:inviteId/reject", requireAuth, convoDecisionLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const inviteId = param1((req.params as any).inviteId);
    if (!inviteId) return res.status(400).json({ error: "Invalid inviteId" });


    const invite = await prisma.conversationInvite.findFirst({
      where: { id: inviteId, toUserId: userId, status: "PENDING" },
      select: { id: true },
    });


    if (!invite) return res.status(404).json({ error: "Invite not found" });


    await prisma.conversationInvite.update({
      where: { id: invite.id },
      data: { status: "REJECTED" },
    });


    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/conversations/requests/:inviteId/cancel
 *
 * Sender-side cancel for outgoing pending yap/chat requests.
 * Only the original sender can cancel, and only while still PENDING.
 */
router.post("/requests/:inviteId/cancel", requireAuth, convoDecisionLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const inviteId = param1((req.params as any).inviteId);
    if (!inviteId) return res.status(400).json({ error: "Invalid inviteId" });


    const invite = await prisma.conversationInvite.findFirst({
      where: {
        id: inviteId,
        fromUserId: userId,
        status: "PENDING",
      },
      select: { id: true },
    });


    if (!invite) {
      return res.status(404).json({ 
        error: "Invite not found",
        code: "CHAT_REQUEST_CANCEL_INVALID",
       });
    }


    await prisma.conversationInvite.update({
      where: { id: invite.id },
      data: {
        status: "CANCELLED",
        conversationId: null,
      },
    });


    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * GET /api/conversations/:id/messages
 *
 * ✅ IMPORTANT CHANGE:
 * user must be an ACTIVE member (leftAt == null) to read messages.
 */
router.get("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const conversationId = param1((req.params as any).id);
    if (!conversationId) return res.status(400).json({ error: "Invalid conversation id" });


    const membership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true, leftAt: true },
    });


    if (!membership || membership.leftAt) return res.status(404).json({ error: "Conversation not found" });


    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        text: true,
        createdAt: true,
        audioUrl: true,
        audioDurationMs: true,
        readAt: true,
        senderId: true,
        listenedAt: true,
      },
    });


    res.json(messages);
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/conversations/:id/messages
 *
 * ✅ Sender must be active (leftAt == null)
 * ✅ If a rejoin invite is PENDING for this conversation, block new messages
 * ✅ If some members LEFT, create rejoin invite(s) for them on the first message
 * ✅ Only unhide ACTIVE members
 */
router.post("/:id/messages", requireAuth, convoMessageLimiter, async (req, res, next) => {
  try {
    const senderId = requireUserId(req);
    const conversationId = param1((req.params as any).id);
    if (!conversationId) return res.status(400).json({ error: "Invalid conversation id" });


    const { text } = req.body as { text?: string };
    if (!text || !text.trim()) return res.status(400).json({ error: "Text is required" });


    // ✅ Sender must be ACTIVE
    const membership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } },
      select: { id: true, leftAt: true },
    });
    if (!membership || membership.leftAt) {
      return res.status(403).json({ error: "Not a member of this conversation" });
    }


const pendingRejoin = await prisma.conversationRejoinInvite.findFirst({
  where: { conversationId, status: "PENDING" },
  select: { id: true, fromUserId: true, toUserId: true },
});


if (pendingRejoin) {
  const action = pendingRejoin.fromUserId === senderId ? "OPEN_PENDING" : "OPEN_REQUESTS";


  return res.status(409).json({
    error: "Rejoin pending",
    code: "REJOIN_PENDING",
    action,
  });
}

    // Resolve sender info
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { elevenLabsVoiceId: true, emojiProfile: { select: { mapping: true } } },
    });
    if (!sender) return res.status(404).json({ error: "User not found" });


    const emojiMappingOverride = coerceEmojiMapping(sender.emojiProfile?.mapping);
    const voiceIdOverride = sender.elevenLabsVoiceId ?? null;
    const trimmed = text.trim();


    // Create base message
    const baseMessage = await prisma.message.create({
      data: { conversationId, senderId, text: trimmed },
      select: { id: true, text: true, createdAt: true, senderId: true },
    });


    // TTS best effort
    try {
      const { audioUrl, audioDurationMs } = await synthesizeMessageAudio({
        text: trimmed,
        senderId,
        conversationId,
        messageId: baseMessage.id,
        voiceIdOverride,
        emojiMappingOverride,
      });


      if (audioUrl || audioDurationMs != null) {
        await prisma.message.update({
          where: { id: baseMessage.id },
          data: {
            audioUrl: audioUrl ?? undefined,
            audioDurationMs: audioDurationMs ?? undefined,
          },
        });
      }
    } catch (ttsErr) {
      console.warn("synthesizeMessageAudio failed, keeping text-only message:", ttsErr);
    }


    // ✅ Create rejoin invites for any LEFT members (this is the “ping”)
    const leftMembers = await prisma.conversationMember.findMany({
      where: {
        conversationId,
        leftAt: { not: null },
        userId: { not: senderId },
      },
      select: { userId: true },
    });


    await prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });


      // Only unhide ACTIVE members
      await tx.conversationMember.updateMany({
        where: { conversationId, leftAt: null },
        data: { hiddenAt: null },
      });


      // If anyone left, create a pending rejoin invite for them
      for (const lm of leftMembers) {
        await tx.conversationRejoinInvite.upsert({
          where: {
            conversationId_toUserId: { conversationId, toUserId: lm.userId },
          },
          create: {
            conversationId,
            fromUserId: senderId,
            toUserId: lm.userId,
            status: "PENDING",
          },
          update: {
            fromUserId: senderId,
            status: "PENDING",
            updatedAt: new Date(),
          },
        });
      }
    });


    const finalMessage = await prisma.message.findUnique({
      where: { id: baseMessage.id },
      select: {
        id: true,
        text: true,
        createdAt: true,
        audioUrl: true,
        audioDurationMs: true,
        readAt: true,
        listenedAt: true,
        senderId: true,
      },
    });


    return res.status(201).json(finalMessage ?? baseMessage);
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/conversations/:conversationId/messages/:messageId/listened
 *
 * Marks a message as "listened" (only for messages NOT sent by the caller).
 * Requires the caller to be an ACTIVE member (leftAt == null).
 */
router.post("/:conversationId/messages/:messageId/listened", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const conversationId = param1((req.params as any).conversationId);
    const messageId = param1((req.params as any).messageId);


    if (!conversationId || !messageId) {
      return res.status(400).json({ error: "Invalid params" });
    }


    const membership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true, leftAt: true },
    });


    if (!membership || membership.leftAt) return res.status(404).json({ error: "Conversation not found" });


    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, senderId: true, listenedAt: true },
    });


    if (!existing || existing.conversationId !== conversationId) {
      return res.status(404).json({ error: "Message not found" });
    }


    // You can't "listen" to your own message (no-op)
    if (existing.senderId === userId) {
      return res.json({ id: existing.id, listenedAt: existing.listenedAt ?? null });
    }


    // Only set listenedAt once (keep original timestamp)
    const message = await prisma.message.update({
      where: { id: messageId },
      data: { listenedAt: existing.listenedAt ?? new Date() },
      select: { id: true, listenedAt: true },
    });


    return res.json(message);
  } catch (err) {
    next(err);
  }
});


/**
 * DELETE /api/conversations/:id
 *
 * ✅ IMPORTANT CHANGE:
 * This is now a "LEAVE" (soft leave) not a simple hide.
 * - sets leftAt
 * - sets hiddenAt (so it disappears immediately)
 *
 * Hard delete only happens when EVERYONE has left (activeCount === 0).
 */
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const conversationId = param1((req.params as any).id);
    if (!conversationId) return res.status(400).json({ error: "Invalid conversation id" });


    const membership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });


    if (!membership) {
      return res.status(404).json({ error: "Conversation not found" });
    }


    // ✅ mark as left (and hide UI)
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { hiddenAt: new Date(), leftAt: new Date() },
    });


    // ✅ if anyone is still active, keep conversation
    const activeCount = await prisma.conversationMember.count({
      where: { conversationId, leftAt: null },
    });


    if (activeCount > 0) {
      return res.status(204).send();
    }


    // ✅ all left => hard delete + R2 cleanup
    const audioKeys = await prisma.message.findMany({
      where: { conversationId },
      select: { audioUrl: true },
    });


    await prisma.conversation.delete({ where: { id: conversationId } });


    const keys = audioKeys.map((m) => m.audioUrl).filter(Boolean) as string[];
    await Promise.allSettled(keys.map((k) => deleteObjectFromR2(k)));


    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});


export default router;
