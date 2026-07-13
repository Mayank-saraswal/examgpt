<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `bunx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# ExamGPT — Agent Guidelines

You are building **ExamGPT**: an AI-powered exam-preparation platform (iOS app, Android app, and website) for students preparing for NEET, JEE, and other competitive exams. Users upload their syllabus, notes, and books; the system builds a RAG knowledge base over them; users chat with an AI tutor that answers **from their own notes with page-level citations**, take CBT (computer-based test) mock exams from previous-year papers or AI-generated papers, and receive deep personalized performance reports.

The complete task list, architecture, schema, and phase plan live in **`TASKS.md`**. Read it before starting any work. Work through it phase by phase, top to bottom. Tick checkboxes as you complete tasks.

## Golden rules

1. **Read `TASKS.md` first.** Never invent scope. If a task is ambiguous, choose the simplest interpretation consistent with TASKS.md and leave a `NOTE:` comment in the PR/commit description.
2. **Never guess an API.** If you are not certain a package API exists, open its docs or its source in `node_modules` and confirm. Do not write code against APIs from memory for: Next.js (see warning above), Expo, Clerk, Inngest, Qdrant client, mem0, Vercel AI SDK, tRPC.
3. **Verify before "done".** A task is complete only when `bun run typecheck`, `bun run lint`, and `bun run test` pass at the workspace root, and the affected app actually runs (`bun run dev`). Never mark a checkbox on code you have not executed.
4. **End-to-end typesafety is non-negotiable.** DB → Prisma → tRPC → client must be one unbroken type chain. No `any`, no `as unknown as`, no `@ts-ignore`/`@ts-expect-error` (if truly unavoidable, add a comment explaining the upstream issue). `strict: true` everywhere.
5. **Validate every boundary with Zod.** All tRPC inputs, all env vars (fail fast at boot via a typed `env.ts`), all LLM outputs (`generateObject` with a Zod schema — never parse free text), all webhook payloads, all Inngest event payloads.
6. **One business-logic home: the server.** The Next.js app and Expo app are thin clients over the same tRPC API. Never duplicate logic in a client. Never call an AI provider or the database from client code.
7. **All AI calls go through `packages/ai`.** Never import a provider SDK or hardcode a model ID anywhere else. Model IDs come from the registry (env-overridable). See "AI integration rules".
8. **Anything slower than ~2 seconds runs in Inngest**, not in a request handler: OCR, embedding, paper extraction, paper generation, report analysis. The user is never blocked waiting on a long job; they get status updates and a push notification when done.
9. **User data isolation is a security invariant.** Every Postgres query and every Qdrant search MUST filter by the authenticated `userId` from Clerk. Never accept a `userId` from client input. Write this filter first, before the rest of the query.
10. **No fabricated citations, ever.** The product's core trust promise is "this answer is from YOUR notes, page N". Citations may only be constructed from actual retrieved chunk metadata. If retrieval finds nothing above threshold, the AI must say the answer is not in the user's notes and clearly label any web-sourced fallback.

## Tech stack (locked — do not substitute)

| Concern | Choice |
|---|---|
| Monorepo | Turborepo + bun workspaces |
| Website | Next.js (already in repo — becomes `apps/web`) |
| Mobile | Expo (React Native), Expo Router, EAS |
| API server | Express + tRPC v11 (`@trpc/server/adapters/express`) |
| Auth | Clerk (Google OAuth + phone OTP) — `@clerk/nextjs`, `@clerk/clerk-expo`, `@clerk/express` |
| Relational DB | PostgreSQL + Prisma |
| Vector DB | Qdrant (`@qdrant/js-client-rest`) |
| Background jobs | Inngest |
| Long-term AI memory | mem0 (`mem0ai`) |
| File storage | S3-compatible (Cloudflare R2), presigned upload URLs |
| AI abstraction | Vercel AI SDK (`ai`) with `@ai-sdk/openai`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider` |
| Web styling | Tailwind CSS v4 + shadcn/ui |
| Mobile styling | NativeWind + react-native-reusables (shadcn for RN) |
| Icons | `lucide-react` (web), `lucide-react-native` (mobile) — ONLY this icon library |
| Push notifications | Expo Push (`expo-server-sdk` on server) |
| Client server-state | TanStack Query via tRPC client |
| Local-first mobile storage | expo-sqlite (chat cache, exam event queue) |

## AI integration rules

- The user owns **direct OpenAI keys** and **direct Google (Gemini) keys**. Everything else (Anthropic, Perplexity, Mistral, etc.) is accessed **through OpenRouter**. All three providers are wired via the Vercel AI SDK so models are interchangeable.
- `packages/ai` exposes a **model registry**: a map from *task name* → configured model instance. Task names: `ocr`, `vision-extract`, `embedding`, `chat-rag`, `intent-agent`, `report-analysis`, `paper-generation`, `web-search`, `title-gen`. Every model ID is read from env with a sane default. Nothing outside `packages/ai` may know which vendor serves a task.
- Before using any model ID, **verify it exists**: check the provider's model list (OpenRouter: `GET https://openrouter.ai/api/v1/models`). Model names in your training data may be outdated.
- Structured outputs: always `generateObject`/`streamObject` with a Zod schema. Extraction tasks (OCR post-processing, question extraction) run at `temperature: 0`.
- Every AI call must have: a timeout, retry with backoff (in Inngest steps use `step.run` retries), a cost log row (tokens in/out, task name, userId), and a fallback model where TASKS.md specifies one.
- Embeddings: the embedding model is **frozen after first ingestion** (switching requires re-embedding everything). Store the model name + dimension in the Qdrant collection metadata and assert it at startup.

