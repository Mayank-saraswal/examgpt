import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "../global.css";
import { colors } from "@examgpt/ui-tokens";
import { queryClient, setAuthTokenGetter } from "../src/trpc";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

function AuthTokenBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);
  return <>{children}</>;
}

function RootStack() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary[600] },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "ExamGPT" }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
        <Stack.Screen name="onboarding" options={{ title: "Onboarding" }} />
        <Stack.Screen
          name="notifications-permission"
          options={{ title: "Notifications" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const tree = (
    <QueryClientProvider client={queryClient}>
      {publishableKey ? (
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <AuthTokenBridge>
            <RootStack />
          </AuthTokenBridge>
        </ClerkProvider>
      ) : (
        <RootStack />
      )}
    </QueryClientProvider>
  );
  return tree;
}
