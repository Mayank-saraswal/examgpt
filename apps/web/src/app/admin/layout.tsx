"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, FileStack, Activity, ShieldX } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/async-state";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/papers", label: "Platform papers", icon: FileStack },
  { href: "/admin/usage", label: "AI usage", icon: Activity },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const pathname = usePathname();
  const trpc = useTRPC();
  const me = useQuery({
    ...trpc.admin.me.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <LoadingState label="Checking admin access…" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <ShieldX className="size-10 text-[var(--eg-muted-fg)]" aria-hidden />
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-[var(--eg-muted-fg)]">Sign in required.</p>
        <Link href="/sign-in" className={cn(buttonVariants())}>
          Sign in
        </Link>
      </div>
    );
  }

  if (me.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <LoadingState label="Verifying admin role…" />
      </div>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <ShieldX className="size-10 text-red-600" aria-hidden />
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="text-sm text-[var(--eg-muted-fg)]">
          This page is not available for your account.
        </p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">Admin</p>
          <h1 className="text-2xl font-semibold">Platform control</h1>
        </div>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Exit admin
        </Link>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-[var(--eg-border)] pb-3">
        {nav.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
                active
                  ? "bg-[var(--eg-primary)] text-white"
                  : "border border-[var(--eg-border)] text-[var(--eg-muted-fg)]",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {me.isError ? (
        <ErrorState title="Failed to load admin session" />
      ) : (
        children
      )}
    </div>
  );
}
