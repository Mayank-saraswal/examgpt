"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { HealthStatus } from "@/components/health-status";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const me = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });
  const status = useQuery({
    ...trpc.onboarding.status.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        {isSignedIn ? (
          <UserButton />
        ) : (
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Sign in
          </Link>
        )}
      </header>

      {!isLoaded && (
        <p className="text-sm text-[var(--eg-muted-fg)]">Loading…</p>
      )}

      {isLoaded && !isSignedIn && (
        <p className="text-sm text-[var(--eg-muted-fg)]">
          Sign in with Google or email + password to continue.
        </p>
      )}

      {isSignedIn && (
        <>
          {me.isLoading ? (
            <p className="text-sm text-[var(--eg-muted-fg)]">Loading profile…</p>
          ) : (
            <div className="rounded-xl border border-[var(--eg-border)] p-5">
              <p className="font-medium">{me.data?.name ?? "Student"}</p>
              <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
                {me.data?.email ?? me.data?.phone ?? me.data?.id}
              </p>
              <p className="mt-3 text-sm">
                Onboarded:{" "}
                <span className="font-medium">
                  {status.data?.onboarded ? "yes" : "no"}
                </span>
              </p>
              {status.data?.exam && (
                <p className="mt-1 text-sm">
                  Exam:{" "}
                  <span className="font-medium">
                    {status.data.exam.type}
                    {status.data.exam.customName
                      ? ` (${status.data.exam.customName})`
                      : ""}
                  </span>
                  {" · "}
                  syllabus {status.data.exam.syllabusStatus}
                </p>
              )}
              {!status.data?.onboarded && (
                <Link
                  href="/onboarding"
                  className={cn(buttonVariants({ variant: "default" }), "mt-4")}
                >
                  Complete onboarding
                </Link>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/chat"
                  className={cn(buttonVariants({ variant: "default" }))}
                >
                  Chat tutor
                </Link>
                <Link
                  href="/library"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Library
                </Link>
              </div>
            </div>
          )}
          <HealthStatus />
        </>
      )}
    </div>
  );
}
