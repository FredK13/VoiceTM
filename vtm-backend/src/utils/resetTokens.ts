// src/utils/resetTokens.ts
import crypto from "crypto";


function mustGetB64(name: string, bytes: number) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  const buf = Buffer.from(v.trim(), "base64");
  if (buf.length !== bytes) throw new Error(`${name} must decode to ${bytes} bytes`);
  return buf;
}


function resetHmacKey() {
  return mustGetB64("RESET_TOKEN_HMAC_KEY_B64", 32);
}


export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}


export function hashResetToken(token: string): string {
  const key = resetHmacKey();
  return crypto.createHmac("sha256", key).update(token, "utf8").digest("hex");
}
 