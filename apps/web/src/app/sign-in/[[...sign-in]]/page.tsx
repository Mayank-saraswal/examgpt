import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

/**
 * Official Clerk prebuilt sign-in UI (path routing under /sign-in/*).
 * @see https://clerk.com/docs/nextjs/guides/development/custom-sign-in-or-up-page
 */
export default function SignInPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-[var(--eg-error)]">
          Clerk is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in
          apps/web/.env.local
        </p>
        <Link href="/" className="text-sm text-[var(--eg-primary)] underline">
          Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/onboarding"
      />
    </div>
  );
}
