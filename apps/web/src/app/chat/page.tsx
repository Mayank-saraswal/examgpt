"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { cn } from "@/lib/utils";

export default function ChatListPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();

  const list = useQuery({
    ...trpc.chat.list.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });

  const create = useMutation(
    trpc.chat.create.mutationOptions({
      onSuccess: (chat) => {
        void qc.invalidateQueries(trpc.chat.list.queryFilter());
        router.push(`/chat/${chat.id}`);
      },
    }),
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
          <h1 className="text-2xl font-semibold tracking-tight">Chat tutor</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
            Dashboard
          </Link>
          <button
            type="button"
            disabled={!isSignedIn || create.isPending}
            onClick={() => create.mutate({})}
            className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="size-4" />
            )}
            New chat
          </button>
        </div>
      </header>

      {!isLoaded && (
        <p className="text-sm text-[var(--eg-muted-fg)]">Loading…</p>
      )}
      {isLoaded && !isSignedIn && (
        <p className="text-sm text-[var(--eg-muted-fg)]">
          <Link href="/sign-in" className="text-[var(--eg-primary)] underline">
            Sign in
          </Link>{" "}
          to chat with your notes.
        </p>
      )}

      {isSignedIn && list.isLoading && <LoadingState label="Loading chats…" />}

      {isSignedIn && list.isError && (
        <ErrorState
          title="Could not load chats"
          description={list.error.message}
          onRetry={() => void list.refetch()}
        />
      )}

      {isSignedIn && !list.isLoading && !list.isError && list.data?.length === 0 && (
        <EmptyState
          title="No chats yet"
          description="Start one — answers cite pages from your uploaded notes."
          action={
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate({})}
              className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              New chat
            </button>
          }
        />
      )}

      <ul className="flex flex-col gap-2">
        {list.data?.map((c) => {
          const preview = c.messages[0]?.content?.slice(0, 120);
          return (
            <li key={c.id}>
              <Link
                href={`/chat/${c.id}`}
                className="block rounded-xl border border-[var(--eg-border)] bg-[var(--eg-surface)] px-4 py-3 transition hover:border-[var(--eg-primary)]"
              >
                <p className="font-medium">{c.title}</p>
                {preview && (
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--eg-muted-fg)]">
                    {preview}
                  </p>
                )}
                <p className="mt-2 text-xs text-[var(--eg-muted-fg)]">
                  {new Date(c.updatedAt).toLocaleString()}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
