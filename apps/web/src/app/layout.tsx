import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Geist, Geist_Mono } from "next/font/google";
import { TRPCReactProvider } from "@/trpc/client";
import { SentryInit } from "@/components/sentry-init";
import { ThemeProvider } from "@/components/theme-provider";
import "@examgpt/ui-tokens/css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://examgpt.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ExamGPT — AI exam prep from your notes",
    template: "%s · ExamGPT",
  },
  description:
    "Chat with your own notes with page citations. Real NTA-style CBT mocks for NEET and JEE. Deep AI reports.",
  openGraph: {
    siteName: "ExamGPT",
    type: "website",
    locale: "en_IN",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ExamGPT" }],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const app = (
    <ThemeProvider>
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </ThemeProvider>
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SentryInit />
        {publishableKey ? (
          <ClerkProvider
            publishableKey={publishableKey}
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/dashboard"
            signUpFallbackRedirectUrl="/onboarding"
            appearance={{
              // Match shadcn/ui app chrome; override Clerk default purple
              theme: shadcn,
              variables: {
                colorPrimary: "#2563eb",
                colorDanger: "#dc2626",
                colorSuccess: "#16a34a",
                colorWarning: "#d97706",
                borderRadius: "0.5rem",
              },
            }}
          >
            {app}
          </ClerkProvider>
        ) : (
          app
        )}
      </body>
    </html>
  );
}
