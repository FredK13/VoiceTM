// src/routes/meVoice.ts
import { Router } from "express";
import prisma from "../prismaClient";
import { requireAuth, requireUserId } from "../middleware/requireAuth";
import FormData from "form-data";
import multer from "multer";
import axios from "axios";
import rateLimit from "express-rate-limit";


import {
  listKeysFromR2,
  getObjectFromR2,
  uploadObjectToR2,
  deletePrefixFromR2,
} from "../r2Client";
import { encryptAudio, decryptAudio } from "../utils/audioCrypto";


const router = Router();
router.use(requireAuth);

const voiceResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


const voiceSampleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


const voiceCommitLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 4,
  keyGenerator: (req: any) => `uid:${req.userId ?? "missing"}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


/**
 * Multer parses multipart/form-data uploads.
 * memoryStorage keeps the uploaded file in RAM as req.file.buffer.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});


// ---- Voice sample requirements ----
const REQUIRED_MS = 90_000; // 1:30
const MAX_MS_PER_SAMPLE = 120_000; // anti-spoof ceiling
const MAX_FILES_TO_SEND = 25;


function voiceSamplesPrefix(userId: string) {
  return `voices/${userId}/samples/`;
}


async function deleteElevenLabsVoiceIfExists(
  voiceId: string | null | undefined,
  apiKey: string
) {
  if (!voiceId) return;


  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey } as any,
    });


    // 200/204/404 are all "fine" for our purposes
    if (!resp.ok && resp.status !== 404) {
      const txt = await resp.text().catch(() => "");
      console.warn("ElevenLabs delete voice failed:", resp.status, txt);
    }
  } catch (e) {
    console.warn("ElevenLabs delete voice threw:", e);
  }
}


/**
 * Hard reset a user's voice state:
 * - delete all R2 samples
 * - delete ElevenLabs voice
 * - reset DB fields
 */
async function resetUserVoice(userId: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");


  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, elevenLabsVoiceId: true },
  });
  if (!user) return;


  // 1) delete R2 samples
  const prefix = voiceSamplesPrefix(userId);
  try {
    await deletePrefixFromR2(prefix);
  } catch (e) {
    console.warn("R2 prefix delete failed:", prefix, e);
  }


  // 2) delete ElevenLabs voice
  await deleteElevenLabsVoiceIfExists(user.elevenLabsVoiceId, apiKey);


  // 3) reset DB fields
  await prisma.user.update({
    where: { id: userId },
    data: {
      voiceSampleMs: 0,
      elevenLabsVoiceId: null,
      voiceStatus: "NONE",
    },
  });
}


/**
 * POST /api/me/voice/reset
 * Called by the app when user taps "Start Recording"
 */
router.post("/voice/reset", voiceResetLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    await resetUserVoice(userId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/me/voice/sample (protected)
 * Receives ONE audio sample from the app, encrypts it, and stores it in R2.
 *
 * Behavior:
 * - We DO NOT auto-reset here anymore, because your app already calls /voice/reset
 *   before starting recording.
 */
router.post("/voice/sample", voiceSampleLimiter, upload.single("file"), async (req, res, next) => {
    try {
      const userId = requireUserId(req);


      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, voiceSampleMs: true },
      });
      if (!user) return res.status(404).json({ error: "User not found" });


      if (!req.file) {
        return res
          .status(400)
          .json({ error: "Missing file. Upload field name must be 'file'." });
      }


      // durationMs from client (Expo durationMillis)
      const durationMsRaw = (req.body?.durationMs ?? "").toString();
      const parsed = durationMsRaw ? Number(durationMsRaw) : NaN;


      // sanitize + clamp (anti-spoof)
      let durationMs =
        Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
      if (durationMs < 0) durationMs = 0;
      if (durationMs > MAX_MS_PER_SAMPLE) durationMs = MAX_MS_PER_SAMPLE;


      const encrypted = encryptAudio(req.file.buffer);


      const originalName = (req.file.originalname || "sample.m4a").replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );


      const objectKey = `${voiceSamplesPrefix(userId)}${Date.now()}-${originalName}.enc`;


      await uploadObjectToR2({
        key: objectKey,
        body: encrypted,
        contentType: "application/octet-stream",
      });


      const nextMs = (user.voiceSampleMs ?? 0) + durationMs;


      await prisma.user.update({
        where: { id: userId },
        data: {
          voiceSampleMs: nextMs,
          voiceStatus: "COLLECTING",
        },
      });


      return res.status(201).json({
        ok: true,
        durationMsAdded: durationMs,
        voiceSampleMs: nextMs,
      });
    } catch (err) {
      next(err);
    }
  }
);


/**
 * POST /api/me/voice/commit (protected)
 * Decrypts samples from R2 and uploads to ElevenLabs to create a new voice.
 *
 * After successful training:
 * - deletes all samples in R2
 * - resets voiceSampleMs to 0
 */
router.post("/voice/commit", voiceCommitLimiter, async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        voiceSampleMs: true,
        voiceStatus: true,
        elevenLabsVoiceId: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });


    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY" });
    }


    const totalMs = user.voiceSampleMs ?? 0;
    if (totalMs < REQUIRED_MS) {
      return res.status(400).json({
        error: "Not enough audio yet (need >= 90s)",
        voiceSampleMs: totalMs,
        requiredMs: REQUIRED_MS,
      });
    }


    // Fail-safe: delete old ElevenLabs voice before creating a new one
    await deleteElevenLabsVoiceIfExists(user.elevenLabsVoiceId, apiKey);


    // mark training
    await prisma.user.update({
      where: { id: userId },
      data: { voiceStatus: "TRAINING", elevenLabsVoiceId: null },
    });


    // list sample keys
    const prefix = voiceSamplesPrefix(userId);
    const allKeys = await listKeysFromR2({ prefix });


    const keys = allKeys
      .filter((k) => k.toLowerCase().endsWith(".enc"))
      .slice(0, MAX_FILES_TO_SEND);


    if (keys.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { voiceStatus: "ERROR" },
      });
      return res.status(400).json({ error: "No voice samples found in storage" });
    }


    // build multipart
    const formData = new FormData();
    formData.append("name", `YapUser_${user.id.slice(0, 8)}`);
    formData.append("description", "Yap user voice");


    // optional: only enable if you actually have noisy samples
    formData.append("remove_background_noise", "false");


    // optional labels (must be string or JSON string)
    formData.append(
      "labels",
      JSON.stringify({
        language: "en",
        accent: "american",
      })
    );


    let attached = 0;


    for (const key of keys) {
      const encryptedBuf = await getObjectFromR2(key);
      const decryptedBuf = decryptAudio(encryptedBuf);


      const encName = key.split("/").pop() || `sample-${attached}.m4a.enc`;
      const filename =
        encName.replace(/\.enc$/i, "") || `sample-${attached}.m4a`;


      const lower = filename.toLowerCase();
      const contentType =
        lower.endsWith(".mp3")
          ? "audio/mpeg"
          : lower.endsWith(".wav")
          ? "audio/wav"
          : lower.endsWith(".m4a") || lower.endsWith(".mp4")
          ? "audio/mp4"
          : "application/octet-stream";


      // IMPORTANT: knownLength helps multipart parsers
      formData.append("files", decryptedBuf, {
        filename,
        contentType,
        knownLength: decryptedBuf.length,
      });


      attached++;
    }


    if (attached === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { voiceStatus: "ERROR" },
      });
      return res.status(400).json({ error: "No samples attached" });
    }


    // ✅ IVC Create Voice Clone endpoint (same path your doc shows)
    const resp = await axios.post(
      "https://api.elevenlabs.io/v1/voices/add",
      formData,
      {
        headers: {
          "xi-api-key": apiKey,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60_000,
        validateStatus: () => true,
      }
    );


    if (resp.status < 200 || resp.status >= 300) {
      const elevenText =
        typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);


      console.error("ElevenLabs voice add failed:", resp.status, elevenText);


      await prisma.user.update({
        where: { id: userId },
        data: { voiceStatus: "ERROR" },
      });


      return res.status(500).json({
        error: "Voice training failed",
        elevenStatus: resp.status,
        ...(process.env.NODE_ENV !== "production" ? { elevenError: elevenText } : {}),
      });
    }


    const voiceId = (resp.data as any)?.voice_id as string | undefined;
    const requiresVerification = !!(resp.data as any)?.requires_verification;


    if (!voiceId) {
      const elevenText =
        typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);


      await prisma.user.update({
        where: { id: userId },
        data: { voiceStatus: "ERROR" },
      });


      return res.status(500).json({
        error: "Voice training failed",
        elevenStatus: resp.status,
        ...(process.env.NODE_ENV !== "production" ? { elevenError: elevenText } : {}),
      });
    }


    // persist voice_id + status
    await prisma.user.update({
      where: { id: userId },
      data: {
        elevenLabsVoiceId: voiceId,
        voiceStatus: requiresVerification ? "PENDING_VERIFICATION" : "READY",
        voiceSampleMs: 0,
      },
    });


    // delete samples after success (quota protection)
    try {
      await deletePrefixFromR2(prefix);
    } catch (e) {
      console.warn("R2 cleanup after commit failed:", prefix, e);
    }


    return res.json({
      ok: true,
      samplesUsed: attached,
      requiresVerification,
    });
  } catch (err) {
    next(err);
  }
});


export default router;

