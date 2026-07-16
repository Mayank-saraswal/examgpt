# ExamGPT — Phase 8 Deployment Guide

Deploy order matters. Stop at each **Credentials needed** block and provide values before the agent continues.

## Architecture (prod / test subdomain)

| Piece | Host | Notes |
|---|---|---|
| API (`apps/server`) | **DigitalOcean App Platform** (`blr`) | Docker · health `/health` · `examgpt-api.mayanksaraswal.in` |
| Web (`apps/web`) | **DigitalOcean App Platform** (`blr`) | Next.js build · `examgpt.mayanksaraswal.in` |
| Mobile | **EAS** → TestFlight + Play internal | Expo |
| Postgres | **Neon** (prefer **AWS ap-southeast-1** Singapore) | `prisma migrate deploy` |
| Vectors | **Qdrant Cloud** (prefer Singapore) | collections asserted at boot |
| Jobs | **Inngest Cloud** | sync → `https://examgpt-api…/api/inngest` |
| Files | **Cloudflare R2** | `STORAGE_BACKEND=r2` only in prod |
| Auth | Clerk **dev** keys OK for test DO deploy; **prod** Clerk at real launch | + admin role setup |

See also **[`LAUNCH.md`](./LAUNCH.md)** for the ordered owner/agent checklist.

---

## Step 0 — Preflight (local)

```bash
bun run check
bun run scripts/r2-diagnose.ts   # must show PutObject/GetObject/HeadBucket OK
```

**Credentials needed from you (R2 re-verify):**
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (Object Read & Write on prod bucket)
- `R2_BUCKET` (prod bucket name)
- `R2_PUBLIC_BASE_URL` (public or custom domain for objects, if used)

Do **not** deploy until `r2-diagnose` passes. Local `/storage/local` must never mount when `NODE_ENV=production`.

---

## Step 1 — Neon Postgres

1. Create Neon project `examgpt-prod` (+ optional `examgpt-staging`).
2. Copy pooled + direct connection strings.

**Credentials needed:**
- `DATABASE_URL` (prod, prefer pooled for runtime)
- `DATABASE_URL` (staging)
- Optional: `DIRECT_URL` if you use Prisma multi-schema / migrate against non-pooled

Run once after URL is available:

```bash
DATABASE_URL=... bunx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

CI already runs `prisma migrate deploy` against ephemeral Postgres on PRs; wire staging/prod secrets when ready (see `.github/workflows/ci.yml`).

---

## Step 2 — Qdrant Cloud

1. Create cluster; copy REST URL + API key.
2. Boot the API once so it asserts `study_chunks` + `question_bank`.

**Credentials needed:**
- `QDRANT_URL`
- `QDRANT_API_KEY`

---

## Step 3 — Clerk production

1. Create a **production** Clerk application (or promote).
2. Enable Google OAuth + Email (no phone).
3. Session token: include `public_metadata` in JWT claims (Dashboard → Sessions → Customize session token):

```json
{
  "public_metadata": "{{user.public_metadata}}"
}
```

4. Set admin for your user (Backend API / Dashboard user → public metadata):

```json
{ "role": "admin" }
```

5. Webhook: `POST https://<api-host>/webhooks/clerk` (user.created/updated/deleted).

