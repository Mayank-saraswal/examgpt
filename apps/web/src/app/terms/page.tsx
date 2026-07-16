import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — ExamGPT",
  description: "Terms governing use of the ExamGPT exam preparation service.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-[var(--eg-muted-fg)]">
        Last updated: 16 July 2026. Draft for product launch; not formal legal
        advice.
      </p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-[var(--eg-muted-fg)]">
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            1. Agreement
          </h2>
          <p>
            By creating an account or using ExamGPT (website or mobile apps),
            you agree to these Terms and the Privacy Policy.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            2. The service
          </h2>
          <p>
            ExamGPT provides AI-assisted study tools: note ingestion, tutoring
            chat with citations, mock computer-based tests, adaptive paper
            generation, and performance reports. Features may change as we
            improve the product.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            3. Accounts
          </h2>
          <p>
            You must provide accurate signup information and keep credentials
            secure. You are responsible for activity under your account. We may
            suspend accounts that abuse rate limits, quotas, or other users.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            4. Your content
          </h2>
          <p>
            You retain rights to notes and materials you upload. You grant us a
            limited license to store, process, and display that content solely
            to provide the service (including AI processing and indexing). Do
            not upload content you do not have rights to use.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            5. AI outputs
          </h2>
          <p>
            AI answers, extractions, gradings, and reports can be wrong.
            ExamGPT is a study aid — not a substitute for official exam
            authorities, textbooks, or teachers. Always verify high-stakes
            information. Citations are only constructed from retrieved note
            chunks when present; absence of coverage will be stated when
            possible.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            6. Acceptable use
          </h2>
          <p>
            No reverse engineering for abuse, no automated scraping that harms
            the service, no uploading malware, and no use that violates
            applicable law or exam board rules.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            7. Fees &amp; AI cost
          </h2>
          <p>
            Where you supply API keys or pay for usage, you remain responsible
            for third-party provider charges. We may enforce daily spend caps
            to protect against runaway cost.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            8. Termination
          </h2>
          <p>
            You may delete your account at any time. We may terminate access
            for Terms violations. After deletion, recovery of content is not
            guaranteed.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            9. Disclaimers
          </h2>
          <p>
            The service is provided &quot;as is&quot; without warranties of
            uninterrupted or error-free operation. To the extent permitted by
            law, liability is limited to amounts you paid us (if any) in the
            three months before a claim.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--eg-fg)]">
            10. Governing law
          </h2>
          <p>
            These Terms are governed by the laws of India, without regard to
            conflict-of-law rules, unless a mandatory consumer protection law
            in your place of residence requires otherwise.
          </p>
        </div>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-[var(--eg-primary)] hover:underline">
          Back to home
        </Link>
        {" · "}
        <Link
          href="/privacy"
          className="text-[var(--eg-primary)] hover:underline"
        >
          Privacy Policy
        </Link>
      </p>
    </article>
  );
}
