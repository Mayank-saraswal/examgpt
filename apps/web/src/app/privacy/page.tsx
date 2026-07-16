import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — ExamGPT",
  description:
    "How ExamGPT collects, uses, and deletes student data under India DPDP-aware practices.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12 prose-sm">
      <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-[var(--eg-muted-fg)]">
        Last updated: 16 July 2026. This draft is written for product launch and
        store submission; it is not formal legal advice.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-7 text-[var(--eg-fg)]">
        <h2 className="text-lg font-semibold">Who we are</h2>
        <p>
          ExamGPT is an AI-powered exam preparation service for students (web
          and mobile). Contact for privacy requests: privacy@examgpt.app
          (placeholder — replace with your operator email).
        </p>

        <h2 className="text-lg font-semibold">Data we store</h2>
        <ul className="list-disc space-y-1 pl-5 text-[var(--eg-muted-fg)]">
          <li>
            <strong className="text-[var(--eg-fg)]">Account:</strong> Clerk user
            id, email, name, age, exam profile (type, target year/score).
          </li>
          <li>
            <strong className="text-[var(--eg-fg)]">Study content:</strong>{" "}
            uploaded notes/books/syllabus files (object storage), OCR text,
            embeddings in a private vector index filtered by user id.
          </li>
          <li>
            <strong className="text-[var(--eg-fg)]">Learning activity:</strong>{" "}
            chats, citations, mock tests, attempts, responses, telemetry
            events, reports, and AI usage logs (tokens/cost).
          </li>
          <li>
            <strong className="text-[var(--eg-fg)]">Device:</strong> optional
            Expo push tokens for paper/report ready alerts.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">How we use data</h2>
        <p className="text-[var(--eg-muted-fg)]">
          To provide tutoring from your notes, generate and grade practice
          papers, produce performance reports, improve reliability, enforce
          quotas/rate limits, and send optional notifications you enable.
        </p>

        <h2 className="text-lg font-semibold">AI processing</h2>
        <p className="text-[var(--eg-muted-fg)]">
          Study text and images may be sent to AI providers you configure
          (e.g. OpenAI, Google, OpenRouter) to OCR, embed, answer, extract
          questions, and write reports. Providers process data under their
          terms. We instruct models not to invent page citations for content
          not retrieved from your notes.
        </p>

        <h2 className="text-lg font-semibold">Sharing</h2>
        <p className="text-[var(--eg-muted-fg)]">
          We do not sell your notes or attempt history. Infrastructure
          subprocessors (database, object storage, auth, background jobs,
          optional analytics/error tracking) process data only to run the
          service. Platform previous-year papers are shared read-only catalog
          content; your attempts and reports remain yours.
        </p>

        <h2 className="text-lg font-semibold">Retention &amp; deletion</h2>
        <p className="text-[var(--eg-muted-fg)]">
          You may delete your account in the product (`deleteAccount`), which
          removes relational user data and triggers cleanup of vectors, stored
          files, and long-term memory where configured. Residual backups may
          persist for a limited operational period. Under India&apos;s Digital
          Personal Data Protection Act (DPDP) principles, you may request
          access, correction, or erasure of personal data we hold about you.
        </p>

        <h2 className="text-lg font-semibold">Security</h2>
        <p className="text-[var(--eg-muted-fg)]">
          Access to user data is scoped by authenticated user id on every
          query. Uploads use presigned URLs; production file storage is private.
          No security measure is perfect — please use a strong account password
          and report issues promptly.
        </p>

        <h2 className="text-lg font-semibold">Children</h2>
        <p className="text-[var(--eg-muted-fg)]">
          The product is aimed at secondary and college-age exam aspirants.
          If you are under the age of digital consent in your jurisdiction,
          use the service only with a parent or guardian.
        </p>

        <h2 className="text-lg font-semibold">Changes</h2>
        <p className="text-[var(--eg-muted-fg)]">
          We may update this policy; the date above will change. Material
          changes will be highlighted in-app when practical.
        </p>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-[var(--eg-primary)] hover:underline">
          Back to home
        </Link>
        {" · "}
        <Link href="/terms" className="text-[var(--eg-primary)] hover:underline">
          Terms of Service
        </Link>
      </p>
    </article>
  );
}
