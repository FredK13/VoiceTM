// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prismaClient";

import {
  encryptPII,
  decryptPII,
  hashPIIForLookup,
  normalizeEmail,
  normalizeUsername,
  validateUsername,
} from "../utils/piiCrypto";

import { sendPasswordResetEmail } from "../utils/mailer";
import { generateResetToken, hashResetToken } from "../utils/resetTokens";

import { signAvatarGetUrl } from "../r2ImagesClient";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const router = Router();

// ✅ 3 per 24h per identifier (email/username); IPv6-safe IP fallback
const forgotByIdentifier24h = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,

  // ✅ Always return ok:true to avoid user enumeration
  message: { ok: true },

  keyGenerator: (req: any) => {
    const raw = String(req.body?.identifier ?? req.body?.email ?? "")
      .trim()
      .toLowerCase();

    // Prefer identifier-based limiting
    if (raw) return `fp:id:${raw}`;

    // Fallback to IP-based limiting (IPv6-safe)
    return `fp:ip:${ipKeyGenerator(req)}`;
  },
});

// ✅ Backup: stop spamming random identifiers from one IP (IPv6-safe)
const forgotByIp24h = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 30, // tune this
  standardHeaders: true,
  legacyHeaders: false,

  // ✅ Still return ok:true (do not leak)
  message: { ok: true },

  keyGenerator: (req: any) => `fp:ip:${ipKeyGenerator(req)}`,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `signup:ip:${ipKeyGenerator(req)}`,
  message: { error: "Too many signups from this IP" },
});


const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `login:ip:${ipKeyGenerator(req)}`,
  message: { error: "Too many login attempts" },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,                  // tune as needed
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `rp:ip:${ipKeyGenerator(req)}`,
  message: { error: "Too many reset attempts" },
});


function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function signToken(userId: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign({ userId }, secret, { expiresIn: "30d" });
}

function isLikelyEmail(s: string) {
  return s.includes("@");
}

const publicUserSelect = {
  id: true,
  username: true,
  avatarUrl: true, // DB field (now treated as key)
} as const;

// Helper: DB stores avatar KEY (avatars/...), API returns signed URL or null
async function maybeSignAvatar(avatarKey: string | null | undefined) {
  if (!avatarKey) return null;
  if (!avatarKey.startsWith("avatars/")) return avatarKey; // safety if legacy URL exists
  return signAvatarGetUrl({ key: avatarKey, expiresInSec: 300 });
}

// POST /api/auth/signup { email, username, password, confirmPassword }
router.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    const { email, username, password, confirmPassword } = req.body as {
      email?: string;
      username?: string;
      password?: string;
      confirmPassword?: string;
    };

    const betaEnabled = process.env.BETA_GATE_ENABLED === "true";
if (betaEnabled) {
  const raw = (process.env.BETA_ALLOWLIST_EMAILS || "").trim();
  const allow = new Set(raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));


  const emailLc = String(email || "").trim().toLowerCase();
  if (!allow.has(emailLc)) {
    return res.status(403).json({ error: "Not in beta allowlist" });
  }
}

    if (!email || !username || !password || !confirmPassword) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const normalizedEmail = normalizeEmail(email);
    const usernameNorm = normalizeUsername(username);

    if (!normalizedEmail || !usernameNorm) {
      return res.status(400).json({ error: "Invalid fields" });
    }

    if (!validateUsername(username)) {
      return res.status(400).json({
        error: "Username must be 3-20 chars and contain only letters, numbers, underscore",
      });
    }

    const emailHash = hashPIIForLookup(normalizedEmail);
    const emailEnc = encryptPII(normalizedEmail);

    const [emailTaken, usernameTaken] = await Promise.all([
      prisma.user.findUnique({ where: { emailHash }, select: { id: true } }),
      prisma.user.findUnique({ where: { usernameNorm }, select: { id: true } }),
    ]);

    if (emailTaken) return res.status(409).json({ error: "Email already in use" });
    if (usernameTaken) return res.status(409).json({ error: "Username already in use" });

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        usernameNorm,
        emailEnc,
        emailHash,
        passwordHash,
        // avatarUrl remains null until set by /api/me/avatar
      },
      select: publicUserSelect,
    });

    const token = signToken(user.id);

    const signedAvatarUrl = await maybeSignAvatar(user.avatarUrl ?? null);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: signedAvatarUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login { identifier, password }
router.post("/login", loginLimiter, async (req, res, next) => {
  try {

    const identifier = (req.body?.identifier ?? "").toString().trim();
    const password = (req.body?.password ?? "").toString();

    if (!identifier || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const user = isLikelyEmail(identifier)
      ? await (async () => {
          const normalizedEmail = normalizeEmail(identifier);
          if (!normalizedEmail) return null;

          const emailHash = hashPIIForLookup(normalizedEmail);
          return prisma.user.findUnique({
            where: { emailHash },
            select: { ...publicUserSelect, passwordHash: true },
          });
        })()
      : await (async () => {
          const usernameNorm = normalizeUsername(identifier);
          if (!usernameNorm) return null;

          return prisma.user.findUnique({
            where: { usernameNorm },
            select: { ...publicUserSelect, passwordHash: true },
          });
        })();

    if (!user) return res.status(401).json({ error: "Invalid login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid login" });

    const token = signToken(user.id);

    const signedAvatarUrl = await maybeSignAvatar(user.avatarUrl ?? null);

    // strip passwordHash before returning
    return res.json({
      token,
      user: { id: user.id, username: user.username, avatarUrl: signedAvatarUrl },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password { identifier }
// ✅ Always return { ok: true } (no user enumeration)
router.post("/forgot-password", forgotByIp24h, forgotByIdentifier24h, async (req, res) => {
  const identifier = (req.body?.identifier ?? req.body?.email ?? "").toString().trim();

  // Always return ok immediately
  res.json({ ok: true });

  try {
    if (!identifier) return;

    let user: { id: string; emailEnc: string | null } | null = null;

    if (isLikelyEmail(identifier)) {
      const normalizedEmail = normalizeEmail(identifier);
      if (!normalizedEmail) return;

      const emailHash = hashPIIForLookup(normalizedEmail);
      user = await prisma.user.findUnique({
        where: { emailHash },
        select: { id: true, emailEnc: true },
      });
    } else {
      const usernameNorm = normalizeUsername(identifier);
      if (!usernameNorm) return;

      user = await prisma.user.findUnique({
        where: { usernameNorm },
        select: { id: true, emailEnc: true },
      });
    }

    if (!user?.emailEnc) return;

    const rawToken = generateResetToken();
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const appUrl = mustEnv("APP_PUBLIC_URL");
    const resetUrl = `${appUrl.replace(/\/+$/, "")}/reset/?token=${rawToken}`;

    const toEmail = decryptPII(user.emailEnc);
    await sendPasswordResetEmail({ to: toEmail, resetUrl });
  } catch (err: any) {
    console.warn("forgot-password: flow failed:", err?.message ?? err);
  }
});

// POST /api/auth/reset-password { token, newPassword }
router.post("/reset-password", resetPasswordLimiter, async (req, res, next) => {
  try {
    const token = (req.body?.token ?? "").toString().trim();
    const newPassword = (req.body?.newPassword ?? "").toString();

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const tokenHash = hashResetToken(token);

    const rec = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;