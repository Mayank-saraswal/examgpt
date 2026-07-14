/**
 * Dev-only unauthenticated local file PUT/GET gate.
 * MUST only mount when NODE_ENV === "development" AND storageBackend() === "local".
 * Never mount in production — unauthenticated 110MB writes are a disk-fill DoS.
 */
export function shouldMountLocalStorageRoutes(
  nodeEnv: string,
  backend: "r2" | "local" | "none",
): boolean {
  return nodeEnv === "development" && backend === "local";
}
