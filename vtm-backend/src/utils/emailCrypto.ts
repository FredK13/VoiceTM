// src/utils/emailCrypto.ts
import { encryptPII, decryptPII, hashPIIForLookup, normalizeEmail } from "./piiCrypto";


export function normalizeEmailStrict(email: string) {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return "";
  return e;
}


export function hashEmail(normalizedEmail: string) {
  return hashPIIForLookup(normalizedEmail);
}


export function encryptEmail(normalizedEmail: string) {
  return encryptPII(normalizedEmail);
}


export function decryptEmail(emailEnc: string) {
  return decryptPII(emailEnc);
}
