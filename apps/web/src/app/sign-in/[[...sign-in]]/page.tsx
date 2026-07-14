import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-[var(--eg-error)]">
          Clerk is not configured for the web app.
        </p>
        <p className="max-w-md text-sm text-[var(--eg-muted-fg)]">
          Set{" "}
          <code className="rounded bg-[var(--eg-muted)] px-1">
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
          </code>{" "}
          in <code className="rounded bg-[var(--eg-muted)] px-1">apps/web/.env.local</code>{" "}
          (or monorepo root <code className="rounded bg-[var(--eg-muted)] px-1">.env</code>{" "}
          and restart <code className="rounded bg-[var(--eg-muted)] px-1">next dev</code>).
        </p>
        <Link href="/" className="text-sm text-[var(--eg-primary)] underline">
          Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </div>
  );
}
