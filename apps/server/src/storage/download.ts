import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";
import { readLocalObject } from "./local";

export async function downloadDocumentBytes(fileKey: string): Promise<Buffer> {
  const local = await readLocalObject(fileKey);
  if (local) return local;

  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET
  ) {
    throw new Error("Document bytes not found locally and R2 is not configured");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  const res = await client.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: fileKey }),
  );
  const body = res.Body;
  if (!body) throw new Error("Empty R2 object body");
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes);
}
