import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
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
        <Stack.Screen name="library/index" options={{ title: "Library" }} />
        <Stack.Screen name="library/[docId]" options={{ title: "Document" }} />
        <Stack.Screen name="chat/index" options={{ title: "Chat" }} />
        <Stack.Screen name="chat/[chatId]" options={{ title: "Tutor" }} />
        <Stack.Screen name="tests/index" options={{ title: "Tests" }} />
        <Stack.Screen name="tests/[testId]" options={{ title: "Test" }} />
        <Stack.Screen
          name="exam/[attemptId]"
          options={{ title: "Exam", headerShown: false }}
        />
        <Stack.Screen name="exam/done" options={{ title: "Submitted" }} />
        <Stack.Screen name="reports/[attemptId]" options={{ title: "Report" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
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
}
