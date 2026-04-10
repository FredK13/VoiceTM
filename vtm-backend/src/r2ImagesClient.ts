// src/r2ImagesClient.ts
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";


function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}


export const r2ImagesBucketName = mustEnv("R2_IMAGES_BUCKET_NAME");


// ✅ Use your per-bucket token keys (Option B)
export const r2ImagesClient = new S3Client({
  region: "auto",
  endpoint: `https://${mustEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: mustEnv("R2_IMAGES_ACCESS_KEY_ID"),
    secretAccessKey: mustEnv("R2_IMAGES_SECRET_ACCESS_KEY"),
  },
});


// -------------------------
// ✅ Prefix-level enforcement (chef's kiss)
// -------------------------
function assertAllowedImageKey(key: string) {
  // lock to only avatars/*
  if (!key.startsWith("avatars/")) {
    throw new Error(`Blocked key outside allowed prefix: ${key}`);
  }
}


// Generate unguessable avatar key
export function makeAvatarKey(params: { userId: string; ext: string }) {
  const { userId, ext } = params;
  const rand = crypto.randomBytes(16).toString("hex"); // 32 chars ~ 128 bits
  return `avatars/${userId}/${rand}.${ext}`;
}


/**
 * Upload an avatar image to R2 (returns the key you stored).
 * NOTE: We do NOT return a public URL anymore.
 */
export async function uploadAvatarToR2(params: {
  key: string;
  contentType: string;
  body: Buffer | Uint8Array;
  cacheControl?: string;
}) {
  const { key, contentType, body, cacheControl } = params;
  assertAllowedImageKey(key);


  await r2ImagesClient.send(
    new PutObjectCommand({
      Bucket: r2ImagesBucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl ?? "private, max-age=0, no-cache",
    })
  );


  return key;
}


/** Delete avatar by key */
export async function deleteAvatarFromR2(key: string) {
  assertAllowedImageKey(key);


  await r2ImagesClient.send(
    new DeleteObjectCommand({
      Bucket: r2ImagesBucketName,
      Key: key,
    })
  );
}


/**
 * ✅ Safe delete: never throw if object is already missing, key is bad, etc.
 * Good for cleanup paths.
 */
export async function deleteAvatarFromR2Safe(key: string) {
  try {
    await deleteAvatarFromR2(key);
  } catch (err: any) {
    // If it fails, we just ignore (cleanup best-effort).
    // You can log if you want:
    // console.warn("deleteAvatarFromR2Safe failed:", err?.name ?? err);
  }
}


/**
 * ✅ Signed GET URL (short TTL).
 * This is what your app will put into <Image uri="...">.
 */
export async function signAvatarGetUrl(params: { key: string; expiresInSec?: number }) {
  const { key, expiresInSec = 300 } = params;
  assertAllowedImageKey(key);


  const cmd = new GetObjectCommand({
    Bucket: r2ImagesBucketName,
    Key: key,
  });


  // Signed URL works even when bucket is private
  return getSignedUrl(r2ImagesClient, cmd, { expiresIn: expiresInSec });
}