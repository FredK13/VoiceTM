import { Router } from "express";
import prisma from "../prismaClient";
import { FakeBubbleSlot } from "@prisma/client";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import rateLimit from "express-rate-limit";


const router = Router();


const fakeBubbleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


function param1(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}


function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}


const FAKE_BUBBLE_SLOTS: FakeBubbleSlot[] = [
  FakeBubbleSlot.SLOT_1,
  FakeBubbleSlot.SLOT_2,
  FakeBubbleSlot.SLOT_3,
  FakeBubbleSlot.SLOT_4,
];


function firstOpenSlot(usedSlots: FakeBubbleSlot[]): FakeBubbleSlot | null {
  const used = new Set(usedSlots);
  for (const slot of FAKE_BUBBLE_SLOTS) {
    if (!used.has(slot)) return slot;
  }
  return null;
}


/**
 * GET /api/fake-bubbles
 * Returns all fake bubbles owned by the logged-in user.
 */
router.get("/", requireAuth, fakeBubbleLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const rows = await prisma.fakeBubble.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        slot: true,
        x: true,
        y: true,
        vx: true,
        vy: true,
        size: true,
        createdAt: true,
        updatedAt: true,
      },
    });


    return res.json(rows);
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/fake-bubbles
 * Creates a fake bubble for the logged-in user.
 * Body: { x, y, vx, vy, size }
 */
router.post("/", requireAuth, fakeBubbleLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);


    const x = toFiniteNumber((req.body as any)?.x);
    const y = toFiniteNumber((req.body as any)?.y);
    const vx = toFiniteNumber((req.body as any)?.vx);
    const vy = toFiniteNumber((req.body as any)?.vy);
    const size = toFiniteNumber((req.body as any)?.size);


    if (
      x === null ||
      y === null ||
      vx === null ||
      vy === null ||
      size === null
    ) {
      return res.status(400).json({ error: "Invalid bubble payload" });
    }


    const existing = await prisma.fakeBubble.findMany({
      where: { userId },
      select: { slot: true },
    });


    const slot = firstOpenSlot(existing.map((row) => row.slot));


    if (!slot) {
      return res.status(400).json({
        error: "Maximum fake bubbles reached",
        code: "FAKE_BUBBLE_LIMIT_REACHED",
      });
    }


    const bubble = await prisma.fakeBubble.create({
      data: {
        userId,
        slot,
        x,
        y,
        vx,
        vy,
        size,
      },
      select: {
        id: true,
        userId: true,
        slot: true,
        x: true,
        y: true,
        vx: true,
        vy: true,
        size: true,
        createdAt: true,
        updatedAt: true,
      },
    });


    return res.status(201).json(bubble);
  } catch (err: any) {
    // Nice fallback if two fast requests race for the same slot
    if (err?.code === "P2002") {
      return res.status(400).json({
        error: "Maximum fake bubbles reached",
        code: "FAKE_BUBBLE_LIMIT_REACHED",
      });
    }
    next(err);
  }
});


/**
 * DELETE /api/fake-bubbles/:id
 * Deletes one of my fake bubbles only.
 */
router.delete("/:id", requireAuth, fakeBubbleLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const id = param1((req.params as any)?.id);


    if (!id) {
      return res.status(400).json({ error: "Invalid bubble id" });
    }


    const existing = await prisma.fakeBubble.findFirst({
      where: {
        id,
        userId,
      },
      select: { id: true },
    });


    if (!existing) {
      return res.status(404).json({ error: "Fake bubble not found" });
    }


    await prisma.fakeBubble.delete({
      where: { id },
    });


    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


export default router;