## RAG anti-hallucination rules (product behavior)

- Retrieval → rerank/filter by score threshold → answer. If the best score is below threshold: reply "मुझे यह आपके notes में नहीं मिला" (localized appropriately), then offer web search; label web results as **"from the web, not your notes"**.
- The chat system prompt must instruct the model: answer ONLY from provided context chunks; every factual claim carries a citation `[bookName, p. N]`; if context is insufficient, say so — do not fill gaps from parametric knowledge.
- Citations are rendered as deep links: `/library/{documentId}?page={n}` (web) and `examgpt://library/{documentId}?page={n}` (mobile), opening the PDF viewer at that exact page.
- Grading answers in reports: the correct answer comes from the extracted answer key when present; otherwise the model must solve the question AND cross-check against retrieved notes/web before asserting correctness. Mark confidence; low-confidence gradings are flagged in the UI as "verify this answer".
- User intent: queries are first expanded/rewritten (HyDE-style) before retrieval so vague or misspelled questions still match. If retrieval confidence is low AND the query is vague, escalate to the `intent-agent` model to ask ONE clarifying question — never dump "no results".

## Design system rules (strict)

- **No emoji anywhere in UI** (web, mobile, notifications). Use lucide icons.
- **No purple/violet/indigo anywhere** — not in the palette, not in charts, not in gradients. This includes the exam palette: real NTA UIs use purple for "Marked for Review"; we use **amber** instead (see TASKS.md exam spec).
- **No glassmorphism / "liquid glass" / frosted blur panels.** Flat, clean, high-contrast surfaces with subtle borders and shadows.
- Palette: neutral slate/zinc base; primary **blue** (#2563eb family); success green, error red, warning amber. Define once as Tailwind theme tokens in `packages/ui` config and reuse in both apps. Light + dark mode from day one (`next-themes` web, RN color scheme mobile).
- shadcn/ui components on web; react-native-reusables on mobile. Do not hand-roll a component that either library provides. Keep component code copied into the repo (that's the shadcn model) under `src/components/ui`.
- Hindi/Hinglish users: UI copy in simple English (v1), but all text goes through a `t()` copy module from day one so localization is a string-file change later.

## API and data rules

- tRPC routers live in `packages/api`, composed into one `appRouter`. Feature routers: `user`, `onboarding`, `documents`, `chat`, `tests`, `attempts`, `reports`, `notifications`.
- Protected-by-default: the base procedure requires a Clerk session; a rare `publicProcedure` must justify itself with a comment.
- Errors: throw `TRPCError` with correct codes (`UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `PRECONDITION_FAILED`, `TOO_MANY_REQUESTS`). Clients map codes to friendly messages centrally — never show raw error strings to users.
- Prisma: migrations checked in; never `db push` against a shared DB; every model has `createdAt`/`updatedAt`; soft-delete (`deletedAt`) for user-facing content (documents, chats, tests).
- Uploads: client → presigned URL → R2 directly. Never stream file bytes through the API server. Validate MIME + size server-side when issuing the URL and again in the ingestion job.
- Idempotency: test submission and document ingestion must be idempotent (unique keys / Inngest idempotency) — double-tap or retry must not create duplicates.

## Background job rules (Inngest)

- Every pipeline stage is its own `step.run` so retries are granular. Steps must be idempotent.
- Every job updates a status field (`PENDING → PROCESSING → READY/FAILED`) that clients poll or subscribe to; failures store a user-readable `failureReason`.
- Per-user concurrency caps and rate limits on expensive jobs (ingestion, report generation) to protect cost.
- Jobs send an Expo push notification on completion where TASKS.md specifies (paper ready, report ready, ingestion done).

## Verification workflow (definition of done)

For every task, in order:
1. `bun run typecheck` — zero errors.
2. `bun run lint` — zero errors (warnings allowed only with justification).
3. `bun run test` — all tests pass; new logic in `packages/*` has unit tests (Vitest). RAG prompts/pipelines have at least a smoke test with mocked model calls.
4. Run the affected app (`bun run dev` in `apps/web` / `apps/server`; `bunx expo start` for mobile) and exercise the changed flow by hand. For UI work, check light + dark mode and mobile viewport.
5. For exam-engine and report logic: run the seeded demo flow (see TASKS.md Phase 5 acceptance) end-to-end.
6. Update the checkbox in `TASKS.md` and commit with a conventional-commit message (`feat:`, `fix:`, `chore:`...). Small, single-purpose commits.

## Do NOT

- Do not add state management libraries (Redux/Zustand/Jotai) — TanStack Query + React state is sufficient. Justify any exception in TASKS.md first.
- Do not add a second UI kit, CSS-in-JS, or icon library.
- Do not call LLMs from Next.js server components/actions or Expo — only `apps/server` and Inngest functions.
- Do not store secrets in clients. `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` may only contain publishable values (Clerk publishable key, API URL).
- Do not trust the client for: timestamps, exam timing, scores, userId, file types. Server decides all of these.
- Do not skip empty/loading/error states on any screen. Every list has an empty state; every async action has pending + failure UI.
- Do not commit generated files, `.env`, or lockfile churn unrelated to your change.
