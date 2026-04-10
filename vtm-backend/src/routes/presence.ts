import { Router } from "express";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import rateLimit from "express-rate-limit";
import { listPresenceWatcherUserIds, publishPresenceToUsers } from "../utils/realtimeFanout";


const router = Router();
router.use(requireAuth);


const presenceHeartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


router.post("/heartbeat", presenceHeartbeatLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const now = new Date();


    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: now },
      select: { id: true },
    });


    const watcherUserIds = await listPresenceWatcherUserIds(userId);


    await publishPresenceToUsers({
      watcherUserIds,
      subjectUserId: userId,
      online: true,
      at: now.toISOString(),
    });


    return res.json({ ok: true, serverNow: now.toISOString() });
  } catch (err) {
    next(err);
  }
});


router.post("/offline", presenceHeartbeatLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const now = new Date();


    const watcherUserIds = await listPresenceWatcherUserIds(userId);


    await publishPresenceToUsers({
      watcherUserIds,
      subjectUserId: userId,
      online: false,
      at: now.toISOString(),
    });


    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


export default router;


