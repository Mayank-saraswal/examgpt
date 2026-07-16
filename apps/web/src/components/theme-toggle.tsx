"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <span
        className={cn("inline-flex size-9 items-center justify-center", className)}
        aria-hidden
      />
    );
  }
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border border-[var(--eg-border)] text-[var(--eg-muted-fg)] hover:bg-[var(--eg-muted)]",
        className,
      )}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
