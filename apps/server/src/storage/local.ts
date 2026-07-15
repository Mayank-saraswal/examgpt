import { mkdir, readFile, writeFile, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { StorageAdapter } from "@examgpt/api";
import { env } from "../env";

/**
 * Dev/local filesystem storage under LOCAL_UPLOAD_DIR (default: <cwd>/.data/uploads).
 * Browser uploads use PUT {API_URL}/storage/local/{key} — that HTTP route is
 * mounted only when NODE_ENV=development AND storageBackend()==="local".
 */
export function localUploadRoot(): string {
  return resolve(
    process.env.LOCAL_UPLOAD_DIR ?? join(process.cwd(), ".data", "uploads"),
  );
}

/** Resolve key under upload root; rejects path traversal. */
export function localPathForKey(key: string): string {
  // Strip traversal segments and absolute prefixes before joining
  const safe = key
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p.length > 0 && p !== "." && p !== "..")
    .join(sep);
  const root = localUploadRoot();
  const full = resolve(root, safe);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (full !== root && !full.startsWith(rootWithSep)) {
    throw new Error("path traversal rejected");
  }
  return full;
}

export async function writeLocalObject(
  key: string,
  body: Buffer,
): Promise<string> {
  const path = localPathForKey(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return path;
}

export async function readLocalObject(key: string): Promise<Buffer | null> {
  try {
    return await readFile(localPathForKey(key));
  } catch {
    return null;
  }
}

function apiBase(): string {
  return (
    process.env.API_URL?.replace(/\/$/, "") ??
    `http://localhost:${env.PORT}`
  );
}

export function createLocalStorage(): StorageAdapter {
  return {
    async presignPut({ key }) {
      const path = localPathForKey(key);
      await mkdir(dirname(path), { recursive: true });
      // Client PUTs body to this server route (dev only)
      const uploadUrl = `${apiBase()}/storage/local/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      return { uploadUrl, publicUrl: null };
    },
    async presignGet(key) {
      return `${apiBase()}/storage/local/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
    },
    async headObject(key) {
      try {
        const s = await stat(localPathForKey(key));
        return { contentLength: s.size, contentType: "application/pdf" };
      } catch {
        return null;
      }
    },
    async deleteObject(key) {
      try {
        await unlink(localPathForKey(key));
      } catch {
        // already gone
      }
    },
  };
}
