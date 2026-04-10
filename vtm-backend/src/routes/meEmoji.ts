// src/routes/meEmoji.ts
import express from "express";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import prisma from "../prismaClient";
import rateLimit from "express-rate-limit";



const router = express.Router();
router.use(requireAuth);

const emojiWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const MAX_EMOJI_KEYS = 64;
const MAX_EMOJI_PHRASE_LEN = 35;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);


function sanitizeEmojiMapping(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;


  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_EMOJI_KEYS) return null;


  const out: Record<string, string> = Object.create(null);


  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey).trim();
    if (!key || FORBIDDEN_KEYS.has(key)) return null;
    if (typeof rawValue !== "string") return null;


    const value = rawValue.trim();
    if (!value) return null;
    if (value.length > MAX_EMOJI_PHRASE_LEN) return null;


    out[key] = value;
  }


  return out;
}

router.get("/emoji-phrases", async (req, res) => {
  try {
    const userId = requireUserId(req);


    const row = await prisma.emojiProfile.findUnique({
      where: { userId },
      select: { mapping: true, updatedAt: true },
    });


    const mapping =
      row?.mapping && typeof row.mapping === "object" && !Array.isArray(row.mapping)
        ? row.mapping
        : null;


    return res.json({
      mapping,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (e) {
    console.error("GET emoji-phrases failed:", e);
    return res.status(500).json({ error: "Server error" });
  }
});


router.put("/emoji-phrases", emojiWriteLimiter, async (req, res) => {
  try {
    const userId = requireUserId(req);
    const mapping = sanitizeEmojiMapping(req.body?.mapping);


    if (!mapping) {
      return res.status(400).json({ error: "Invalid mapping" });
    }


    const saved = await prisma.emojiProfile.upsert({
      where: { userId },
      create: { userId, mapping },
      update: { mapping },
      select: { mapping: true, updatedAt: true },
    });


    return res.json(saved);
  } catch (e) {
    console.error("PUT emoji-phrases failed:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
