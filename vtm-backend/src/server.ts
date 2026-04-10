// src/server.ts
import "dotenv/config";


import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import rejoinRouter from "./routes/rejoin";


import contactsRouter from "./routes/contacts";
import authRouter from "./routes/auth";
import conversationsRouter from "./routes/conversations";
import messagesRouter from "./routes/messages";
import meVoiceRouter from "./routes/meVoice";
import meRouter from "./routes/me";
import meEmoji from "./routes/meEmoji";
import realtimeRouter from "./routes/realtime";
import presenceRouter from "./routes/presence";

import { verifyMailerOnce } from "./utils/mailer";


const app = express();
app.set("trust proxy", 1);


app.use(helmet());


// Allow your site, and allow native apps (no Origin header)
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
);


app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-dev-guard"],
  })
);


app.use(express.json({ limit: "100kb"}));


const apiBaselineLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});


app.use("/api", apiBaselineLimiter);


app.get("/health", (_req, res) => res.json({ status: "ok", service: "yap-backend" }));


// --- DEV GUARD ---
function isAllowlistedPath(path: string) {
  return (
    path === "/health" ||
    path === "/api/auth/forgot-password" ||
    path === "/api/auth/reset-password"
  );
}

function getReqHost(req: express.Request) {
  const xfHost = (req.headers["x-forwarded-host"] ?? "").toString().split(",")[0].trim();
  const host = (xfHost || req.headers.host || "").toString();
  return host.split(":")[0];
}

app.use((req, res, next) => {
  const enabled = process.env.DEV_GUARD_ENABLED === "true";
  if (!enabled) return next();

  const guardedHosts = new Set(
    (process.env.DEV_GUARD_HOSTS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  );

  if (guardedHosts.size > 0) {
    const reqHost = getReqHost(req);
    if (!guardedHosts.has(reqHost)) return next();
  }

  if (req.method === "OPTIONS") return next();
  if (isAllowlistedPath(req.path)) return next();

  const secret = process.env.DEV_GUARD_SECRET;
  if (!secret) return res.status(500).json({ error: "Server misconfigured" });

  const hdr = (req.headers["x-dev-guard"] ?? "").toString();
  if (hdr !== secret) return res.status(403).json({ error: "Forbidden" });

  next();
});


app.use((req, _res, next) => {
  const xf = String(req.headers["x-forwarded-for"] ?? "");
  const ip = xf.split(",")[0].trim() || req.ip || "unknown";
  console.log(
    `[${new Date().toISOString()}] ${ip} ${req.method} ${req.originalUrl}`
  );
  next();
});


// --- Routers ---
app.use("/api/auth", authRouter);


// ✅ realtime token minting (requires auth)
app.use("/api/realtime", realtimeRouter);

app.use("/api/presence", presenceRouter);
app.use("/api/me", meVoiceRouter);
app.use("/api/me", meEmoji);
app.use("/api/me", meRouter);


app.use("/api/conversations", conversationsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/rejoin", rejoinRouter);

// ✅ contacts router includes: contacts + contact invites + presence + block
app.use("/api/contacts", contactsRouter);


const PORT = Number(process.env.PORT || 4000);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
      ? err.statusCode
      : 500;


  const publicMessage =
    status >= 500 ? "Server error" : typeof err?.message === "string" && err.message ? err.message : "Request failed";


  const logMessage = status >= 500 ? "Unhandled server error" : "Request error";
  console.error(logMessage, {
    status,
    message: err?.message,
    code: err?.code,
  });


  return res.status(status).json({
    error: publicMessage,
  });
});


app.listen(PORT, async () => {
  console.log(`🚀 Yap backend listening on http://localhost:${PORT}`);
  try {
    await verifyMailerOnce();
  } catch (e) {
    console.warn("⚠️ Mailer not ready:", (e as Error)?.message ?? e);
  }
});

