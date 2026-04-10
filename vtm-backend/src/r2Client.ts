// src/r2Client.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import type { ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME_PRIVATE,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME_PRIVATE) {
  throw new Error("Missing R2_* env vars - check your .env file");
}

export const r2BucketName = R2_BUCKET_NAME_PRIVATE;

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a binary object into R2.
 */
export async function uploadObjectToR2(params: {
  key: string;
  contentType: string;
  body: Buffer | Uint8Array;
}) {
  const { key, contentType, body } = params;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Download a binary object from R2 by key (Buffer).
 */
export async function getObjectFromR2(key: string): Promise<Buffer> {
  const res = await r2Client.send(
    new GetObjectCommand({
      Bucket: r2BucketName,
      Key: key,
    })
  );

  const body = res.Body;
  if (!body) throw new Error("No body returned from R2");

  const chunks: Buffer[] = [];
  for await (const chunk of body as any as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Download an object as a Node stream.
 */
export async function getObjectStreamFromR2(
  key: string
): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
  const res = await r2Client.send(
    new GetObjectCommand({
      Bucket: r2BucketName,
      Key: key,
    })
  );

  const body = res.Body as any;
  if (!body) throw new Error("No body returned from R2");

  return {
    stream: body as Readable,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
  };
}

/**
 * List object keys under a prefix (paged).
 */
export async function listKeysFromR2(params: {
  prefix: string;
  maxKeys?: number;
}): Promise<string[]> {
  const { prefix, maxKeys = 1000 } = params;

  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const out: ListObjectsV2CommandOutput = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of out.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }

    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Delete an object.
 */
export async function deleteObjectFromR2(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: r2BucketName,
      Key: key,
    })
  );
}

/**
 * Batch delete keys (more efficient than 1-by-1).
 * S3/R2 supports up to 1000 objects per request.
 */
export async function deleteKeysFromR2(keys: string[]): Promise<void> {
  if (!keys.length) return;

  const CHUNK = 1000;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const batch = keys.slice(i, i + CHUNK);

    await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: r2BucketName,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
  }
}

/**
 * Delete EVERYTHING under a prefix (list + batch delete).
 * Example: await deletePrefixFromR2(`voices/${userId}/samples/`)
 */
export async function deletePrefixFromR2(prefix: string): Promise<number> {
  const keys = await listKeysFromR2({ prefix });
  if (!keys.length) return 0;

  await deleteKeysFromR2(keys);
  return keys.length;
}

/**
 * Head an object: check existence / size / type without downloading.
 */
export async function headObjectFromR2(key: string): Promise<{
  exists: boolean;
  contentType?: string;
  contentLength?: number;
}> {
  try {
    const res = await r2Client.send(
      new HeadObjectCommand({
        Bucket: r2BucketName,
        Key: key,
      })
    );

    return {
      exists: true,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    const name = err?.name;

    if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
      return { exists: false };
    }

    throw err;
  }
}
