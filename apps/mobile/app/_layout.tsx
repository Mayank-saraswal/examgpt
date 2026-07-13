import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@examgpt/ui-tokens";
import { queryClient } from "../src/trpc";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary[600] },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "600" },
          title: "ExamGPT",
        }}
      />
    </QueryClientProvider>
  );
}
