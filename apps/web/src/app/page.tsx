import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Brain,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LineChart,
  MessageSquare,
  Sparkles,
  Upload,
} from "lucide-react";
import { LandingFaq } from "@/components/landing-faq";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ExamGPT — AI tutor from your notes + real NTA mock tests",
  description:
    "Chat with your own notes with page citations. Practice real NTA-style CBT mocks for NEET and JEE. Deep AI reports and adaptive papers.",
  openGraph: {
    title: "ExamGPT — study from YOUR notes",
    description:
      "Page-level citations from your PDFs, authentic NTA exam window, deep performance reports.",
    type: "website",
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ExamGPT" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ExamGPT",
    description: "AI exam prep from your notes with real NTA-style mocks.",
    images: ["/og.png"],
  },
  alternates: { canonical: "/" },
};

const features = [
  {
    icon: MessageSquare,
    title: "AI tutor from your notes",
    body: "Answers grounded in the PDFs and images you upload, with page-level citations you can open instantly.",
  },
  {
    icon: ClipboardCheck,
    title: "Real NTA CBT mock tests",
    body: "Palette states, server timer, and submit rules that match the real exam experience — not a toy quiz UI.",
  },
  {
    icon: LineChart,
    title: "Deep AI reports",
    body: "Weak topics, confusion trails, cutoffs when available, and a clear next step after every attempt.",
  },
  {
    icon: Sparkles,
    title: "Adaptive practice papers",
    body: "AI-generated papers biased toward your weak areas and grounded in your syllabus and notes.",
  },
] as const;

const steps = [
  {
    n: "1",
    icon: Upload,
    title: "Upload notes",
    body: "Drop books, handwritten pages, or syllabus files. Ingestion runs in the background.",
  },
  {
    n: "2",
    icon: Brain,
    title: "Chat & practice",
    body: "Ask anything from your material. Vague questions get clarified; gaps are labeled honestly.",
  },
  {
    n: "3",
    icon: FileText,
    title: "Take tests & get reports",
    body: "Sit previous-year or adaptive papers, then open a report that shows what to fix next.",
  },
] as const;

export default async function HomePage() {
  const session = await auth();
  if (session.userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--eg-bg)] text-[var(--eg-fg)]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <p className="text-sm font-semibold tracking-tight text-[var(--eg-primary)]">
          ExamGPT
        </p>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Start free
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-5xl gap-10 px-6 pb-16 pt-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-medium text-[var(--eg-primary)]">
              NEET · JEE · Other competitive exams
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Chat with{" "}
              <span className="text-[var(--eg-primary)]">your own notes</span>
              , then sit real NTA-style mocks
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--eg-muted-fg)]">
              Page-level citations from the books you upload. Computer-based
              tests that feel like the official window. Reports that name weak
              topics — not generic scores.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Start free
              </Link>
              <Link
                href="/sign-in"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                I already have an account
              </Link>
            </div>
          </div>
          <div
            aria-hidden
            className="rounded-2xl border border-[var(--eg-border)] bg-[var(--eg-muted)]/40 p-3 shadow-sm"
          >
            <div className="overflow-hidden rounded-xl border border-[var(--eg-border)] bg-white dark:bg-[var(--eg-slate-900)]">
              <div className="flex items-center gap-2 border-b border-[var(--eg-border)] px-4 py-2">
                <span className="size-2.5 rounded-full bg-red-400" />
                <span className="size-2.5 rounded-full bg-amber-400" />
                <span className="size-2.5 rounded-full bg-green-400" />
                <span className="ml-2 text-xs text-[var(--eg-muted-fg)]">
                  examgpt.app / chat
                </span>
              </div>
              <div className="space-y-3 p-5">
                <div className="ml-auto max-w-[80%] rounded-2xl bg-[var(--eg-primary)] px-3 py-2 text-sm text-white">
                  Explain Carnot cycle from my thermo notes
                </div>
                <div className="max-w-[90%] rounded-2xl border border-[var(--eg-border)] px-3 py-2 text-sm">
                  From your notes: heat engines and efficiency…
                  <p className="mt-2 text-xs font-medium text-[var(--eg-primary)]">
                    Thermo Book, p. 42
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-1.5 pt-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white",
                        n === 1 && "bg-green-500",
                        n === 2 && "bg-[var(--exam-marked)]",
                        n === 3 && "bg-red-500",
                        n >= 4 &&
                          "border-2 border-slate-300 bg-slate-100 text-slate-600",
                      )}
                    >
                      {n}
                    </span>
                  ))}
                </div>
                <p className="text-center text-[11px] text-[var(--eg-muted-fg)]">
                  Citations · NTA palette · live reports
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-[var(--eg-border)] bg-[var(--eg-muted)]/20 py-16">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Built for serious prep
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--eg-muted-fg)]">
              One product for notes, tutoring, mocks, and coaching — without
              inventing facts from thin air.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {features.map((f) => (
                <li
                  key={f.title}
                  className="rounded-xl border border-[var(--eg-border)] bg-[var(--eg-bg)] p-5"
                >
                  <f.icon
                    className="size-5 text-[var(--eg-primary)]"
                    aria-hidden
                  />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--eg-muted-fg)]">
                    {f.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li
                key={s.n}
                className="relative rounded-xl border border-[var(--eg-border)] p-5"
              >
                <span className="text-xs font-bold text-[var(--eg-primary)]">
                  Step {s.n}
                </span>
                <s.icon
                  className="mt-3 size-5 text-[var(--eg-fg)]"
                  aria-hidden
                />
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--eg-muted-fg)]">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Exam chips */}
        <section className="mx-auto max-w-5xl px-6 pb-16">
          <h2 className="text-2xl font-semibold tracking-tight">Exams we support</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            {(
              [
                { label: "NEET", icon: GraduationCap },
                { label: "JEE", icon: BookOpen },
                { label: "Other", icon: FileText },
              ] as const
            ).map((e) => (
              <span
                key={e.label}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--eg-border)] bg-[var(--eg-bg)] px-4 py-2 text-sm font-medium"
              >
                <e.icon className="size-4 text-[var(--eg-primary)]" aria-hidden />
                {e.label}
              </span>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-[var(--eg-border)] bg-[var(--eg-muted)]/20 py-16">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
            <div className="mt-6">
              <LandingFaq />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--eg-border)] py-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--eg-primary)]">
              ExamGPT
            </p>
            <p className="mt-1 text-xs text-[var(--eg-muted-fg)]">
              AI exam prep for competitive students in India.
            </p>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-[var(--eg-muted-fg)]">
            <Link href="/privacy" className="hover:text-[var(--eg-fg)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--eg-fg)]">
              Terms
            </Link>
            <Link href="/sign-up" className="hover:text-[var(--eg-fg)]">
              Sign up
            </Link>
            <Link href="/sign-in" className="hover:text-[var(--eg-fg)]">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
