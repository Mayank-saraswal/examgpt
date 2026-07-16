import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
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
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ExamGPT" }],
  },
  alternates: { canonical: "/" },
};

const features = [
  {
    icon: MessageSquare,
    title: "AI tutor from your notes",
    body: "Answers grounded in the PDFs and images you upload, with page-level citations you open in one click.",
    reverse: false,
    visual: "citations",
  },
  {
    icon: ClipboardCheck,
    title: "Real NTA CBT mock tests",
    body: "Palette states, server timer, and submit rules that match the official computer-based exam — not a toy quiz.",
    reverse: true,
    visual: "exam",
  },
  {
    icon: LineChart,
    title: "Deep AI reports",
    body: "Weak topics, confusion trails, cutoffs when available, and a clear next step after every attempt.",
    reverse: false,
    visual: "report",
  },
  {
    icon: Sparkles,
    title: "Adaptive practice papers",
    body: "AI-generated papers biased toward your weak areas and grounded in your syllabus and notes.",
    reverse: true,
    visual: "adaptive",
  },
] as const;

export default async function HomePage() {
  const session = await auth();
  if (session.userId) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      {/* Sticky nav */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-blue-600"
          >
            ExamGPT
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-400 md:flex">
            <a href="#features" className="hover:text-slate-900 dark:hover:text-slate-100">
              Features
            </a>
            <a href="#how" className="hover:text-slate-900 dark:hover:text-slate-100">
              How it works
            </a>
            <a href="#faq" className="hover:text-slate-900 dark:hover:text-slate-100">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Sign in
            </Link>
            <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }))}>
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-2 lg:items-center lg:pt-24">
          <div>
            <p className="text-sm font-medium text-blue-600">
              NEET · JEE · Other competitive exams
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Chat with{" "}
              <span className="text-blue-600">your own notes</span>
              .
              <br />
              Sit real NTA-style mocks.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600 dark:text-slate-400">
              Page-level citations from the books you upload. A computer-based
              test window that feels official. Reports that name weak topics —
              not generic scores.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className={cn(buttonVariants({ size: "lg" }), "gap-2")}
              >
                Start free
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a
                href="#features"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                See features
              </a>
            </div>
          </div>

          {/* Browser frame + product shot */}
          <div className="relative">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
                <span className="size-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="size-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="size-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="ml-3 flex-1 truncate rounded-md bg-slate-100 px-3 py-1 text-center text-xs text-slate-500 dark:bg-slate-800">
                  examgpt.app / exam
                </span>
              </div>
              <div className="relative aspect-[16/10] w-full bg-slate-100 dark:bg-slate-800">
                <Image
                  src="/exam-window.jpeg"
                  alt="NTA-style computer-based test window in ExamGPT"
                  fill
                  className="object-cover object-top"
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Social proof strip */}
        <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-6 text-sm text-slate-500">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Built for serious aspirants
            </span>
            <span className="hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
            <span>Page-level citations</span>
            <span className="hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
            <span>NTA-faithful CBT palette</span>
            <span className="hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
            <span>Private notes knowledge base</span>
          </div>
        </section>

        {/* Features alternating */}
        <section id="features" className="mx-auto max-w-6xl space-y-24 px-6 py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">
              Everything you need after class
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400">
              One product for notes, tutoring, mocks, and coaching — without
              inventing facts from thin air.
            </p>
          </div>

          {features.map((f) => (
            <div
              key={f.title}
              className={cn(
                "grid items-center gap-10 lg:grid-cols-2",
                f.reverse && "lg:[&>*:first-child]:order-2",
              )}
            >
              <div>
                <div className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <f.icon className="size-5 text-blue-600" aria-hidden />
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-400">
                  {f.body}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-blue-600" aria-hidden />
                    User-isolated data on every query
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-blue-600" aria-hidden />
                    Works on web and mobile
                  </li>
                </ul>
              </div>
              <FeatureVisual kind={f.visual} />
            </div>
          ))}
        </section>

        {/* How it works */}
        <section
          id="how"
          className="border-y border-slate-200 bg-white py-24 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-3xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {(
                [
                  {
                    n: "01",
                    icon: Upload,
                    title: "Upload notes",
                    body: "Drop books, handwritten pages, or syllabus files. Ingestion runs in the background.",
                  },
                  {
                    n: "02",
                    icon: Brain,
                    title: "Chat and practice",
                    body: "Ask anything from your material. Vague questions get clarified; gaps are labeled honestly.",
                  },
                  {
                    n: "03",
                    icon: FileText,
                    title: "Tests and reports",
                    body: "Sit previous-year or adaptive papers, then open a report that shows what to fix next.",
                  },
                ] as const
              ).map((s) => (
                <li key={s.n} className="relative">
                  <span className="text-xs font-semibold tracking-widest text-blue-600">
                    {s.n}
                  </span>
                  <s.icon className="mt-4 size-5 text-slate-900 dark:text-slate-100" />
                  <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Exam chips */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">
            Exams we support
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {(
              [
                { label: "NEET", icon: GraduationCap },
                { label: "JEE", icon: BookOpen },
                { label: "Other", icon: FileText },
              ] as const
            ).map((e) => (
              <span
                key={e.label}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium dark:border-slate-800 dark:bg-slate-900"
              >
                <e.icon className="size-4 text-blue-600" aria-hidden />
                {e.label}
              </span>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className="border-t border-slate-200 bg-white py-24 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-3xl font-semibold tracking-tight">FAQ</h2>
            <div className="mt-8">
              <LandingFaq />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-slate-200 py-20 dark:border-slate-800">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to study from your notes?
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400">
              Free to start. Bring a PDF and ask your first question in minutes.
            </p>
            <Link
              href="/sign-up"
              className={cn(buttonVariants({ size: "lg" }), "mt-8 gap-2")}
            >
              Start free
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-12 dark:border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">ExamGPT</p>
            <p className="mt-1 text-xs text-slate-500">
              AI exam prep for competitive students in India.
            </p>
          </div>
          <nav className="flex flex-wrap gap-5 text-sm text-slate-500">
            <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-slate-100">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900 dark:hover:text-slate-100">
              Terms
            </Link>
            <Link href="/sign-up" className="hover:text-slate-900 dark:hover:text-slate-100">
              Sign up
            </Link>
            <Link href="/sign-in" className="hover:text-slate-900 dark:hover:text-slate-100">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function FeatureVisual({
  kind,
}: {
  kind: "citations" | "exam" | "report" | "adaptive";
}) {
  if (kind === "exam") {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative aspect-[16/10] w-full">
          <Image
            src="/exam-window.jpeg"
            alt="Exam window screenshot"
            fill
            className="object-cover object-top"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {kind === "citations" && (
        <div className="space-y-3">
          <div className="ml-auto max-w-[85%] rounded-2xl bg-blue-600 px-4 py-2.5 text-sm text-white">
            Explain Carnot cycle from my thermo notes
          </div>
          <div className="max-w-[90%] rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
            Heat engines convert heat into work with efficiency…
            <p className="mt-2 text-xs font-medium text-blue-600">
              Thermo Book, p. 42
            </p>
          </div>
        </div>
      )}
      {kind === "report" && (
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <span className="text-sm font-medium text-slate-500">Score</span>
            <span className="text-3xl font-semibold">72%</span>
          </div>
          <div className="flex h-24 items-end gap-2">
            {[40, 55, 48, 62, 72].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-blue-600/80"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {["Current electricity", "Organic", "Kinematics"].map((t) => (
              <span
                key={t}
                className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs dark:border-slate-700"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {kind === "adaptive" && (
        <div className="space-y-3 text-sm">
          <p className="font-medium">Adaptive practice paper</p>
          <p className="text-slate-500">15 questions · weak-topic weighted</p>
          <div className="space-y-2 pt-2">
            {["Electrostatics (weak)", "Thermodynamics", "Optics"].map((t) => (
              <div
                key={t}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <span>{t}</span>
                <span className="text-xs text-slate-500">5 Q</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
