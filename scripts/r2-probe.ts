import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
  if (!existsSync(p)) throw new Error("no .env");
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

loadEnv();

const keys = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

for (const k of keys) {
  const v = process.env[k] ?? "";
  console.log(
    k,
    `len=${v.length}`,
    `prefix=${v.slice(0, 4)}…`,
    `suffix=…${v.slice(-4)}`,
    `hasWhitespace=${/\s/.test(v)}`,
  );
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,
});

try {
  const buckets = await client.send(new ListBucketsCommand({}));
  console.log(
    "ListBuckets OK",
    buckets.Buckets?.map((b) => b.Name),
  );
} catch (e) {
  const err = e as Error & { Code?: string };
  console.log("ListBuckets FAIL", err.name, err.Code, err.message);
}

try {
  const list = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      MaxKeys: 5,
    }),
  );
  console.log(
    "ListObjects OK",
    list.KeyCount,
    list.Contents?.map((c) => c.Key),
  );
} catch (e) {
  const err = e as Error & { Code?: string };
  console.log("ListObjects FAIL", err.name, err.Code, err.message);
}

try {
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: "healthcheck/phase2-probe.txt",
      Body: `ok ${Date.now()}`,
      ContentType: "text/plain",
    }),
  );
  console.log("PutObject OK");
} catch (e) {
  const err = e as Error & { Code?: string; $metadata?: unknown };
  console.log("PutObject FAIL", err.name, err.Code, err.message, err.$metadata);
}
