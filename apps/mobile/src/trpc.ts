import type { AppRouter } from "@examgpt/api";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import Constants from "expo-constants";
import { Platform } from "react-native";

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

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      async headers() {
        const token = tokenGetter ? await tokenGetter() : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
