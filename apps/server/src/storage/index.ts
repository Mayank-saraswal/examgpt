import type { StorageAdapter } from "@examgpt/api";
import { env } from "../env";
import { logger } from "../logger";
import { createLocalStorage } from "./local";
import { createR2Storage } from "./r2";

let resolved: StorageAdapter | null | undefined;
let backend: "r2" | "local" | "none" = "none";

/**
 * Prefer R2 when fully configured; fall back to local disk in development
 * so ingest/library work without working Cloudflare credentials.
 */
export function createStorage(): StorageAdapter | null {
  if (resolved !== undefined) return resolved;

  const forceLocal =
    process.env.STORAGE_BACKEND === "local" ||
    process.env.R2_FORCE_LOCAL === "1";

  if (!forceLocal) {
    const r2 = createR2Storage();
    if (r2) {
      resolved = r2;
      backend = "r2";
      logger.info("Storage backend: R2");
      return resolved;
    }
  }

  if (env.NODE_ENV === "development" || forceLocal) {
    resolved = createLocalStorage();
    backend = "local";
    logger.warn(
      "Storage backend: local filesystem (.data/uploads) — R2 missing or forced local",
    );
    return resolved;
  }

  resolved = null;
  backend = "none";
  logger.warn("Storage backend: none");
  return null;
}

export function storageBackend(): "r2" | "local" | "none" {
  createStorage();
  return backend;
}

export { createR2Storage } from "./r2";
export {
  createLocalStorage,
  localPathForKey,
  localUploadRoot,
  readLocalObject,
  writeLocalObject,
} from "./local";