**Credentials needed:**
- `CLERK_SECRET_KEY` (prod `sk_live_…`)
- `CLERK_PUBLISHABLE_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- Your Clerk `user_…` id for `ADMIN_USER_IDS`

---

## Step 4 — Railway API

```bash
# Build context = monorepo root
# Dockerfile: apps/server/Dockerfile
# Health: GET /health
```

**Env vars on Railway (minimum):**

```
NODE_ENV=production
PORT=4000
DATABASE_URL=
CORS_ORIGINS=https://examgpt.vercel.app,https://examgpt.app
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
ADMIN_USER_IDS=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
OPENROUTER_API_KEY=
AI_MODEL_OCR=
AI_MODEL_VISION_EXTRACT=
AI_MODEL_EXPLAIN=
AI_MODEL_EXPLAIN_VISION=
AI_MODEL_REPORT=
AI_MODEL_PAPERGEN=
AI_DAILY_BUDGET_USD=5
QDRANT_URL=
QDRANT_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
STORAGE_BACKEND=r2
MEM0_API_KEY=
EXPO_ACCESS_TOKEN=
SENTRY_DSN=
INGEST_PAGE_QUOTA=2000
```

**Credentials needed:**
- Railway project token / login so the agent can `railway up` (or you deploy from dashboard)
- Public Railway URL → set as `API_URL` / `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL`

---

## Step 5 — Inngest Cloud

1. Create app; set event + signing keys.
2. Sync serve URL: `https://<railway-host>/api/inngest`

**Credentials needed:**
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

---

## Step 6 — Vercel web

```bash
# apps/web as project root (or monorepo with root apps/web)
# Framework: Next.js
```

**Env on Vercel:**

```
NEXT_PUBLIC_API_URL=https://<railway-host>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=          # if server components need it
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_SENTRY_DSN=
```

**Credentials needed:**
- Vercel project link / token
- Custom domain (optional)

---

## Step 7 — EAS mobile

```bash
cd apps/mobile
bunx eas login
bunx eas build:configure   # eas.json already present
bunx eas build --profile preview --platform all
bunx eas build --profile production --platform all
bunx eas submit --profile production
```

Deep links:
- Scheme: `examgpt://`
- Library: `examgpt://library/{documentId}?page={n}`
- Configure associated domains / intent filters when store IDs exist (see `app.json` `scheme`).

**Credentials needed:**
- Expo account + `EXPO_TOKEN` (CI)
- Apple Developer team + App Store Connect app id
- Google Play service account JSON (internal track)
- Prod `EXPO_PUBLIC_API_URL` + `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`

Store checklist:
- [ ] Icons/splash (blue primary, no purple)
- [ ] Privacy policy URL
- [ ] Camera / photos permission copy (already in plugins)
- [ ] TestFlight internal group
- [ ] Play internal testing track

---

## Step 8 — Staging

1. Branch `staging` deploys Railway staging + Vercel preview.
2. CI: `prisma migrate deploy` against `STAGING_DATABASE_URL` (uncomment job in `ci.yml` when secret exists).
3. Smoke: sign-up → upload notes → chat citation → PYQ attempt → report.

**Credentials needed:**
- `STAGING_DATABASE_URL` as GitHub secret
- Staging Railway + Vercel project envs

---

## Admin setup (prod)

1. Clerk user `public_metadata.role = "admin"`.
2. `ADMIN_USER_IDS=user_xxx` on API (must match JWT user id).
3. Open `https://<web>/admin` — non-admins see not-found page.
4. Upload NEET PYQ → review → Publish → user Previous Year Papers tab.

---

## Post-deploy smoke

1. `GET /health` → postgres/qdrant up, Helmet headers, request id.
2. Web sign-in (Google + email).
3. Upload small PDF → READY.
4. Chat notes question → citation.
5. Admin platform paper publish → start test → report.
6. `bun run scripts/r2-diagnose.ts` against **prod** credentials once more.

---

## Credential checklist (give these to the agent in order)

1. **R2** — account, keys, bucket, public base URL  
2. **Neon** — prod (+ staging) `DATABASE_URL`  
3. **Qdrant Cloud** — URL + API key  
4. **Clerk prod** — secret, publishable, webhook secret, admin user id  
5. **OpenAI / Google / OpenRouter** keys (and any model overrides)  
6. **Railway** — deploy access + public API URL  
7. **Inngest** — event + signing keys  
8. **Vercel** — deploy access + domain  
9. **EAS / stores** — Expo token, Apple, Google Play  
10. **Sentry** (optional) — DSN web/server/mobile  
11. **mem0 / Expo push** (optional for v1)
