"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = [
  {
    q: "Is my data private?",
    a: "Your notes, chats, attempts, and reports are stored under your account and filtered by your user id on every query. We do not sell personal study content. You can delete your account and associated data from settings (deleteAccount).",
  },
  {
    q: "How do citations work?",
    a: "When the tutor answers from your notes, every factual claim is tied to retrieved chunks with book name and page. Links open the library viewer at that page. If nothing relevant is found, the app says so instead of inventing citations.",
  },
  {
    q: "Do mock tests look like the real NTA exam?",
    a: "Yes. The exam portal mirrors NTA palette states (including purple for marked-for-review), server-controlled timing, and submit rules where answered-and-marked still counts.",
  },
  {
    q: "Can I use ExamGPT for JEE and NEET?",
    a: "NEET and JEE are first-class with bundled syllabus topics. Other exams are supported when you upload a custom syllabus (PDF, image, or URL).",
  },
  {
    q: "What happens if I upload handwritten notes?",
    a: "The ingestion pipeline OCRs printed and handwritten pages, tables, and figures into your private knowledge base. Large books run in the background so you are never blocked.",
  },
  {
    q: "Are AI-generated papers safe for practice?",
    a: "Generated papers are adaptive practice grounded in your syllabus and weak topics. They are text-only in v1 and labeled so they are not confused with official past papers.",
  },
  {
    q: "Do I need to pay for AI usage?",
    a: "Your workspace uses your configured AI provider keys and budgets. Per-user daily spend caps protect cost; usage is logged for transparency.",
  },
  {
    q: "Can I delete everything?",
    a: "Yes. Account deletion removes your relational data and triggers cleanup of vectors, files, and memory. See Privacy for India DPDP-oriented rights language.",
  },
] as const;

export function LandingFaq() {
  return (
    <Accordion className="border-[var(--eg-border)]">
      {FAQ.map((item, i) => (
        <AccordionItem key={item.q} value={`faq-${i}`}>
          <AccordionTrigger className="text-[var(--eg-fg)] hover:no-underline">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 text-sm leading-6 text-[var(--eg-muted-fg)]">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
