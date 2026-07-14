import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StorageAdapter } from "@examgpt/api";
import { env } from "../env";

/**
 * Dev/local filesystem storage under LOCAL_UPLOAD_DIR (default: <cwd>/.data/uploads).
 * Used when R2 is missing or returns AccessDenied in development.
 */
export function localUploadRoot(): string {
  return resolve(
    process.env.LOCAL_UPLOAD_DIR ?? join(process.cwd(), ".data", "uploads"),
  );
}

export function localPathForKey(key: string): string {
  // Prevent path traversal
  const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
  return join(localUploadRoot(), safe);
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

export function createLocalStorage(): StorageAdapter {
  const publicBase = env.R2_PUBLIC_BASE_URL; // unused for local; keep null public URL
  return {
    async presignPut({ key }) {
      // Client still PUTs — for local we expose a server-side upload shim later.
      // tRPC clients upload via signed URL; in local mode the "upload URL" is a
      // data URL scheme that won't work with fetch PUT. Prefer server-side put
      // via writeLocalObject in scripts / direct ingest. For browser uploads in
      // pure-local mode, registerUpload can accept bytes later.
      // Use a special pseudo-URL the mobile/web won't hit; verification scripts
      // write files directly.
      const path = localPathForKey(key);
      await mkdir(dirname(path), { recursive: true });
      return {
        uploadUrl: `local-storage://${key}`,
        publicUrl: publicBase
          ? `${publicBase.replace(/\/$/, "")}/${key}`
          : null,
      };
    },
    async presignGet(key) {
      // Return a file:// URL for dev inspection (browsers block file:// from web).
      // Prefer serving via getFileUrl that reads bytes — for now path string.
      const path = localPathForKey(key);
      return `file://${path.replace(/\\/g, "/")}`;
    },
    async headObject(key) {
      try {
        const s = await stat(localPathForKey(key));
        return { contentLength: s.size, contentType: "application/pdf" };
      } catch {
        return null;
      }
    },
  };
}
