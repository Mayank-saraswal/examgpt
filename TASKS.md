# ExamGPT — Complete Build Plan & Task List

> **How to use this file:** Work phases in order (0 → 8). Within a phase, work tasks top to bottom. Tick `[x]` only after the AGENTS.md "definition of done" passes. Do not start a phase until the previous phase's **Acceptance** checklist passes. If you discover a needed task that isn't listed, add it under the right phase before doing it.

---

## 1. Product summary

ExamGPT is a personal AI exam tutor for competitive-exam students (NEET, JEE, or any custom exam) on iOS, Android, and web.

Core loops:
1. **Onboard** — Login (Google OAuth / email OTP+password via Clerk — **no phone/SMS auth**: Clerk SMS doesn't support Indian numbers) → profile (name, age, exam). Exam = NEET | JEE | OTHER. For OTHER, the user supplies a syllabus (PDF / image / URL) which the system parses and attaches to their profile.
2. **Ingest** — User uploads notes/books (PDFs, images, PDF links). Background pipeline OCRs every page (printed + handwritten + tables + diagrams), chunks with page metadata, embeds, and indexes into Qdrant. User is never blocked.
3. **Chat** — AI tutor answers questions **from the user's own notes**, with page-level citations that deep-link into the PDF viewer at the exact page. Falls back to clearly-labeled web answers when notes don't cover it. Per-chat history + global memory (mem0: profile, weak topics, past performance).
4. **Test** — Two sources: (a) upload a previous-year paper (PDF/images/link) → validated against syllabus → questions extracted → real CBT exam window (NTA-style) with server-side timer; (b) AI-generated paper from syllabus + notes with user-chosen topic mix, count, duration — biased toward the user's weak topics.
5. **Analyze** — Full behavior telemetry during the attempt (per-question time, visits, option changes, review marks). After submit: grading, per-question explanations cited from the user's notes (web fallback), topic strength/weakness map, time-management analysis, cutoff comparison (web search), and a final report. Report summary is written to mem0 so the chat tutor knows it.

Languages: question papers are mostly English (v1). UI copy English, architecture ready for Hindi later.

---

## 2. Architecture

```
apps/mobile (Expo RN)  ─┐
                        ├── tRPC over HTTPS ──► apps/server (Express + tRPC v11)
apps/web (Next.js 16)  ─┘                          │
                                                   ├── PostgreSQL (Prisma)      relational data
                                                   ├── Qdrant                    vectors (notes/syllabus/questions)
                                                   ├── R2/S3                     files (presigned direct upload)
                                                   ├── mem0                      long-term user memory
                                                   ├── Clerk                     auth (JWT verified per request)
                                                   └── Inngest ──► background pipelines
                                                                    (ingestion, extraction, generation,
                                                                     analysis/report, notifications)
packages/ai — model registry (OpenAI direct, Google direct, everything else via OpenRouter)
```

Monorepo layout (Turborepo + bun workspaces):

```
apps/
  web/        ← existing Next.js app moves here
  mobile/     ← Expo app (Expo Router)
  server/     ← Express + tRPC + Inngest serve endpoint
packages/
  api/        ← tRPC routers + procedures (imported by server; types imported by clients)
  db/         ← Prisma schema + client + seed
  ai/         ← model registry, prompts, RAG utils, embedding utils
  validators/ ← shared Zod schemas (single source of truth for shapes)
  ui-tokens/  ← shared design tokens (colors, spacing) consumed by both Tailwind configs
  config/     ← shared tsconfig, eslint config
```

---

## 3. AI model registry (`packages/ai`)

Providers: `@ai-sdk/openai` (direct key), `@ai-sdk/google` (direct key), `@openrouter/ai-sdk-provider` (everything else). All calls via Vercel AI SDK (`generateText` / `generateObject` / `embed` / `streamText`).

| Task key | Default model | Provider route | Env override | Notes |
|---|---|---|---|---|
| `ocr` | `gemini-3.5-flash` | Google direct | `AI_MODEL_OCR` | Pages: printed, handwritten, tables, diagrams → structured markdown + image descriptions. |
| `vision-extract` | `gemini-3.5-flash` | Google direct | `AI_MODEL_VISION_EXTRACT` | Question/option/answer-key extraction from papers. `temperature: 0`, `generateObject`. Also identifies figure bboxes for diagram crops. |
| `embedding` | `text-embedding-3-large` | OpenAI direct | `AI_MODEL_EMBEDDING` | English-heavy corpus. FROZEN after first ingestion. |
| `chat-rag` | `gpt-4.1` | OpenAI direct | `AI_MODEL_CHAT` | Streaming tutor answers with citations. |
| `intent-agent` | `z-ai/glm-5.2` | OpenRouter | `AI_MODEL_INTENT` | Vague-query clarifying questions. |
| `explain` | `z-ai/glm-5.2` | OpenRouter | `AI_MODEL_EXPLAIN` | Per-question text explanations, answer cross-checks, paper-gen quality-gate. |
| `explain-vision` | `anthropic/claude-sonnet-5` | OpenRouter | `AI_MODEL_EXPLAIN_VISION` | Explanations when question has `imageKeys` (cropped figure attached). Alts: `gemini-3.5-flash` (Google, once billing), `gpt-5.2` (OpenAI), `z-ai/glm-5v-turbo` (budget). |
| `report-analysis` | `x-ai/grok-4.5` | OpenRouter | `AI_MODEL_REPORT` | Report narrative / topic coaching. Alt: `anthropic/claude-opus-4.8`. Override must fully switch model+provider. |
| `paper-generation` | `anthropic/claude-sonnet-5` | OpenRouter | `AI_MODEL_PAPERGEN` | Original MCQs from syllabus+notes. Text-only in v1 (no diagram gen). |
| `web-search` | `perplexity/sonar-pro-search` | OpenRouter | `AI_MODEL_WEBSEARCH` | Cutoffs, missing-answer fallback. Results carry source URLs. |
| `title-gen` | `gpt-4.1-mini` | OpenAI direct | `AI_MODEL_TITLE` | Chat titles, tiny classifications. |

**Rule:** at server boot, fetch the OpenRouter model list and validate every configured OpenRouter model ID (provider=`openrouter` only); log warning + fall back to default if missing. Never hardcode model IDs outside `packages/ai/registry.ts`. IDs verified against live OpenRouter catalog on 2026-07-15.

**NOTE (2026-07-15):** OCR/vision temporarily routed to OpenAI via env override (Gemini billing pending); revert by removing `AI_MODEL_OCR` and `AI_MODEL_VISION_EXTRACT`. Registry infers provider from override model id. Optional: `AI_PROVIDER_*`.

Cost logging: every call writes `AiUsageLog { userId, task, model, tokensIn, tokensOut, costUsd, latencyMs }`. Per-user daily budget caps in the registry wrapper. **`Report.totalCostUsd`** = sum of AiUsageLog rows for that attempt's analyze pipeline (visible in admin usage summary). Side-by-side narrative compare: `bun scripts/compare-report-models.ts <attemptId> <modelId>…` → `.data/model-compare/{attemptId}/`.

---

## 4. Environment variables (`.env.example` — keep updated)

```
DATABASE_URL=
CLERK_SECRET_KEY=              CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
OPENAI_API_KEY=                GOOGLE_GENERATIVE_AI_API_KEY=
OPENROUTER_API_KEY=
QDRANT_URL=                    QDRANT_API_KEY=
INNGEST_EVENT_KEY=             INNGEST_SIGNING_KEY=
MEM0_API_KEY=
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET= R2_PUBLIC_BASE_URL=
EXPO_ACCESS_TOKEN=             # push
API_URL=                       # consumed by web/mobile as public var
AI_MODEL_* =                   # optional overrides, see registry table
```

All parsed through a Zod `env.ts` per app; boot fails loudly on missing vars.

---

## 5. Database schema (Prisma — implement in `packages/db`)

```prisma
model User {           // identity mirror of Clerk (synced via Clerk webhook)
  id           String  @id            // = Clerk userId
  email        String? @unique
  phone        String? @unique
  name         String?
  age          Int?
  onboarded    Boolean @default(false)
  pushTokens   PushToken[]
  exam         ExamProfile?
  // relations: documents, chats, tests, attempts, reports, usage
}

model ExamProfile {
  id          String   @id @default(cuid())
  userId      String   @unique
  type        ExamType                  // NEET | JEE | OTHER
  customName  String?                   // when OTHER
  targetYear  Int?
  syllabusDocumentId String?            // for OTHER: uploaded/fetched syllabus doc
  syllabusStatus     IngestStatus @default(PENDING)
  syllabusTopics     Json?              // normalized topic tree extracted from syllabus
}

model Document {
  id          String   @id @default(cuid())
  userId      String
  kind        DocumentKind              // SYLLABUS | NOTES | BOOK | PAPER
  title       String
  sourceType  SourceType                // UPLOAD_PDF | UPLOAD_IMAGE | URL
  fileKey     String?                   // R2 key
  sourceUrl   String?
  mimeType    String?
  sizeBytes   Int?
  pageCount   Int?
  ingestStatus IngestStatus @default(PENDING)  // PENDING|PROCESSING|READY|FAILED
  ingestProgress Int @default(0)               // 0-100, pages done / total
  failureReason  String?
  contentHash String?                   // dedupe identical uploads
  deletedAt   DateTime?
}

model DocumentPage {                    // 1 row per page — powers deep links & progress
  id          String @id @default(cuid())
  documentId  String
  pageNumber  Int
  ocrStatus   IngestStatus
  hasHandwriting Boolean @default(false)
  hasImages      Boolean @default(false)
  hasTables      Boolean @default(false)
  markdown    String?                   // OCR output (also chunk source)
  @@unique([documentId, pageNumber])
}

model Chat {
  id        String   @id @default(cuid())
  userId    String
  title     String
  deletedAt DateTime?
}

model Message {
  id        String   @id @default(cuid())
  chatId    String
  clientId  String   @unique            // client-generated UUID → idempotent local-first sync
  role      MessageRole                 // USER | ASSISTANT
  content   String
  citations Json?    // [{documentId, title, pageNumber, chunkId, score}]
  webSources Json?   // [{url, title}] when web fallback used
  createdAt DateTime @default(now())
}

model Test {
  id          String @id @default(cuid())
  userId      String
  source      TestSource                // PYQ_UPLOAD | AI_GENERATED
  title       String
  paperDocumentId String?               // when PYQ_UPLOAD
  paperYear   Int?
  config      Json?                     // AI_GENERATED: {topics[], count, durationMin, difficulty}
  durationMin Int
  totalMarks  Int
  markingScheme Json                    // {correct:+4, wrong:-1, unattempted:0} — per exam type
  status      TestStatus                // EXTRACTING|GENERATING|NEEDS_REVIEW|READY|FAILED
  syllabusMatchScore Float?             // 0-1 from validation step
  failureReason String?
  deletedAt   DateTime?
}

model Question {
  id          String @id @default(cuid())
  testId      String
  index       Int                        // 1-based position
  section     String?                    // e.g. Physics / Chemistry / Biology
  text        String                     // markdown; may include image refs
  imageKeys   String[]                   // question figures stored in R2
  options     Json                       // [{key:"A", text, imageKey?}]
  correctKey  String?                    // from answer key or AI-solved
  answerConfidence Float?                // 1.0 = from official key; <1 = AI-solved
  topic       String?
  subtopic    String?
  explanationCache Json?                 // filled during report generation
  @@unique([testId, index])
}

model Attempt {
  id          String @id @default(cuid())
  testId      String
  userId      String
  status      AttemptStatus              // IN_PROGRESS | SUBMITTED | ANALYZED
  startedAt   DateTime
  endsAt      DateTime                   // server-computed: startedAt + duration
  submittedAt DateTime?
  submitType  SubmitType?                // MANUAL | AUTO_TIMEOUT
  score       Float?
  @@unique([testId, userId, startedAt])
}

model AttemptEvent {                     // raw behavior telemetry (append-only)
  id         BigInt @id @default(autoincrement())
  attemptId  String
  questionIndex Int
  type       EventType                  // VISIT|LEAVE|SELECT|CHANGE|CLEAR|MARK_REVIEW|UNMARK_REVIEW|SAVE_NEXT|APP_BACKGROUND|APP_FOREGROUND
  optionKey  String?
  clientTs   DateTime                   // client clock (for ordering)
  serverTs   DateTime @default(now())   // authoritative
  batchId    String                     // idempotent batch upload
  @@index([attemptId, questionIndex])
}

model Response {                         // final per-question state (derived at submit)
  id           String @id @default(cuid())
  attemptId    String
  questionIndex Int
  selectedKey  String?
  paletteState PaletteState             // NOT_VISITED|NOT_ANSWERED|ANSWERED|MARKED|ANSWERED_MARKED
  timeSpentSec Int
  visitCount   Int
  optionChanges Int
  isCorrect    Boolean?
  marksAwarded Float?
  @@unique([attemptId, questionIndex])
}

model Report {
  id          String @id @default(cuid())
  attemptId   String @unique
  userId      String
  status      IngestStatus               // reuse PENDING|PROCESSING|READY|FAILED
  score       Float?
  maxScore    Float?
  percentile  Float?                     // vs cutoff data when found
  summary     String?                    // narrative from report model
  topicAnalysis Json?                    // [{topic, attempted, correct, avgTimeSec, verdict: STRONG|WEAK|MODERATE}]
  timeAnalysis  Json?                    // pacing, confusion flags per question
  cutoffData    Json?                    // {year, category cutoffs, sourceUrls[], verdict}
  recommendations Json?                  // ordered study plan items with doc/page refs
}

model PushToken { userId, token @unique, platform, updatedAt }
model AiUsageLog { userId, task, model, tokensIn, tokensOut, costUsd, latencyMs, createdAt }
```

(Enums as referenced. Add `createdAt`/`updatedAt` on all models. Write real Prisma — this is the shape spec, not literal code.)

### Qdrant design

- **One collection per data type, multi-tenant by payload** (Qdrant's recommended pattern), mandatory `userId` filter on every query + payload index on `userId`:
  - `study_chunks` — chunks from NOTES/BOOK docs. Payload: `{userId, documentId, title, pageNumber, chunkIndex, topic?, hasImage, text}`
  - `syllabus_chunks` — syllabus topics/units. Payload: `{userId, documentId, topic, unit}`
  - `question_bank` — every question the user has ever faced + generated. Payload: `{userId, testId, questionIndex, topic, wasCorrect?}` — powers "don't repeat questions" + weak-topic paper generation.
- Named vectors: dense (embedding model dim). Enable sparse vector (BM25/minicoil) alongside for hybrid search; fuse with RRF. Store embedding model name in collection metadata; assert on boot.
- Chunking: per page → split markdown ~400–600 tokens with 15% overlap, never across page boundaries (page number is the citation unit). Tables kept whole. Diagram descriptions chunked with a `[FIGURE]` prefix.

---

## 6. tRPC router map (`packages/api`)

```
user:        me, updateProfile, deleteAccount
onboarding:  setExam, uploadSyllabus(presign), fetchSyllabusFromUrl, status
documents:   presignUpload, registerUpload, addByUrl, list, get, delete, ingestStatus (poll)
chat:        create, list, get, delete, sendMessage (SSE/stream via server route), syncMessages (batch, idempotent by clientId)
tests:       createFromPaper, createGenerated, list, get, reviewQuestions (fix extraction), retryExtraction, confirmMismatchedPaper
attempts:    start, ingestEvents (batch), saveResponse, submit, resume, state
reports:     get, listForUser
notifications: registerPushToken, list, markRead
```

Streaming chat: tRPC v11 supports streaming responses; if friction on RN, use a plain Express `POST /api/chat/stream` (SSE) guarded by the same Clerk middleware — decide in Phase 3 and document.

### Inngest functions (`apps/server/inngest/`)

| Function | Trigger event | Steps |
|---|---|---|
| `document/ingest` | `document.uploaded` | fetch file → split pages → classify page (printed/handwritten/diagram) → OCR per page (batched, concurrency-capped) → chunk → embed → upsert Qdrant → mark READY → push notify |
| `syllabus/ingest` | `syllabus.uploaded` | OCR/fetch → extract normalized topic tree (`generateObject`) → store + embed |
| `paper/extract` | `test.paper_uploaded` | OCR → **syllabus match check** (embed sample questions, avg similarity vs syllabus_chunks; < threshold → status NEEDS_REVIEW + notify "wrong paper?") → extract questions/options/key (`vision-extract`, temp 0) → validate (every Q has text + ≥2 options; MCQ sanity) → solve missing answers (flag confidence) → READY + push "paper ready" |
| `paper/generate` | `test.generate_requested` | pull syllabus topics + weak topics (question_bank + last reports) → retrieve notes context per topic → generate questions (`generateObject`, batched per topic) → dedupe vs question_bank → assemble → READY + push |
| `attempt/analyze` | `attempt.submitted` | derive Responses from events → grade → per-question: retrieve notes refs (RAG) or web fallback → topic aggregation → time/confusion analysis → cutoff web search (PYQ only) → report narrative (`report-analysis`) → save Report → write summary to mem0 → push "result ready" |
| `chat/memory-sync` | `chat.message_created` | async mem0 add (never blocks chat) |
| `user/cleanup` | `user.deleted` (Clerk webhook) | delete R2 files, Qdrant points, mem0 memories, DB rows |

---

## 7. Phases

### Phase 0 — Monorepo foundation
- [x] Restructure into Turborepo + bun workspaces; move existing Next.js app to `apps/web` (preserve its Next 16 setup; fix imports). Add `turbo.json` pipelines: `dev`, `build`, `typecheck`, `lint`, `test`.
- [x] Create `apps/server`: Express + tRPC v11 (`@trpc/server/adapters/express`), CORS locked to app origins, health endpoint, Zod-validated `env.ts`, pino logger, Inngest serve endpoint mounted.
- [x] Create `apps/mobile`: Expo (SDK 53) + Expo Router + monorepo Metro (`watchFolders`, `nodeModulesPaths`, single-React resolution). NativeWind className wiring + reusables-style Button/Input landed in Phase 1.
- [x] Create `packages/`: `api`, `db`, `ai`, `validators`, `ui-tokens`, `config` (shared `tsconfig.base.json` with `strict: true`). Shared ESLint base at `packages/config/eslint.base.mjs`.
- [x] `packages/db`: Prisma init, Postgres + Qdrant via `docker-compose.yml` (Postgres host port **5434** to avoid local conflicts). Migration `20260713195928_init` applied.
- [x] `packages/ui-tokens`: blue primary, slate neutrals, green/red/amber semantic; NO purple; light + dark CSS vars; consumed by web CSS import + mobile StyleSheet.
- [x] tRPC client wiring: web (`@trpc/tanstack-react-query`) + mobile (vanilla client + queryOptions proxy, auth header stub). Demo `health.ping` on both.
- [x] Vitest in packages; CI script `bun run check` = typecheck + lint + test.
- **Acceptance:** `bun run check` green; web renders a page showing `health.ping` result; Expo app (iOS sim or Android emu) renders the same; Prisma migrate runs against docker Postgres.
  - Verified: `bun run check` green; server `GET /trpc/health.ping` → ok; web at `:3000` mounts health UI; Expo web export bundles home route with health.ping client; Prisma migrate on docker Postgres. Device/sim visual pass: run `bun run --filter @examgpt/mobile dev` against a running server.

### Phase 1 — Auth + onboarding
- [x] Clerk setup: Google OAuth + email OTP/password. Web: custom `@clerk/nextjs` flows; Mobile: `@clerk/expo` custom flows + `useSSO` Google. *(phone OTP removed — see rework)*
- [x] **REWORK — auth strategies changed:** Removed ALL phone/SMS auth UI and flows. Replaced with **email OTP + password** sign-in/up on web AND mobile. Google OAuth unchanged via `signIn.sso` / `useSSO`. `User.phone` remains optional profile field only (webhook may still sync if present). Dev: `*+clerk_test@example.com` + OTP `424242`.
- [x] Server: Clerk JWT verification middleware for Express/tRPC context (`ctx.userId`); `protectedProcedure` base.
- [x] Clerk webhook → sync `User` rows (create/update/delete), Svix signature verified.
- [x] Onboarding flow (both clients): name, age, exam select (NEET / JEE / Other). Other → custom exam name + syllabus source picker: upload PDF, upload image(s), or paste URL.
- [x] R2 presigned upload flow (`documents.presignUpload` → PUT → `registerUpload`), MIME/size validation both ends (max 100MB PDF, 20MB/image).
- [x] `syllabus/ingest` Inngest function; NEET/JEE get bundled official syllabus seeds (checked-in JSON topic trees) — no upload needed.
- [x] Mobile permissions with graceful denial UX: camera + photo library (ask at first upload, not at launch), notifications (ask after onboarding with a value explainer screen).
- [x] Push token registration (`notifications.registerPushToken`) on both platforms.
- **Acceptance:** New user can sign up with Google AND with email OTP/password on all three surfaces (NO phone option visible anywhere); complete onboarding with each exam type; syllabus for OTHER ingests to a browsable topic tree; denied permissions don't crash any flow.
  - Code + `bun run check` green. Live Google/OTP signup requires Clerk dashboard keys + enabled strategies (see `.env.example`). Dev fallback: `Bearer user_<id>` when Clerk keys absent.

### Phase 2 — Document ingestion + library
- [x] Upload UI (both clients): notes/books via file picker, camera (mobile), or URL. Multi-file. Shows per-document progress (`ingestProgress`) with states: uploading → processing (n/m pages) → ready / failed(+reason+retry).
- [x] `document/ingest` pipeline per §6: page split (server-side `pdf-lib` single-page PDFs), page classification + OCR via `ocr` task (`gemini-3.5-flash` / `@ai-sdk/google`), tables as GFM markdown, figures as `[FIGURE: …]`, chunking + embeddings + Qdrant upsert.
- [x] Contenthash dedupe: same file re-uploaded → instant READY, no reprocessing.
- [x] PDF-by-URL: fetch server-side in Inngest (size cap, content-type check, timeout); reject HTML pages with clear error.
- [x] Library screen: document list, tap → PDF viewer. Web: `react-pdf`/`pdfjs` at `/library/{docId}?page=n`. Mobile: WebView PDF + `examgpt://library/{docId}?page=n` (Expo-friendly).
- [x] Cost guard: per-user page-count quota (`INGEST_PAGE_QUOTA`, default 2000) enforced at presign / addByUrl with clear message.
- **Acceptance:** Upload a 50+ page mixed PDF (printed + a handwritten page + a table + a diagram) → READY with all pages OCR'd; verify a table survived as markdown and a diagram has a description; deep link opens the viewer at the exact page on web and mobile; user is never blocked during processing; kill the worker mid-job → retry resumes without duplicating Qdrant points.
  - Code + chunker unit tests (8) + `bun run check` green. Live 50+ page OCR needs Inngest dev + keys. Deterministic Qdrant IDs: `sha1(documentId:page:chunkIndex)`.
  - **Live verify (2026-07-14, `STORAGE_BACKEND=local`):** PASS on notes doc `cmrki6rvd00017kesob4ffyj4` (5p READY): page2 GFM table (`hasTables`/pipe markdown), page3 Carnot figure text, Qdrant chunks present. Library deep-link path `/library/{id}?page=2`. Fresh re-OCR during session hit Gemini free-tier 429 (20 req/day on `gemini-3.5-flash`) — `document/ingest` now marks FAILED via `onFailure` instead of stuck PROCESSING. Re-run full 50p after billing/quota reset.
  - **Live verify (2026-07-15, OpenAI OCR via env):** PASS 5p ingest doc `cmrlshwp200017krklcm1xjtk` with `AI_MODEL_OCR=gpt-4o-mini` (provider inferred openai). Single-page smoke: GFM table. Full 5p: progress→READY, page2 `hasTables` + pipe table, page3 `hasImages` + Carnot figure content, 5 Qdrant points.
  - **Live verify (2026-07-15 later, 52-page full notes):** PASS doc `cmrltzavc00017kmsdf93aq4o` (52p READY) under OpenAI `gpt-4o-mini`. Page2 GFM table, page3 `[FIGURE:…]` present; all 52 pages OCR READY. Rate-limit fix: do not throttle `/api/inngest` (step.run per page). Reassigned to Clerk user Mayank for browser library deep-links.

### Phase 3 — Chat tutor (RAG)
- [x] Chat UI (both clients): chat list, new chat, streaming responses, markdown + LaTeX rendering (exam content has formulas), citation pills under each answer → deep link to page.
- [x] RAG pipeline in `packages/ai`: query rewrite/HyDE → hybrid Qdrant search (dense+sparse, RRF) filtered by userId → score threshold → context assembly (with doc title + page per chunk) → `chat-rag` streaming answer with enforced citation format → citation post-validation (every cited page must exist in retrieved set; strip/flag any that don't).
- [x] Below-threshold path: "not in your notes" response + one-tap "search the web" → `web-search` model (`perplexity/sonar-pro-search` on OpenRouter), results visually badged as web-sourced with URLs.
- [x] Vague-query path: low retrieval confidence + short/ambiguous query → `intent-agent` asks one clarifying question.
- [x] mem0 integration: user profile facts + rolling performance summary injected into system prompt; `chat/memory-sync` writes salient facts async. mem0 outage = degrade silently, never block chat.
- [x] Local-first mobile chat: expo-sqlite cache of chats/messages, optimistic send, background sync via `chat.syncMessages` (idempotent by `clientId`); old chats load instantly offline.
- [x] Chat titles via `title-gen` after first exchange.
- **Streaming transport:** Plain Express SSE at `POST /chat/stream` (Clerk JWT in `Authorization`), not tRPC subscriptions. Reason: React Native needs custom auth headers; native EventSource (tRPC `httpSubscriptionLink`) cannot set them without a polyfill. `fetch` streaming works on web + Expo. tRPC still owns chat CRUD (`list/create/get/delete/syncMessages/pullMessages`).
- **Acceptance:** Ask a question covered in uploaded notes → answer cites correct book + page, link opens that page; ask something NOT in notes → explicit "not in your notes" + labeled web fallback (no invented citation — test 5 adversarial questions); ask a vague question ("explain that force thing") → clarifying question; airplane-mode mobile → old chats readable, queued message sends on reconnect.
  - Code + unit tests (citations + RRF + threshold path) + `bun run check` green. Live acceptance against ingested PDF: start server + ask notes/adversarial/vague questions via web `/chat` or `POST /chat/stream`.
  - **Live verify (2026-07-14):** PASS via `scripts/live-e2e-phases-2-4.ts` against READY notes: notes Q → `kind=notes` + citation to doc page 4; **5/5 adversarial** → `not_in_notes`/`clarifying` with **zero invented citations** (added lexical-support gate so RRF false positives cannot answer Kubernetes/cricket/etc.); vague path uses intent-agent clarifying when retrieval weak. mem0 search fixed to `filters.user_id` (v3 API). Mobile offline path not re-run this session (code path unchanged).

### Phase 4 — CBT test engine
- [x] Test creation UI: "Upload previous year paper" (PDF/images/URL) or "Generate a paper" (Phase 6 backend; build the config UI now behind a flag).
- [x] `paper/extract` pipeline per §6 incl. syllabus-match gate: on mismatch → user sees "This paper doesn't look like your syllabus (matched X%). Upload another, or continue anyway?" (`confirmMismatchedPaper`).
- [x] Question review screen: after extraction, user can spot-check flagged questions (low-confidence extraction/answers) and report bad ones (marks question `flagged`, excluded from scoring).
- [x] "Paper is being prepared — we'll notify you" state + push notification on READY.
- [x] **Exam window** (both clients, mobile = landscape-capable, web = full-screen route):
  - Instructions screen replicating standard NTA instructions incl. palette legend, then START TEST.
  - Question area: text + figures, options as radio list. Buttons: `SAVE & NEXT`, `CLEAR`, `SAVE & MARK FOR REVIEW`, `MARK FOR REVIEW & NEXT`, prev/next; section tabs when sections exist.
  - Palette (right panel / drawer on phone): number grid with 5 states — Not Visited (gray outline), Not Answered (red), Answered (green), Marked for Review (**amber** — house rule: no purple), Answered & Marked (amber + green dot). Counts legend. Jump-to-question.
  - Timer: server-authoritative. `attempts.start` returns `endsAt`; client renders countdown from server clock offset; server rejects events/submits after `endsAt` + small grace; client auto-submits at 0; server-side sweep (Inngest cron) force-submits any expired IN_PROGRESS attempts (handles app kill).
  - NTA scoring semantics: "Answered & Marked for Review" COUNTS as answered at submit.
- [x] Behavior telemetry: emit AttemptEvents per §5 taxonomy; queue locally (sqlite/localStorage), batch-upload every 10s + on blur/background, idempotent `batchId`; survives refresh/app-kill; `attempts.resume` restores full state (answers, palette, remaining time).
- [x] Submit flow: confirm dialog with palette summary → `attempts.submit` (idempotent) → success screen "Submitted. Your result will be announced shortly." → user freed (dashboard).
- **Acceptance:** Upload a real NEET/JEE PYQ PDF → CBT window matches spec; mismatched paper (upload a random PDF) triggers the warning path; kill the app mid-attempt → resume with correct remaining time + palette; let timer expire in background → attempt auto-submitted server-side; double-tap submit → single submission; all five palette states reachable and correctly counted.
  - Code + unit tests (palette property, scoring, server-time) + `bun run check`. Live PYQ: upload paper doc → createFromPaper → Inngest paper-extract → review/start on web `/exam/{attemptId}` and mobile.
  - **Live verify (2026-07-14):** Attempt engine PASS (local storage): mixed event stream produced palette states ANSWERED / MARKED / ANSWERED_MARKED / NOT_ANSWERED; option-change trail on Q0; submit scored 7/20; double-submit safe (non-IN_PROGRESS short-circuit). **Blocked this session:** live `paper/extract` OCR failed (`Could not OCR any pages`) due to Gemini free-tier 429 — same quota as Phase 2 re-OCR. Pipeline correctly FAILED (with `onFailure`). Re-run extract on real NEET PDF after quota reset; web `/exam/{attemptId}` still needs a Clerk session for browser UI (server-side attempt logic covered by script).
  - **Live verify (2026-07-15, real NEET PDF + OpenAI):** PASS extract on root file `NEET_2026_Answer_Key_Solution_Code_11_Download.pdf.pdf` with `PAPER_EXTRACT_MAX_PAGES=5`, `gpt-4o-mini` OCR+vision. Fixed OpenAI structured-output schema (`nullable` not bare `optional`). test `cmrlsrdor00037ksgmzmltfyh` → **READY with 8 MCQs** (Physics samples with keys). Open: http://localhost:3000/tests/cmrlsrdor00037ksgmzmltfyh (Clerk). Full-paper OCR (all pages) deferred for credits.

### Phase 5 — Analysis + report
- [x] `attempt/analyze` pipeline per §6. Grading from `markingScheme`; questions with `answerConfidence < 1` get a cross-check pass (re-solve + notes/web verify) before grading.
- [x] Per-question analysis object: correct/wrong/skipped, your answer vs correct, time spent vs test average, visits, option-change trail ("you switched B→C→B — confusion between B and C"), notes citation (doc + page + deep link) or labeled web source, short explanation.
- [x] Topic map: per-topic accuracy/time → STRONG / MODERATE / WEAK verdicts.
- [x] Cutoff comparison (PYQ only): `web-search` for that paper's year/exam cutoff with source URLs; verdict ("above/below cutoff by N marks") + which weak topics close the gap fastest (highest marks-per-effort). Explicit `found:false` + reason when sources missing — never invent cutoffs.
- [x] Report narrative via `report-analysis` model (`generateObject` into `Report` fields — no free-text-only blobs). Deterministic fallback if model fails.
- [x] Report UI: score card, section/topic charts (recharts web; list-based topic map on mobile), question-by-question review list with filters (wrong / skipped / slow / confused), each row expandable with explanation + citation link. Routes: web `/reports/{attemptId}`, mobile `reports/[attemptId]`.
- [x] mem0 write-back: weak/strong topics, score trend, pacing habits → chat tutor references them.
- [x] Dashboard: score trend chart across attempts, current weak topics, "recommended next" card (`reports.dashboard`).
- [x] tRPC `reports.get` / `listForUser` / `dashboard` / `reanalyze` (idempotent force). Inngest `attempt.submitted` → analyze; READY short-circuits unless `force`.
- **Acceptance:** Full loop — upload notes → take extracted PYQ → submit → report READY notification → report shows: a wrong answer with correct explanation cited to an actual notes page (link works), a slow-but-correct question flagged with option-change trail, topic verdicts, cutoff verdict with source URL; then ask the chat tutor "what should I study next?" → it references THIS report from mem0.
  - Unit tests: analysis pure helpers (7) in `packages/ai`. Live full-loop still depends on paper OCR quota + Clerk browser session.

### Phase 6 — AI paper generation (adaptive)
- [x] **Prerequisite `question_bank` (TASKS §5):** Qdrant dense+sparse, payload `{userId,testId,questionIndex,topic,wasCorrect?,text}`, userId index, deterministic IDs `sha1(testId:questionIndex)`. Written by `paper/extract` after READY; `attempt/analyze` updates `wasCorrect`. Backfill: `bun run scripts/backfill-question-bank.ts`.
- [x] Config UI: question count, duration, difficulty, topic multi-select from syllabus tree or "auto". Web `/tests` + mobile tests; `tests.generationTopics` + `tests.createGenerated`.
- [x] `paper/generate` Inngest: auto mix 50/30/20 weak/moderate/strong from latest Report `topicAnalysis` + question_bank accuracy; notes retrieval per topic before `generateObject`; NEET/JEE marking. No-notes topic → syllabus-only + UI warning; no prior reports → uniform syllabus distribution.
- [x] Dedupe vs `question_bank` (cosine ≥ 0.88); new questions upserted to bank. Quality gate + regen max 2 rounds; never pad — UI shows "N of M passed quality checks".
- [x] Same CBT + analyze; AI papers → target-score (75% max) instead of cutoff. Push on READY. FAILED + retry via recreate.
- **Acceptance:** Auto 20Q after Phase-5 report → weak topics overrepresented; no near-dupes; attempt→report with target-score. Unit: topic-plan weights/missing buckets, quality-loop, point-ID determinism.
  - Gemini live full-loop (Phase 4–5) still pending user confirmation of billing.

### Phase 7 — Hardening + polish
- [x] Rate limits (per-user per-route), request size caps, Helmet, dependency audit.
  - Helmet + global IP rate limit (`RATE_LIMIT_GLOBAL_PER_MIN`, skip `/api/inngest` + webhooks + `/health`), chat stream rate limit, JSON body `1mb` default / `4mb` Inngest. Unit: `apps/server/src/middleware/security.test.ts`. Live: `bun scripts/phase7-verify.ts` checks Helmet + request IDs.
- [x] Full empty/loading/error states audit across every screen; retry affordances on all failed jobs.
  - Shared `LoadingState` / `EmptyState` / `ErrorState` (`apps/web/src/components/async-state.tsx`) wired on dashboard, chat list, tests list (library already had retry). Failed tests show failureReason + recreate guidance.
- [x] Accessibility pass: contrast (both themes), touch targets, screen-reader labels on exam controls.
  - Exam window: `role=timer`, palette `aria-label`s, toolbar `aria-label`s, min 44px touch targets on palette/nav buttons. Async states use `role=status` / `role=alert`.
- [x] Observability: structured logs with request IDs, Sentry (web+mobile+server), Inngest failure alerts, AiUsageLog admin summary endpoint.
  - `X-Request-Id` middleware + pino `customProps.requestId`. `user.aiUsageSummary` (30d by task). Sentry: `@sentry/node` (server), `@sentry/nextjs` (web), mobile stub via `EXPO_PUBLIC_SENTRY_DSN` — all no-op without DSN. Inngest `inngest-failure-alert` on `inngest/function.failed`.
- [x] Seed script: demo user with sample notes + a sample paper for instant local dev/testing.
  - `bun packages/db/prisma/seed/demo.ts` → `user_demo_examgpt` + notes/paper docs + READY mini CBT.
- [x] Load-test ingestion with a 300-page book; tune Inngest concurrency + embedding batch size.
  - `bun scripts/load-test-ingest.ts --pages=300 --sample=3` measures split + sample OCR; recommends concurrency/batch.
- [x] Data deletion: `deleteAccount` end-to-end (Clerk → webhook → cleanup job) verified.
  - Inngest `user-cleanup` on `user/deleted`: Qdrant study_chunks + question_bank, storage `deleteObject`, mem0, DB cascade. Webhook + `user.deleteAccount` snapshot `fileKeys` before cascade. Live verified via `scripts/phase7-verify.ts` (user+doc removed after emit).
- **Acceptance:** `bun run check` green; chaos pass (kill Qdrant → chat degrades with clear message, not crash; kill Postgres → 503s, no data corruption on recovery); Sentry captures a thrown test error from all three apps when DSN set.
  - **Live verify (2026-07-15):** `phase7-verify` **7/7 PASS** — health returns `postgres:up`/`qdrant:up` + `X-Request-Id` + Helmet `nosniff`; seed demo user; deleteAccount cleanup path; tRPC health.ping. Chaos code paths: `/health` → **503** if Postgres down; chat stream search failures → user-visible degraded message (not hard crash). Sentry optional (DSN unset locally = disabled logs only).

### Phase 7.5 — Platform PYQ bank + admin panel

**Schema choice:** extend `Test` with `visibility: PRIVATE | PLATFORM` (default `PRIVATE`) and **nullable `userId` only when `visibility=PLATFORM`**. Platform papers are shared read-only catalog rows; user-owned uploads stay `PRIVATE` with required `userId`. Rejected separate `PlatformPaper` model — reuses questions/extract/review/CBT paths with one visibility flag + null owner.

**HARD INVARIANT:** attempts, reports, chat, and Qdrant user filters stay user-scoped. Platform content is read-only shared; every attempt/report still has exactly one `userId`.

- [x] Schema migration: `TestVisibility` enum; `userId String?` with check (PRIVATE ⇒ userId set); `examType`, `paperYear`, `publishedAt`, `contentHash` for admin dedupe. Indexes: `(visibility, publishedAt)`, `(visibility, examType, paperYear)`. Migration `20260715190000_phase75_platform_papers`.
- [x] `adminProcedure`: requires `Clerk JWT publicMetadata.role === "admin"` **AND** `userId ∈ ADMIN_USER_IDS` env allowlist (both). Non-admin → `FORBIDDEN`. Role wired into tRPC ctx from Clerk session claims (+ dev `X-ExamGPT-Role` header).
- [x] Web-only `/admin` UI behind same check (not-found style page for non-admins). No emoji; no purple; lucide only.
- [x] Admin: upload PYQ (exam + year + PDF via existing presign) → same `paper/extract` (incl. diagram crops) → review screen → Publish/Unpublish; list platform papers + status; AiUsageLog summary page (`/admin/usage` shows report `totalCostUsd` rollup).
- [x] question_bank timing: platform extract does **not** write per-user bank rows; `attempt/analyze` upserts after grading for the attempting user (point id includes userId). Adjusted `scripts/backfill-question-bank.ts`.
- [x] User-facing: Tests → "Previous Year Papers" tab (web + mobile): published platform papers filtered by user exam profile; year badges; Start test (no upload wait). Attempt/report/cutoff identical to PYQ uploads.
- [x] Dedupe: admin upload with existing `contentHash` warns + links to existing platform paper.
- [x] Empty/loading/error states on all admin + PYQ tab screens.
- [x] Unit tests: adminProcedure authz; platform visibility filter by exam; question_bank write-timing (extract no-write, analyze write).
- [ ] Live-verify: set `publicMetadata.role=admin` + `ADMIN_USER_IDS`; admin-upload one NEET PYQ → publish → start from Previous Year Papers → report. Record here.

**Diagram support (prerequisite for platform PYQ quality):**
- [x] paper/extract: page → PNG (`@napi-rs/canvas` + pdfjs); vision-extract returns per-Q figure flags + normalized bboxes; crop (sharp) → storage → `Question.imageKeys` / `options[].imageKey`; failed crop → `flagged` for review.
- [x] Exam + report UI render figures (web + mobile); missing → placeholder + report affordance.
- [x] Explanations: `imageKeys` → `explain-vision` with crop; else `explain`.
- [x] AI-generated papers: text-only v1 (UI copy on web + mobile Tests).
- [x] Unit tests: bbox→pixel clamp; extract schema imageKeys; explain routing (`selectExplainTask`).
  - **Live-verify:** re-run on a diagram-heavy PYQ page after stack stable (record attemptId + sample imageKeys here). Pending full NEET extract when OCR quota/API stable.

**Model routing (registry):**
- [x] Tasks `explain` / `explain-vision`; defaults per §3 table; call-site moves; `compare-report-models.ts`; `Report.totalCostUsd` rollup + unit test (commit `76f2030`).

### Phase 8 — Deployment + release
- [x] Server: Dockerfile (`apps/server/Dockerfile`) → **Railway** (`railway.toml`); docs for Neon Postgres, Qdrant Cloud, Inngest Cloud, R2 prod, prod Clerk (incl. admin role + session JWT public_metadata). See `docs/DEPLOYMENT.md`.
- [x] Web: Vercel wiring documented; env list in deploy guide (custom domain TBD with credentials).
- [x] Mobile: EAS build profiles (`apps/mobile/eas.json` dev/preview/prod); deep-link scheme + intent filters in `app.json`; store checklist in deploy docs. Icons paths set (add assets before store submit). TestFlight/Play submit needs store credentials.
- [x] Staging + migration flow: `.github/workflows/ci.yml` runs `prisma migrate deploy`; staging job stub ready for `STAGING_DATABASE_URL`.
- [x] New env in `.env.example` + `docs/DEPLOYMENT.md`: `ADMIN_USER_IDS`, `AI_MODEL_EXPLAIN`, `AI_MODEL_EXPLAIN_VISION`, Sentry DSNs, rate limits, `STORAGE_BACKEND=r2`.
- **NOTE (R2):** Before any production deploy, re-verify R2 S3 credentials with `bun run scripts/r2-diagnose.ts` (expects PutObject/GetObject/HeadBucket OK). Do not ship with untested keys — prior Access Key/Secret pairs returned HTTP 403 AccessDenied despite a valid bucket and CORS. Production must use `STORAGE_BACKEND=r2` with working keys; local `/storage/local` is dev-only and must never mount in production.
- [ ] **Live deploy blocked on credentials** — see credential checklist at end of `docs/DEPLOYMENT.md`. Agent stops until you provide them step-by-step.
- **Acceptance:** A fresh phone installs from TestFlight/internal track, signs up with Google or email OTP, and completes the full loop against production infra.

---

## 8. Edge-case master checklist (handle proactively; most are placed in phases above)

**Uploads/ingestion:** corrupt PDF · password-protected PDF (detect → ask user) · 0-page/blank scan · rotated/skewed scans · >quota pages · duplicate upload (hash) · URL that's HTML not PDF · URL behind auth · OCR fails on one page (mark page FAILED, continue rest, report partial) · non-English notes page (OCR anyway, tag language).
**Exam:** refresh/app-kill mid-attempt (resume) · clock tampering (server time only) · offline mid-attempt (queue events, warn banner, block final submit until online) · double submit · events arriving after submit (discard, log) · attempt opened on two devices (lock to first; second gets read-only warning) · question with missing figure (render placeholder + flagged) · timer drift (resync server offset every 60s).
**Chat:** empty knowledge base (nudge to upload notes) · model provider outage (registry fallback chain: direct → OpenRouter equivalent) · streaming dropped mid-answer (client keeps partial + "retry") · mem0 down (skip, log) · citation page beyond pageCount (post-validation strips it — bug alarm).
**Auth/account:** email change in Clerk (webhook sync) · deleted user's background jobs (guard: job checks user exists) · concurrent onboarding double-submit.
**Cost/abuse:** per-user daily AI budget · ingestion quota · rate limits · max chat context length (truncate oldest, keep system + citations).

---

## 9. Testing strategy

- **Unit (Vitest):** chunking (page-boundary invariants), scoring/marking scheme, palette-state derivation from event streams (property-test: random event sequences → valid states), citation post-validator, syllabus-match scorer, env parsing.
- **Integration:** tRPC procedures against a test Postgres (testcontainers or docker); Inngest functions via `inngest/test` local runner with mocked AI registry (registry has an injectable fake for tests — REQUIRED design).
- **RAG evals (lightweight, checked-in):** ~20 Q/A pairs against a fixture notes PDF; assert citation page correctness + "not in notes" behavior on 5 out-of-scope questions. Run in CI with mocked-recorded model responses; run live manually before releases.
- **E2E happy path:** Playwright (web): signup → onboard → upload → chat → test → report, with AI registry in fake mode.
- **Manual device matrix before store release:** small Android + iPhone; exam window in both orientations.

---

## 10. Non-goals for v1 (park for v2 — do not build now)

Subjective/numeric-entry questions grading beyond MCQ · study-group/social features · teacher dashboards · payments (build quota hooks only) · Hindi UI (structure ready, translation later) · offline test-taking of not-yet-downloaded papers · Windows/desktop apps.
