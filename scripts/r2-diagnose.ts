/**
 * Diagnose Cloudflare R2 credentials without printing secrets.
 * Usage: bun run scripts/r2-diagnose.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  ListBucketsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
  if (!existsSync(p)) throw new Error("Missing .env at repo root");
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

const accountId = process.env.R2_ACCOUNT_ID ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
const bucket = process.env.R2_BUCKET ?? "";
const publicBase = process.env.R2_PUBLIC_BASE_URL ?? "";

console.log("=== R2 env shape (no secrets) ===");
console.log({
  R2_ACCOUNT_ID: {
    set: Boolean(accountId),
    len: accountId.length,
    // Cloudflare account IDs are typically 32 hex chars
    looksLikeHex32: /^[a-f0-9]{32}$/i.test(accountId),
    prefix: accountId.slice(0, 4),
  },
  R2_ACCESS_KEY_ID: {
    set: Boolean(accessKeyId),
    len: accessKeyId.length,
    // R2 tokens are often 32 hex
    looksLikeHex32: /^[a-f0-9]{32}$/i.test(accessKeyId),
  },
  R2_SECRET_ACCESS_KEY: {
    set: Boolean(secretAccessKey),
    len: secretAccessKey.length,
    // often 64 chars
    looksOk: secretAccessKey.length >= 40,
  },
  R2_BUCKET: bucket || "(empty)",
  R2_PUBLIC_BASE_URL: publicBase
    ? {
        set: true,
        isHttps: publicBase.startsWith("https://"),
        isR2Dev: publicBase.includes(".r2.dev"),
        hasTrailingSlash: publicBase.endsWith("/"),
      }
    : { set: false },
  STORAGE_BACKEND: process.env.STORAGE_BACKEND ?? "(unset → dev uses local)",
});

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("\nFAIL: Missing one or more required R2 vars.");
  process.exit(1);
}

const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
console.log("\nEndpoint:", endpoint);

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: false,
});

async function tryCmd(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    console.log(`OK  ${name}`, result ?? "");
    return true;
  } catch (e) {
    const err = e as Error & {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    console.log(
      `FAIL ${name}:`,
      err.name,
      err.Code ?? "",
      `http=${err.$metadata?.httpStatusCode ?? "?"}`,
      err.message?.slice(0, 200),
    );
    return false;
  }
}

console.log("\n=== API probes ===");
await tryCmd("ListBuckets", async () => {
  const r = await client.send(new ListBucketsCommand({}));
  return {
    buckets: r.Buckets?.map((b) => b.Name) ?? [],
  };
});

await tryCmd("HeadBucket", async () => {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  return { bucket };
});

await tryCmd("ListObjectsV2 (MaxKeys=3)", async () => {
  const r = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 3 }),
  );
  return {
    keyCount: r.KeyCount,
    sample: r.Contents?.map((c) => c.Key) ?? [],
  };
});

const probeKey = `healthcheck/examgpt-r2-probe-${Date.now()}.txt`;
const putOk = await tryCmd("PutObject", async () => {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: probeKey,
      Body: `examgpt r2 probe ${new Date().toISOString()}`,
      ContentType: "text/plain",
    }),
  );
  return { key: probeKey };
});

if (putOk) {
  await tryCmd("GetObject", async () => {
    const r = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: probeKey }),
    );
    const text = await r.Body?.transformToString();
    return { bytes: text?.length };
  });
  await tryCmd("DeleteObject (cleanup)", async () => {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }),
    );
    return { deleted: probeKey };
  });
}

console.log(`
=== How to fix AccessDenied ===
1. Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create token with permissions: Object Read & Write (and Bucket Lookup if you need ListBuckets)
3. Scope it to bucket "${bucket}" (or allow all buckets in the account)
4. Copy the Access Key ID + Secret Access Key into .env (no quotes/spaces)
5. R2_ACCOUNT_ID must be the Cloudflare account id (Overview page, 32-char hex),
   NOT the token id and NOT the zone id
6. Bucket name must match exactly (case-sensitive): currently "${bucket}"
7. After fixing keys, set in .env:
     STORAGE_BACKEND=r2
   then restart the server

Common mistakes:
- Using Account API token instead of R2 API token
- Token only has Read, not Write
- Token scoped to a different bucket
- Wrong account id (copy from R2 → Overview → Account ID)
- Extra quotes/newlines when pasting secret
`);
