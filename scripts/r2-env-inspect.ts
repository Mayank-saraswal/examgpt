import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const keys = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "STORAGE_BACKEND",
];

const envPath = resolve(import.meta.dir, "../.env");
const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const parsed: Record<string, string> = {};

console.log("=== Raw .env line inspection (no full secrets) ===");
for (const line of lines) {
  if (!line.includes("=") || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  if (!keys.includes(k)) continue;
  const v = line.slice(i + 1);
  const trimmed = v.trim();
  const hasDouble = trimmed.startsWith('"') && trimmed.endsWith('"');
  const hasSingle = trimmed.startsWith("'") && trimmed.endsWith("'");
  let val = trimmed;
  if (hasDouble || hasSingle) val = val.slice(1, -1);
  parsed[k] = val;
  console.log(k, {
    valueLen: val.length,
    quoted: hasDouble || hasSingle,
    leadingSpaceOnValue: v.length > 0 && v[0] === " ",
    trailingWhitespace: /\s$/.test(v),
    hasCR: v.includes("\r"),
    nonAscii: /[^\x20-\x7E]/.test(val),
    charCodesHead: [...val.slice(0, 4)].map((c) => c.charCodeAt(0)),
    charCodesTail: [...val.slice(-4)].map((c) => c.charCodeAt(0)),
  });
}

const accountId = parsed.R2_ACCOUNT_ID ?? "";
const accessKeyId = parsed.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = parsed.R2_SECRET_ACCESS_KEY ?? "";
const bucket = parsed.R2_BUCKET ?? "";

async function probe(label: string, endpoint: string, forcePathStyle: boolean) {
  console.log(`\n--- ${label} ---`);
  console.log("endpoint:", endpoint, "forcePathStyle:", forcePathStyle);
  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `healthcheck/probe-${Date.now()}.txt`,
        Body: "ok",
        ContentType: "text/plain",
      }),
    );
    console.log("PutObject: OK");
    return true;
  } catch (e) {
    const err = e as Error & {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number; requestId?: string };
      message?: string;
    };
    console.log(
      "PutObject FAIL:",
      err.name,
      err.Code,
      "http=" + (err.$metadata?.httpStatusCode ?? "?"),
      "reqId=" + (err.$metadata?.requestId ?? "none"),
      err.message?.slice(0, 180),
    );
    return false;
  }
}

const endpoints = [
  {
    label: "virtual-hosted (default)",
    url: `https://${accountId}.r2.cloudflarestorage.com`,
    pathStyle: false,
  },
  {
    label: "path-style",
    url: `https://${accountId}.r2.cloudflarestorage.com`,
    pathStyle: true,
  },
];

// jurisdiction endpoints sometimes needed
for (const j of ["", "eu", "wnam", "enam", "apac"] as const) {
  if (!j) continue;
  endpoints.push({
    label: `jurisdiction ${j}`,
    url: `https://${accountId}.${j}.r2.cloudflarestorage.com`,
    pathStyle: false,
  });
}

let anyOk = false;
for (const e of endpoints) {
  const ok = await probe(e.label, e.url, e.pathStyle);
  if (ok) {
    anyOk = true;
    break;
  }
}

// ListObjects also
console.log("\n--- ListObjects default endpoint ---");
try {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const r = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
  );
  console.log("ListObjects OK keyCount=", r.KeyCount);
} catch (e) {
  const err = e as Error & { Code?: string; message?: string };
  console.log("ListObjects FAIL", err.Code, err.message?.slice(0, 120));
}

console.log(
  anyOk
    ? "\nRESULT: R2 works with at least one endpoint config."
    : "\nRESULT: Still AccessDenied on all endpoint variants. Token/account/bucket permission issue remains.",
);
process.exit(anyOk ? 0 : 2);
