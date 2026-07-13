import type { AppRouter } from "@examgpt/api";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Resolve API base URL for simulators/emulators/devices.
 * Android emulator reaches host machine via 10.0.2.2.
 */
function getApiUrl() {
  const fromEnv = process.env["EXPO_PUBLIC_API_URL"];
  if (fromEnv) return fromEnv;

  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.linkingUri?.replace(/^exp:\/\//, "");
  const host = hostUri?.split(":")[0];

  if (Platform.OS === "android") {
    return "http://10.0.2.2:4000";
  }
  if (host && host !== "localhost") {
    return `http://${host}:4000`;
  }
  return "http://localhost:4000";
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000 },
  },
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      // Phase 1: attach Clerk token from secure store
      headers() {
        return {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
