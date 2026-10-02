import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mediaConfig } from "../config/media.js";

let client: S3Client | null = null;

function s3(): S3Client {
  if (!mediaConfig.enabled) {
    throw new Error("Media storage is not configured (AWS S3 env vars missing).");
  }
  if (!client) {
    client = new S3Client({
      region: mediaConfig.region,
      credentials: {
        accessKeyId: mediaConfig.accessKeyId,
        secretAccessKey: mediaConfig.secretAccessKey,
      },
    });
  }
  return client;
}

export function isMediaStorageEnabled(): boolean {
  return mediaConfig.enabled;
}

export function channelMediaMaxBytes(): number {
  return mediaConfig.maxBytes;
}

/** @deprecated use channelMediaMaxBytes */
export const whatsappMediaMaxBytes = channelMediaMaxBytes;

export async function putObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: mediaConfig.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<{
  body: Buffer;
  contentType?: string;
}> {
  const res = await s3().send(
    new GetObjectCommand({
      Bucket: mediaConfig.bucket,
      Key: key,
    }),
  );
  const stream = res.Body;
  if (!stream) throw new Error("Empty S3 object");
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return {
    body: Buffer.concat(chunks),
    contentType: res.ContentType,
  };
}

export async function signedGetUrl(key: string, expiresSec = 3600): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: mediaConfig.bucket, Key: key }),
    { expiresIn: expiresSec },
  );
}

export function channelMediaKey(
  channelType: string,
  customerId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120) || "file";
  return `media/${channelType}/${customerId}/${Date.now()}_${safe}`;
}

/** @deprecated use channelMediaKey */
export function whatsappMediaKey(customerId: string, filename: string): string {
  return channelMediaKey("whatsapp", customerId, filename);
}
