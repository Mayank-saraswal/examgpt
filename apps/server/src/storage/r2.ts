import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageAdapter } from "@examgpt/api";
import { env } from "../env";

function requireR2() {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET
  ) {
    return null;
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  };
}

export function createR2Storage(): StorageAdapter | null {
  const cfg = requireR2();
  if (!cfg) return null;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  return {
    async presignPut({ key, mimeType }) {
      const command = new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        ContentType: mimeType,
      });
      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: 60 * 15,
      });
      const publicUrl = cfg.publicBaseUrl
        ? `${cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`
        : null;
      return { uploadUrl, publicUrl };
    },
    async presignGet(key) {
      const command = new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      });
      return getSignedUrl(client, command, { expiresIn: 60 * 30 });
    },
    async headObject(key) {
      try {
        const res = await client.send(
          new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
        );
        return {
          contentLength: res.ContentLength ?? 0,
          contentType: res.ContentType,
        };
      } catch {
        return null;
      }
    },
    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
      );
    },
  };
}
