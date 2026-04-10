// src/routes/me.ts
import { Router } from "express";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import multer from "multer";
import {
  makeAvatarKey,
  signAvatarGetUrl,
  uploadAvatarToR2,
  deleteAvatarFromR2Safe,
} from "../r2ImagesClient";
import rateLimit from "express-rate-limit";


const router = Router();
router.use(requireAuth);

const avatarUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


const avatarDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
});


// GET /api/me
router.get("/", async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarUrl: true }, // avatarUrl stores KEY
    });


    if (!me) return res.status(404).json({ error: "User not found" });


    const avatarKey = me.avatarUrl;
    const signedAvatarUrl = avatarKey
      ? await signAvatarGetUrl({ key: avatarKey, expiresInSec: 300 })
      : null;


    return res.json({
      id: me.id,
      username: me.username,
      avatarUrl: signedAvatarUrl,
    });
  } catch (err) {
    next(err);
  }
});


// POST /api/me/avatar
router.post("/avatar", avatarUploadLimiter, upload.single("file"), async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const file = req.file;


    if (!file) return res.status(400).json({ error: "Missing file" });


    const ct = (file.mimetype || "").toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(ct)) {
      return res.status(400).json({ error: "Only jpg/png/webp allowed" });
    }


    const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";


    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    const oldKey = existing?.avatarUrl ?? null;


    const newKey = makeAvatarKey({ userId, ext });


    await uploadAvatarToR2({
      key: newKey,
      contentType: ct,
      body: file.buffer,
      cacheControl: "private, max-age=0, no-cache",
    });


    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: newKey },
    });


    // best-effort cleanup old
    if (oldKey && oldKey !== newKey) {
      deleteAvatarFromR2Safe(oldKey);
    }


    const signedAvatarUrl = await signAvatarGetUrl({ key: newKey, expiresInSec: 300 });
    return res.json({ avatarUrl: signedAvatarUrl });
  } catch (err) {
    next(err);
  }
});


// DELETE /api/me/avatar (trash button)
router.delete("/avatar", avatarDeleteLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });


    const oldKey = existing?.avatarUrl ?? null;


    // DB first
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });


    // best-effort delete from R2
    if (oldKey) {
      await deleteAvatarFromR2Safe(oldKey);
    }


    return res.json({ avatarUrl: null });
  } catch (err) {
    next(err);
  }
});


export default router;

