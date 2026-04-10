// src/utils/audioCrypto.ts
import crypto from "crypto";


/**
 * AES-256-GCM encryption for audio:
 * - 32-byte key (256-bit)
 * - 12-byte IV
 * - 16-byte auth tag
 *
 * Stored layout in R2:
 *   [ IV (12 bytes) | authTag (16 bytes) | ciphertext (...) ]
 */


const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12; // bytes
const TAG_LENGTH = 16; // bytes


function getKey(): Buffer {
  const base64Key = process.env.AUDIO_ENCRYPTION_KEY_BASE64;


  if (!base64Key) {
    throw new Error(
      "AUDIO_ENCRYPTION_KEY_BASE64 is not set. Add it to your backend .env."
    );
  }


  const key = Buffer.from(base64Key.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(
      `AUDIO_ENCRYPTION_KEY_BASE64 must decode to 32 bytes. Got ${key.length} bytes.`
    );
  }


  return key;
}


export function encryptAudio(plain: Buffer): Buffer {
  const KEY = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);


  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();


  return Buffer.concat([iv, authTag, ciphertext]);
}


export function decryptAudio(encrypted: Buffer): Buffer {
  const KEY = getKey();


  if (encrypted.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted audio blob is too short.");
  }


  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH + TAG_LENGTH);


  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);


  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
