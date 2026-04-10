// src/utils/piiCrypto.ts
import crypto from "crypto";


const ENC_ALG = "aes-256-gcm";
const ENC_IV_LEN = 12;
const ENC_TAG_LEN = 16;


function mustGetB64(name: string, bytes: number) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  const buf = Buffer.from(v.trim(), "base64");
  if (buf.length !== bytes) throw new Error(`${name} must decode to ${bytes} bytes`);
  return buf;
}


function encKey() {
  // 32 bytes
  return mustGetB64("PII_ENC_KEY_B64", 32);
}


function hmacKey() {
  // 32 bytes (or 64 is fine too, but be consistent)
  return mustGetB64("PII_HMAC_KEY_B64", 32);
}


export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}


export function normalizeUsername(username: string) {
  // lower + trim for case-insensitive uniqueness/login
  return username.trim().toLowerCase();
}


export function validateUsername(username: string) {
  // 3–20 chars, letters/numbers/underscore, must start with letter/number
  return /^[a-z0-9][a-z0-9_]{2,19}$/i.test(username.trim());
}


export function encryptPII(plain: string): string {
  const key = encKey();
  const iv = crypto.randomBytes(ENC_IV_LEN);


  const cipher = crypto.createCipheriv(ENC_ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();


  // store as base64 parts: iv.tag.cipher
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}


export function decryptPII(blob: string): string {
  const key = encKey();
  const [ivB64, tagB64, ctB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Invalid PII blob");


  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");

  if (iv.length !== ENC_IV_LEN) throw new Error("Invalid PII IV");
  if (tag.length !== ENC_TAG_LEN) throw new Error("Invalid PII auth tag");
  if (ct.length === 0) throw new Error("Invalid PII ciphertext");


  const decipher = crypto.createDecipheriv(ENC_ALG, key, iv);
  decipher.setAuthTag(tag);


  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}


export function hashPIIForLookup(normalized: string): string {
  const key = hmacKey();
  return crypto.createHmac("sha256", key).update(normalized, "utf8").digest("hex");
}
