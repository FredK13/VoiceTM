import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";


declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}


export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;


  if (!hdr || !hdr.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth" });
  }


  const token = hdr.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Missing auth" });
  }


  const secret = process.env.JWT_SECRET;


  if (!secret) {
    console.error("JWT_SECRET is not set. Refusing auth.");
    return res.status(500).json({ error: "Server misconfigured" });
  }


  try {
    const payload = jwt.verify(token, secret) as { userId?: string };


    if (!payload?.userId) {
      return res.status(401).json({ error: "Invalid token" });
    }


    req.userId = payload.userId;
    next();
  } catch (err) {
    console.warn("JWT verification failed:", (err as Error)?.message ?? "unknown");
    return res.status(401).json({ error: "Invalid token" });
  }
}


export function requireUserId(req: Request): string {
  if (!req.userId) {
    throw new Error("userId missing on authenticated request");
  }
  return req.userId;
}
