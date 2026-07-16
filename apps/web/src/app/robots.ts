import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://examgpt.app";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/sign-in", "/sign-up"],
      disallow: [
        "/dashboard",
        "/library",
        "/chat",
        "/tests",
        "/exam",
        "/reports",
        "/onboarding",
        "/admin",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
