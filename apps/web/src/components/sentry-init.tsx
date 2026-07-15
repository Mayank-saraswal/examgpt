"use client";

import { useEffect } from "react";
import { initWebSentry } from "@/lib/sentry";

/** Mount once in root layout to init optional Sentry. */
export function SentryInit() {
  useEffect(() => {
    initWebSentry();
  }, []);
  return null;
}
