"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ExamDonePage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { isSignedIn } = useAuth();
  const trpc = useTRPC();
  const state = useQuery({
    ...trpc.attempts.state.queryOptions({ attemptId }),
    enabled: !!isSignedIn && !!attemptId,
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Submitted</h1>
      <p className="mt-3 text-sm text-[var(--eg-muted-fg)]">
        Your result will be announced shortly.
      </p>
      {state.data?.attempt.score != null && (
        <p className="mt-4 text-lg font-medium">
          Score: {state.data.attempt.score}
        </p>
      )}
      <Link href="/dashboard" className={cn(buttonVariants(), "mt-8")}>
        Back to dashboard
      </Link>
      <Link href="/tests" className={cn(buttonVariants({ variant: "outline" }), "mt-2")}>
        All tests
      </Link>
    </div>
  );
}
