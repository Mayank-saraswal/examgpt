"use client";

import type { AppRouter } from "@examgpt/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useAuth } from "@clerk/nextjs";
import { useState } from "react";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

function getApiUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:4000"
  );
}

function TrpcInner({
  children,
  getToken,
}: {
  children: React.ReactNode;
  getToken: () => Promise<string | null>;
}) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${getApiUrl()}/trpc`,
          async headers() {
            const token = await getToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

/** Only mount when a parent <ClerkProvider> exists. */
function ClerkAuthedProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  return <TrpcInner getToken={() => getToken()}>{children}</TrpcInner>;
}

function NoClerkProvider({ children }: { children: React.ReactNode }) {
  return <TrpcInner getToken={async () => null}>{children}</TrpcInner>;
}

export function TRPCReactProvider(
  props: Readonly<{ children: React.ReactNode }>,
) {
  // Must match layout: only use useAuth when ClerkProvider is mounted
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (hasClerk) {
    return <ClerkAuthedProvider>{props.children}</ClerkAuthedProvider>;
  }
  return <NoClerkProvider>{props.children}</NoClerkProvider>;
}
