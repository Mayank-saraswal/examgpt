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
 *
 * Local HTTP routes (/storage/local) are a separate concern — see
 * shouldMountLocalStorageRoutes — and never mount in production.
 */
export function createStorage(): StorageAdapter | null {
  if (resolved !== undefined) return resolved;

  // Prefer explicit local; in development default to local unless STORAGE_BACKEND=r2
  // (R2 keys often 403 AccessDenied on first setup — local unblocks live verify).
  const forceLocal =
    process.env.STORAGE_BACKEND === "local" ||
    process.env.R2_FORCE_LOCAL === "1";
  const forceR2 = process.env.STORAGE_BACKEND === "r2";

  // Never use local filesystem adapter in production (forceLocal ignored there).
  if (env.NODE_ENV === "production") {
    const r2 = createR2Storage();
    if (r2) {
      resolved = r2;
      backend = "r2";
      logger.info("Storage backend: R2");
      return resolved;
    }
    resolved = null;
    backend = "none";
    logger.error("Storage backend: none — R2 required in production");
    return null;
  }

  if (!forceLocal && forceR2) {
    const r2 = createR2Storage();
    if (r2) {
      resolved = r2;
      backend = "r2";
      logger.info("Storage backend: R2");
      return resolved;
    }
    logger.warn("STORAGE_BACKEND=r2 but R2 not fully configured — falling back");
  }

  if (env.NODE_ENV === "development" || forceLocal) {
    resolved = createLocalStorage();
    backend = "local";
    logger.warn(
      "Storage backend: local filesystem (.data/uploads) — set STORAGE_BACKEND=r2 to use Cloudflare",
    );
    return resolved;
  }

  const r2 = createR2Storage();
  if (r2) {
    resolved = r2;
    backend = "r2";
    logger.info("Storage backend: R2");
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
