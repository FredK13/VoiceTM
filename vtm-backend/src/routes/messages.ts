 // src/routes/messages.ts
import { Router } from "express";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import { getObjectFromR2 } from "../r2Client";
import { decryptAudio } from "../utils/audioCrypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const router = Router();

/**
 * 1) Logged-in users: higher limit
 * Keyed by userId
 */
const audioLimiterAuthed = rateLimit({
  windowMs: 60 * 1000,
  max: 180, // ✅ 180 audio fetches/min per user
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

/**
 * 2) Fallback: if userId missing for any reason, throttle by IP (stricter)
 * Keyed by normalized IP
 */
const audioLimiterIp = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // ✅ 30/min per IP
  keyGenerator: (req: any) => `ip:${ipKeyGenerator(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

/**
 * Pick which limiter to use:
 * - Prefer authed (uid) when available
 * - Otherwise IP limiter
 */
function audioLimiter(req: any, res: any, next: any) {
  if (req.userId) return audioLimiterAuthed(req, res, next);
  return audioLimiterIp(req, res, next);
}

/**
 * GET /api/messages/:id
 *
 * Protected:
 * - Must be logged in
 * - Logged-in user must be a MEMBER of the conversation that owns this message
 *
 * Returns message metadata (no audio bytes)
 */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const messageIdRaw = (req.params as any).id;
    const messageId = Array.isArray(messageIdRaw) ? messageIdRaw[0] : messageIdRaw;

    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "Invalid message id" });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        text: true,
        createdAt: true,
        audioUrl: true,
        audioDurationMs: true,
        readAt: true,
        listenedAt: true,
      },
    });

    if (!message) {
      // do not leak existence
      return res.status(404).json({ error: "Message not found" });
    }

    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: message.conversationId,
          userId,
        },
      },
      select: { id: true, leftAt: true },
    });

    if (!membership || membership.leftAt) {
      // do not leak existence
      return res.status(404).json({ error: "Message not found" });
    }

    res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        createdAt: message.createdAt,
        audioUrl: message.audioUrl,
        audioDurationMs: message.audioDurationMs ?? null,
        readAt: message.readAt,
        listenedAt: message.listenedAt ?? null,
      });

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/:id/audio
 *
 * Protected:
 * - Must be logged in
 * - Logged-in user must be a MEMBER of the conversation that owns this message
 */
router.get("/:id/audio", requireAuth, audioLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const messageIdRaw = (req.params as any).id;
    const messageId = Array.isArray(messageIdRaw) ? messageIdRaw[0] : messageIdRaw;

    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "Invalid message id" });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, audioUrl: true, conversationId: true },
    });

    if (!message || !message.audioUrl) {
      return res.status(404).json({ error: "Message not found" });
    }

    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: message.conversationId,
          userId,
        },
      },
      select: { id: true, leftAt: true },
    });

    if (!membership || membership.leftAt) {
      return res.status(404).json({ error: "Message not found" });
    }

    let encrypted: Buffer;
    try {
      encrypted = await getObjectFromR2(message.audioUrl);
    } catch {
      return res.status(404).json({ error: "Message not found" });
    }

    const decrypted = decryptAudio(encrypted);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(decrypted.length));
    return res.status(200).send(decrypted);
  } catch (err) {
    next(err);
  }
});

export default router;
