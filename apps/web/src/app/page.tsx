import Link from "next/link";
import { HealthStatus } from "@/components/health-status";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[var(--eg-bg)] px-6 py-16 font-sans text-[var(--eg-fg)]">
      <main className="w-full max-w-lg space-y-6 rounded-2xl border border-[var(--eg-border)] bg-white p-8 shadow-sm dark:bg-[var(--eg-slate-900)]">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">
            ExamGPT
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            AI exam tutor
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--eg-muted-fg)]">
            Sign in with Google or phone OTP, complete onboarding, then study
            from your notes with page-level citations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Sign up
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Dashboard
          </Link>
          <Link
            href="/onboarding"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Onboarding
          </Link>
        </div>
        <HealthStatus />
      </main>
    </div>
  );
}
