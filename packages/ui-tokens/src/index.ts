/**
 * Shared design tokens for web (Tailwind) and mobile (NativeWind).
 * General UI: no purple. Exam portal: authentic NTA purple for review states.
 */
export const colors = {
  primary: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
  },
  slate: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  /**
   * NTA CBT palette (Phase 7.6). Purple only for marked states.
   * Use only in exam portal + report palette chips.
   */
  exam: {
    answered: "#22c55e",
    answeredFg: "#ffffff",
    notAnswered: "#ef4444",
    notAnsweredFg: "#ffffff",
    notVisited: "#e5e7eb",
    notVisitedBorder: "#9ca3af",
    notVisitedFg: "#374151",
    marked: "#7c3aed",
    markedFg: "#ffffff",
    markedDot: "#22c55e",
    action: "#2563eb",
    actionFg: "#ffffff",
    submit: "#22c55e",
    submitFg: "#ffffff",
    bg: "#ffffff",
    fg: "#111827",
    mutedFg: "#6b7280",
    border: "#e5e7eb",
    heading: "#2563eb",
  },
  /** @deprecated use colors.exam — kept for non-exam call sites */
  palette: {
    notVisited: "#9ca3af",
    notAnswered: "#ef4444",
    answered: "#22c55e",
    marked: "#7c3aed",
    answeredMarked: "#7c3aed",
  },
} as const;

export type ExamgptColors = typeof colors;
