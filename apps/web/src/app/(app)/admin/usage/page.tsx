"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/async-state";

export default function AdminUsagePage() {
  const trpc = useTRPC();
  const usage = useQuery(trpc.admin.usageSummary.queryOptions({ days: 30 }));

  if (usage.isLoading) return <LoadingState label="Loading usage…" />;
  if (usage.isError || !usage.data) {
    return <ErrorState title="Failed to load usage summary" />;
  }

  const d = usage.data;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--eg-border)] p-4">
          <p className="text-xs text-[var(--eg-muted-fg)]">Calls (30d)</p>
          <p className="mt-1 text-2xl font-semibold">{d.totals.calls}</p>
        </div>
        <div className="rounded-xl border border-[var(--eg-border)] p-4">
          <p className="text-xs text-[var(--eg-muted-fg)]">Cost USD</p>
          <p className="mt-1 text-2xl font-semibold">
            ${d.totals.costUsd.toFixed(4)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--eg-border)] p-4">
          <p className="text-xs text-[var(--eg-muted-fg)]">Report rollups</p>
          <p className="mt-1 text-2xl font-semibold">
            ${d.reports.totalCostUsd.toFixed(4)}
          </p>
          <p className="text-xs text-[var(--eg-muted-fg)]">
            {d.reports.count} reports · avg $
            {d.reports.avgCostUsd.toFixed(4)}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium">By task / model</h2>
        {d.byTask.length === 0 ? (
          <EmptyState
            title="No usage yet"
            description="AI calls will appear here after ingestion, chat, and reports."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--eg-border)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--eg-border)] bg-[var(--eg-muted)]/40 text-xs text-[var(--eg-muted-fg)]">
                <tr>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Calls</th>
                  <th className="px-3 py-2">Tokens in</th>
                  <th className="px-3 py-2">Tokens out</th>
                  <th className="px-3 py-2">Cost</th>
                </tr>
              </thead>
              <tbody>
                {d.byTask.map((r) => (
                  <tr
                    key={`${r.task}-${r.model}`}
                    className="border-b border-[var(--eg-border)] last:border-0"
                  >
                    <td className="px-3 py-2 font-medium">{r.task}</td>
                    <td className="px-3 py-2 text-[var(--eg-muted-fg)]">
                      {r.model}
                    </td>
                    <td className="px-3 py-2">{r.calls}</td>
                    <td className="px-3 py-2">{r.tokensIn}</td>
                    <td className="px-3 py-2">{r.tokensOut}</td>
                    <td className="px-3 py-2">${r.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
