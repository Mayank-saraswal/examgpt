# ExamGPT

AI exam tutor for competitive exams (NEET, JEE, and custom). See [`TASKS.md`](./TASKS.md) for the full plan and [`AGENTS.md`](./AGENTS.md) for engineering rules.

## Monorepo layout

```
apps/
  web/      Next.js 16 (client)
  mobile/   Expo + Expo Router (client)
  server/   Express + tRPC + Inngest
packages/
  api/         tRPC routers + procedures
  db/          Prisma schema + client
  ai/          model registry
  validators/  shared Zod schemas
  ui-tokens/   design tokens (no purple)
  config/      shared TypeScript config
```

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Docker (Postgres + Qdrant for local dev)

## Quick start

```bash
# Install
bun install

# Infra
docker compose up -d

# Env (already have .env.example)
cp .env.example .env   # if needed

# Database
bun run db:generate
bun run db:migrate

# Dev (all apps via turbo) — or run filters separately
bun run --filter @examgpt/server dev
bun run --filter @examgpt/web dev
bun run --filter @examgpt/mobile dev
```

## Checks

```bash
bun run check   # typecheck + lint + test
```

## Deployment

See **[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)** (Phase 8).

- API: `apps/server/Dockerfile` → Railway (`railway.toml`)
- Web: Vercel
- Mobile: EAS profiles in `apps/mobile/eas.json`
- CI: `.github/workflows/ci.yml` (`bun run check` + `prisma migrate deploy`)

## Phase 0 acceptance

- `bun run check` green
- Web shows `health.ping` result
- Expo app shows the same
- Prisma migrate against docker Postgres
