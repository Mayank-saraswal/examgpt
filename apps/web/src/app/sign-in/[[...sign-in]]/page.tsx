"use client";

/**
 * Combined email+password / email OTP / Google sign-in (no phone/SMS).
 * Custom flow per .agents/skills/clerk-custom-ui/core-3/custom-sign-in.md
 * and clerk-nextjs-patterns.
 *
 * Clerk dashboard: enable Email, Password, Email verification code, Google.
 * Disable Phone number / SMS.
 * Dev test emails: *+clerk_test@example.com with OTP 424242.
 */
import { useSignIn, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "password" | "email_code" | "verify_email";

export default function SignInPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const router = useRouter();
  const { signIn, errors: signInErrors, fetchStatus: signInStatus } =
    useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpStatus } =
    useSignUp();

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!publishableKey) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-[var(--eg-error)]">
          Clerk is not configured for the web app.
        </p>
        <Link href="/" className="text-sm text-[var(--eg-primary)] underline">
          Back home
        </Link>
      </div>
    );
  }

  const busy = signInStatus === "fetching" || signUpStatus === "fetching";

  async function navigateAfterAuth({
    session,
    decorateUrl,
  }: {
    session?: { currentTask?: { key: string } | null } | null;
    decorateUrl: (url: string) => string;
  }) {
    if (session?.currentTask) {
      router.push(`/sign-in/tasks/${session.currentTask.key}`);
      return;
    }
    const url = decorateUrl(isSignUp ? "/onboarding" : "/dashboard");
    if (url.startsWith("http")) window.location.href = url;
    else router.push(url);
  }

  async function onGoogle() {
    setError(null);
    // Google OAuth via custom-flow SSO (no phone).
    // @see .agents/skills/clerk-custom-ui/core-3/custom-sign-in.md
    const { error } = await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: "/dashboard",
      redirectCallbackUrl: "/sso-callback",
    });
    if (error) setError(error.message ?? "Google sign-in failed");
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSignUp) {
      const { error } = await signIn.password({
        identifier: email,
        password,
      });
      if (error) {
        // Transfer to sign-up if identifier not found
        const code0 =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error as any)?.errors?.[0]?.code ?? (error as any)?.code;
        if (code0 === "form_identifier_not_found") {
          setIsSignUp(true);
          setError("No account with that email — create one below.");
          return;
        }
        setError(
          signInErrors?.fields?.identifier?.message ??
            signInErrors?.fields?.password?.message ??
            error.message ??
            "Sign-in failed",
        );
        return;
      }
      if (signIn.status === "complete") {
        await signIn.finalize({ navigate: navigateAfterAuth });
      } else if (signIn.status === "needs_client_trust") {
        await signIn.mfa.sendEmailCode();
        setMode("verify_email");
      }
      return;
    }

    // Sign-up with password + email verification
    const { error } = await signUp.password({
      emailAddress: email,
      password,
    });
    if (error) {
      setError(
        signUpErrors?.fields?.emailAddress?.message ??
          signUpErrors?.fields?.password?.message ??
          error.message ??
          "Sign-up failed",
      );
      return;
    }
    await signUp.verifications.sendEmailCode();
    setMode("verify_email");
  }

  async function onEmailCodeStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSignUp) {
      // Prefer password sign-up path for new users; email-code-only can be enabled
      setError("Use password sign-up, then verify with the email code.");
      setMode("password");
      return;
    }
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email });
    if (error) {
      setError(
        signInErrors?.fields?.identifier?.message ??
          error.message ??
          "Could not send code",
      );
      return;
    }
    setMode("verify_email");
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignUp) {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) {
        setError(
          signUpErrors?.fields?.code?.message ??
            error.message ??
            "Invalid code",
        );
        return;
      }
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: navigateAfterAuth });
      }
      return;
    }

    // Sign-in email code or client-trust MFA
    if (signIn.status === "needs_client_trust") {
      const { error } = await signIn.mfa.verifyEmailCode({ code });
      if (error) {
        setError(error.message ?? "Invalid code");
        return;
      }
    } else {
      const { error } = await signIn.emailCode.verifyCode({ code });
      if (error) {
        setError(
          signInErrors?.fields?.code?.message ??
            error.message ??
            "Invalid code",
        );
        return;
      }
    }
    if (signIn.status === "complete") {
      await signIn.finalize({ navigate: navigateAfterAuth });
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--eg-border)] bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isSignUp ? "Create account" : "Sign in"}
          </h1>
          <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
            Google or email + password. No phone/SMS.
          </p>
          <p className="mt-1 text-xs text-[var(--eg-muted-fg)]">
            Dev: use{" "}
            <code className="rounded bg-[var(--eg-muted)] px-1">
              you+clerk_test@example.com
            </code>{" "}
            and OTP <code className="rounded bg-[var(--eg-muted)] px-1">424242</code>
          </p>
        </div>

        <Button
          type="button"
          className="w-full"
          variant="outline"
          disabled={busy}
          onClick={() => void onGoogle()}
        >
          Continue with Google
        </Button>

        <div className="relative text-center text-xs text-[var(--eg-muted-fg)]">
          <span className="bg-white px-2">or email</span>
        </div>

        {mode !== "verify_email" ? (
          <form
            className="space-y-4"
            onSubmit={(e) =>
              void (mode === "email_code"
                ? onEmailCodeStart(e)
                : onPasswordSubmit(e))
            }
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you+clerk_test@example.com"
                required
              />
            </div>
            {mode === "password" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "email_code"
                ? "Send email code"
                : isSignUp
                  ? "Sign up"
                  : "Sign in"}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void onVerifyCode(e)}>
            <div className="space-y-2">
              <Label htmlFor="code">Email verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="424242"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Verify code
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setMode("password");
                setCode("");
              }}
            >
              Back
            </Button>
          </form>
        )}

        {error && (
          <p className="text-sm text-[var(--eg-error)]" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            className="text-[var(--eg-primary)] underline"
            onClick={() => {
              setIsSignUp((v) => !v);
              setError(null);
              setMode("password");
            }}
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Need an account? Sign up"}
          </button>
          {!isSignUp && mode === "password" && (
            <button
              type="button"
              className="text-[var(--eg-muted-fg)] underline"
              onClick={() => setMode("email_code")}
            >
              Sign in with email code
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
