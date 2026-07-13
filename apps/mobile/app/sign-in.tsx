import { useOAuth, useSignIn, useSignUp } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../src/components/ui/button";
import { Input } from "../src/components/ui/input";

WebBrowser.maybeCompleteAuthSession();

/**
 * Google OAuth + phone OTP screens (Clerk).
 * Enable Google and phone strategies in the Clerk dashboard.
 * @see https://clerk.com/docs/references/expo/overview
 */
export default function SignInScreen() {
  const router = useRouter();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } =
    useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } =
    useSignUp();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"none" | "signIn" | "signUp">("none");
  const [error, setError] = useState<string | null>(null);

  async function onGoogle() {
    setError(null);
    try {
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    }
  }

  async function startPhone() {
    if (!signInLoaded || !signUpLoaded) return;
    setError(null);
    try {
      // Try sign-in first; fall back to sign-up for new numbers
      try {
        const attempt = await signIn.create({ identifier: phone });
        const phoneFactor = attempt.supportedFirstFactors?.find(
          (f) => f.strategy === "phone_code",
        );
        if (phoneFactor && "phoneNumberId" in phoneFactor) {
          await signIn.prepareFirstFactor({
            strategy: "phone_code",
            phoneNumberId: phoneFactor.phoneNumberId,
          });
          setPending("signIn");
          return;
        }
      } catch {
        // new user path
      }
      await signUp.create({ phoneNumber: phone });
      await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
      setPending("signUp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Phone OTP start failed");
    }
  }

  async function verifyCode() {
    setError(null);
    try {
      if (pending === "signIn" && signIn && setSignInActive) {
        const res = await signIn.attemptFirstFactor({
          strategy: "phone_code",
          code,
        });
        if (res.status === "complete") {
          await setSignInActive({ session: res.createdSessionId });
          router.replace("/");
        }
      } else if (pending === "signUp" && signUp && setSignUpActive) {
        const res = await signUp.attemptPhoneNumberVerification({ code });
        if (res.status === "complete") {
          await setSignUpActive({ session: res.createdSessionId });
          router.replace("/onboarding");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    }
  }

  return (
    <View className="flex-1 bg-white px-6 py-8 dark:bg-slate-950">
      <Text className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        Sign in
      </Text>
      <Text className="mt-2 text-sm text-slate-500">
        Google OAuth or phone OTP (enable both in Clerk dashboard).
      </Text>

      <View className="mt-8 gap-3">
        <Button title="Continue with Google" onPress={onGoogle} />
      </View>

      <View className="mt-8 gap-3">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Phone number (E.164)
        </Text>
        <Input
          value={phone}
          onChangeText={setPhone}
          placeholder="+919876543210"
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        {pending === "none" ? (
          <Button title="Send OTP" onPress={startPhone} variant="outline" />
        ) : (
          <>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              keyboardType="number-pad"
            />
            <Button title="Verify code" onPress={verifyCode} />
          </>
        )}
      </View>

      {error ? (
        <Text className="mt-4 text-sm text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
