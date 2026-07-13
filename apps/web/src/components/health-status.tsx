"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export function HealthStatus() {
  const trpc = useTRPC();
  const health = useQuery(trpc.health.ping.queryOptions());

  if (health.isLoading) {
    return (
      <p className="text-sm text-[var(--eg-muted-fg)]">Checking API health…</p>
    );
  }

  if (health.isError) {
    return (
      <div className="rounded-lg border border-[var(--eg-error)]/30 bg-red-50 p-4 text-sm text-[var(--eg-error)] dark:bg-red-950/30">
        <p className="font-medium">API unreachable</p>
        <p className="mt-1 opacity-80">{health.error.message}</p>
        <p className="mt-2 text-[var(--eg-muted-fg)]">
          Start the server with{" "}
          <code className="rounded bg-[var(--eg-muted)] px-1">
            bun run --filter @examgpt/server dev
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--eg-border)] bg-[var(--eg-muted)] p-4">
      <p className="text-sm font-medium text-[var(--eg-success)]">
        health.ping · ok
      </p>
      <dl className="mt-3 space-y-1 text-sm text-[var(--eg-fg)]">
        <div className="flex gap-2">
          <dt className="text-[var(--eg-muted-fg)]">service</dt>
          <dd className="font-mono">{health.data?.service}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--eg-muted-fg)]">timestamp</dt>
          <dd className="font-mono">{health.data?.timestamp}</dd>
        </div>
      </dl>
    </div>
  );
}
