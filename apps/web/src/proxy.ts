import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Next.js 16+ uses proxy.ts (middleware.ts is deprecated).
 * Clerk: https://clerk.com/docs/reference/nextjs/clerk-middleware
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/sitemap.xml",
  "/robots.txt",
  "/og.png",
  // Prebuilt OAuth uses paths under /sign-in and /sign-up; keep legacy callback public if used
  "/sso-callback(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
