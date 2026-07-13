import { HealthStatus } from "@/components/health-status";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[var(--eg-bg)] px-6 py-16 font-sans text-[var(--eg-fg)]">
      <main className="w-full max-w-lg space-y-6 rounded-2xl border border-[var(--eg-border)] bg-white p-8 shadow-sm dark:bg-[var(--eg-slate-900)]">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">
            ExamGPT · Phase 0
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Monorepo foundation
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--eg-muted-fg)]">
            Web client calling{" "}
            <code className="rounded bg-[var(--eg-muted)] px-1">
              health.ping
            </code>{" "}
            on the Express + tRPC server.
          </p>
        </div>
        <HealthStatus />
      </main>
    </div>
  );
}
