# ExamGPT — Launch checklist

Ordered path to a public test deploy (`examgpt.mayanksaraswal.in`) and later store launch.  
Each item is **`[OWNER]`** (you) or **`[AGENT]`** (coding agent).

Full credential detail lives in [`DEPLOYMENT.md`](./DEPLOYMENT.md). Update this file as steps complete.

---

## A. Housekeeping

| # | Who | Item | Status |
|---|-----|------|--------|
| A1 | AGENT | `.cursor/`, `.grok/`, `.mcp.json` in `.gitignore` | [x] |
| A2 | AGENT | Discard unrelated `README.md` churn | [x] |
| A3 | AGENT | This file (`docs/LAUNCH.md`) | [x] |

---

## B. Pre-deploy live verifies (from TASKS.md)

| # | Who | Item | Status |
|---|-----|------|--------|
| B1 | OWNER | Side-by-side exam UI vs NTA screenshots (web + mobile) | [ ] |
| B2 | OWNER | Admin: `publicMetadata.role=admin` + `ADMIN_USER_IDS` → upload NEET PYQ → publish → Previous Year Papers → report | [ ] |
| B3 | OWNER/AGENT | Diagram-heavy paper extract live-verify (`imageKeys` populated) | [ ] |
| B4 | OWNER | Firecrawl: set `FIRECRAWL_API_KEY`, ingest HTML syllabus + HTML paper | [ ] |
| B5 | OWNER | Fresh signup: landing/welcome → wizard resume → non-empty dashboard | [ ] |
| B6 | AGENT | Lighthouse 90+ on landing after design overhaul (record in TASKS.md Phase 7.8) | [ ] |

---

## C. Credentials & infra (test subdomain deploy, region **blr**)

| # | Who | Item | Status |
|---|-----|------|--------|
| C1 | OWNER | **Neon** project in **AWS ap-southeast-1 (Singapore)** → `DATABASE_URL` (+ optional direct URL) | [x] project `examgpt` / `steep-pond-21853186`; migrations applied via Neon MCP |
| C2 | OWNER | **Qdrant Cloud** cluster **Singapore** → `QDRANT_URL` + `QDRANT_API_KEY` | [~] **API key set; still need `QDRANT_URL` (cloud REST URL)** |
| C3 | OWNER | **Inngest Cloud** app → `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` | [~] **signing key set; still need `INNGEST_EVENT_KEY`** |
| C4 | OWNER | **Cloudflare R2** prod bucket + S3 keys | [x] from local `.env` |
| C5 | AGENT | `bun run scripts/r2-diagnose.ts` → Put/Get/Head OK; **STOP if fail** | [x] HeadBucket/Put/Get OK (ListBuckets 403 scoped token OK) |
| C6 | OWNER | AI keys: OpenAI / Google / OpenRouter (test deploy) | [x] from local `.env` |
| C7 | OWNER | Clerk **DEV** instance keys OK for test deploy; switch to prod Clerk at real launch | [x] using dev keys |
| C8 | OWNER | DigitalOcean account + token for App Platform (MCP or dashboard) | [x] DO MCP connected |
| C9 | AGENT | Deploy app in **blr** with `.do/app.yaml` once C1–C6 provided | [~] app `examgpt` id `c3e12a42-d912-4735-881b-84c524632a96` created; redeploy after Docker lockfile fix |

---

## D. DigitalOcean App Platform (blr)

| # | Who | Item | Status |
|---|-----|------|--------|
| D1 | AGENT | `.do/app.yaml` — server (Dockerfile) + web (Next.js), region blr | [x] |
| D2 | AGENT | Env secrets per component (`STORAGE_BACKEND=r2`, CORS, API URLs, Clerk, AI, Qdrant, Neon, Inngest, ADMIN_USER_IDS, …) | [x] set on DO (encrypted); QDRANT_URL placeholder until cloud URL provided |
| D3 | AGENT | Create/update DO app via MCP; deploy; verify `GET /health` → `postgres:up` + `qdrant:up` | [~] first build failed frozen-lockfile; Dockerfile fix pushed `edd47d0`; awaiting green deploy |
| D4 | AGENT | Domains: web `examgpt.mayanksaraswal.in`, API `examgpt-api.mayanksaraswal.in` | [x] attached on app (CNAME after ACTIVE) |
| D5 | OWNER | Add DNS **CNAME** records agent provides | [ ] *wait for ACTIVE + exact targets* |
| D6 | AGENT | `NEXT_PUBLIC_API_URL` / `CORS_ORIGINS` / Clerk allowed origins updated for domains | [ ] |
| D7 | AGENT | Register Inngest serve URL → prod API `/api/inngest`; confirm functions sync | [ ] |

---

## E. Post-deploy smoke (production subdomain)

| # | Who | Item | Status |
|---|-----|------|--------|
| E1 | AGENT/OWNER | Sign-up | [ ] |
| E2 | AGENT/OWNER | Onboarding wizard | [ ] |
| E3 | AGENT/OWNER | Upload small PDF → READY | [ ] |
| E4 | AGENT/OWNER | Chat one notes question + citation | [ ] |
| E5 | AGENT/OWNER | Admin health / usage (if admin role set) | [ ] |
| E6 | AGENT | Record results in this section | [ ] |

### Smoke log

_Record date, URLs, pass/fail, notes here after deploy._

---

## F. Gemini billing switch-back

| # | Who | Item | Status |
|---|-----|------|--------|
| F1 | OWNER | Enable Google AI billing | [ ] |
| F2 | AGENT | Remove OpenAI OCR overrides; restore `AI_MODEL_OCR` / `AI_MODEL_VISION_EXTRACT` to Gemini defaults in env/docs | [ ] |

---

## G. Content & store

| # | Who | Item | Status |
|---|-----|------|--------|
| G1 | OWNER/AGENT | Seed platform PYQ bank (NEET published papers) via admin | [ ] |
| G2 | OWNER | App icons/splash (no purple), privacy policy URL live | [ ] |
| G3 | OWNER | Apple Developer + Play Console accounts | [ ] |
| G4 | AGENT | EAS build preview/prod; deep links | [ ] |
| G5 | OWNER | TestFlight + Play internal track | [ ] |
| G6 | OWNER | Production Clerk instance + real domain allowlist | [ ] |

---

## H. Definition of done (public launch)

- [ ] Web: full loop on production domain without local storage routes
- [ ] Mobile: install from internal track, same loop against prod API
- [ ] R2 diagnose green; no `/storage/local` in prod
- [ ] All TASKS.md Phase 7.x live-verifies recorded
- [ ] Legal pages linked from store listings
