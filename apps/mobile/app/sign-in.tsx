/**
 * Email + password / email OTP + Google SSO (NO phone/SMS).
 * Custom flows per .agents/skills/clerk-expo/references/custom-flows.md
 * and clerk-custom-ui core-3.
 *
 * Dev test: *+clerk_test@example.com with OTP 424242
 * (@see clerk-cli/references/recipes.md, clerk-testing)
 */
import { useSignIn, useSignUp, useSSO } from "@clerk/expo";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../src/components/ui/button";
import { Input } from "../src/components/ui/input";

type Mode = "password" | "email_code" | "verify_email";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, errors: signInErrors, fetchStatus: signInFetch } =
    useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetch } =
    useSignUp();
  const { startSSOFlow } = useSSO();

  const [mode, setMode] = useState<Mode>("password");
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = signInFetch === "fetching" || signUpFetch === "fetching";

  const navigateAfterAuth = ({
    session,
    decorateUrl,
  }: {
    session?: { currentTask?: unknown } | null;
    decorateUrl: (url: string) => string;
  }) => {
    if (session?.currentTask) return;
    const url = decorateUrl(isSignUp ? "/onboarding" : "/");
    if (url.startsWith("http")) {
      if (typeof globalThis !== "undefined" && "location" in globalThis) {
        (globalThis as { location: { href: string } }).location.href = url;
      }
    } else {
      router.replace(url as Href);
    }
  };

  function errMsg(msg?: string | null, fallback = "Something went wrong") {
    return msg ?? fallback;
  }

  async function onGoogle() {
    setError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
      });
      // SSO uses setActive (skill Gate 5), not finalize()
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    }
  }

  async function onPasswordSubmit() {
    setError(null);
    if (!isSignUp) {
      // Exactly one of identifier | emailAddress | phoneNumber
      const { error: err } = await signIn.password({
        emailAddress: email,
        password,
      });
      if (err) {
        const code0 =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err as any)?.errors?.[0]?.code ?? (err as any)?.code;
        if (code0 === "form_identifier_not_found") {
          setIsSignUp(true);
          setError("No account — create one with the same email.");
          return;
        }
        setError(
          errMsg(
            signInErrors?.fields?.password?.message ??
              signInErrors?.fields?.identifier?.message ??
              err.message,
            "Sign-in failed",
          ),
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

    const { error: signUpError } = await signUp.password({
      emailAddress: email,
      password,
    });
    if (signUpError) {
      setError(
        errMsg(
          signUpErrors?.fields?.emailAddress?.message ??
            signUpErrors?.fields?.password?.message ??
            signUpError.message,
          "Sign-up failed",
        ),
      );
      return;
    }
    await signUp.verifications.sendEmailCode();
    setMode("verify_email");
  }

  async function onEmailCodeStart() {
    setError(null);
    const { error: err } = await signIn.emailCode.sendCode({
      emailAddress: email,
    });
    if (err) {
      setError(errMsg(err.message, "Could not send code"));
      return;
    }
    setMode("verify_email");
  }

  async function onVerify() {
    setError(null);
    if (isSignUp) {
      const { error: err } = await signUp.verifications.verifyEmailCode({
        code,
      });
      if (err) {
        setError(errMsg(err.message, "Invalid code"));
        return;
      }
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: navigateAfterAuth });
      }
      return;
    }

    if (signIn.status === "needs_client_trust") {
      const { error: err } = await signIn.mfa.verifyEmailCode({ code });
      if (err) {
        setError(errMsg(err.message, "Invalid code"));
        return;
      }
    } else {
      const { error: err } = await signIn.emailCode.verifyCode({ code });
      if (err) {
        setError(errMsg(err.message, "Invalid code"));
        return;
      }
    }
    if (signIn.status === "complete") {
      await signIn.finalize({ navigate: navigateAfterAuth });
    }
  }

  return (
    <View className="flex-1 bg-white px-6 py-8 dark:bg-slate-950">
      {/* Required for Clerk bot protection on sign-up (skill Gate 10) */}
      <View nativeID="clerk-captcha" />

      <Text className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        {isSignUp ? "Create account" : "Sign in"}
      </Text>
      <Text className="mt-2 text-sm text-slate-500">
        Google or email + password. No phone/SMS.
      </Text>
      <Text className="mt-1 text-xs text-slate-400">
        Dev: you+clerk_test@example.com · OTP 424242
      </Text>

      <View className="mt-6 gap-3">
        <Button title="Continue with Google" onPress={() => void onGoogle()} />
      </View>

      {mode !== "verify_email" ? (
        <View className="mt-8 gap-3">
          <Text className="text-sm font-medium text-slate-700">Email</Text>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you+clerk_test@example.com"
          />
          {mode === "password" ? (
            <>
              <Text className="text-sm font-medium text-slate-700">
                Password
              </Text>
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={isSignUp ? "new-password" : "password"}
                placeholder="Min 8 characters"
              />
              <Button
                title={isSignUp ? "Sign up" : "Sign in"}
                onPress={() => void onPasswordSubmit()}
                disabled={busy}
              />
              {!isSignUp ? (
                <Button
                  title="Sign in with email code"
                  variant="outline"
                  onPress={() => setMode("email_code")}
                />
              ) : null}
            </>
          ) : (
            <Button
              title="Send email code"
              onPress={() => void onEmailCodeStart()}
              disabled={busy}
            />
          )}
        </View>
      ) : (
        <View className="mt-8 gap-3">
          <Text className="text-sm font-medium text-slate-700">
            Email verification code
          </Text>
          <Input
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            placeholder="424242"
          />
          <Button
            title="Verify code"
            onPress={() => void onVerify()}
            disabled={busy}
          />
          <Button
            title="Back"
            variant="outline"
            onPress={() => {
              setMode("password");
              setCode("");
            }}
          />
        </View>
      )}

      <View className="mt-6">
        <Button
          title={
            isSignUp
              ? "Already have an account? Sign in"
              : "Need an account? Sign up"
          }
          variant="outline"
          onPress={() => {
            setIsSignUp((v) => !v);
            setError(null);
            setMode("password");
          }}
        />
      </View>

      {error ? (
        <Text className="mt-4 text-sm text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
