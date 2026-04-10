// vtm-backend/src/routes/realtime.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";


const router = Router();


/**
 * Token minting is cheap but can be spammed.
 * Keep it light & keyed per-user.
 */
const wsTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


function coerceRoomId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s.length ? s : null;
}


/**
 * Room rules:
 * - convo:<conversationId>  => requester must be a member
 * - user:<userId>          => requester can only request their own user room
 */
async function assertRoomAllowed(userId: string, roomId: string): Promise<boolean> {
  if (roomId.startsWith("convo:")) {
    const conversationId = roomId.slice("convo:".length).trim();
    if (!conversationId) return false;


    const membership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });


    return !!membership;
  }


  if (roomId.startsWith("user:")) {
    const targetUserId = roomId.slice("user:".length).trim();
    if (!targetUserId) return false;
    return targetUserId === userId;
  }


  return false;
}


/**
 * GET /api/realtime/ws-token?roomId=convo:<conversationId>
 * GET /api/realtime/ws-token?roomId=user:<userId>
 *
 * Returns: { token, expiresInSec }
 *
 * Token contains:
 * - userId
 * - rid (roomId)
 * - beta: true
 */
router.get("/ws-token", requireAuth, wsTokenLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const secret = process.env.WS_JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Server misconfigured" });
    }


    const roomId = coerceRoomId((req.query as any)?.roomId);
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }


    const allowed = await assertRoomAllowed(userId, roomId);
    if (!allowed) {
      return res.status(404).json({ error: "Not found" });
    }


    const expiresInSec = 60;


    const token = jwt.sign(
      {
        userId,
        rid: roomId,
      },
      secret,
      {
        expiresIn: `${expiresInSec}s`,
      }
    );


    res.setHeader("Cache-Control", "no-store");
    return res.json({ token, expiresInSec });
  } catch (err) {
    next(err);
  }
});


export default router;
