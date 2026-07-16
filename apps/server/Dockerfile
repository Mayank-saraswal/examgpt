# ExamGPT API server — production image (Bun runtime)
# Build from monorepo root:
#   docker build -f apps/server/Dockerfile -t examgpt-server .
FROM oven/bun:1.3-debian AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml turbo.json tsconfig.base.json ./
# All workspace package.json files required for frozen lockfile install
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/api/package.json ./packages/api/
COPY packages/ai/package.json ./packages/ai/
COPY packages/db/package.json ./packages/db/
COPY packages/validators/package.json ./packages/validators/
COPY packages/config/package.json ./packages/config/
COPY packages/ui-tokens/package.json ./packages/ui-tokens/

RUN bun install --frozen-lockfile

FROM oven/bun:1.3-debian AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# System libs for sharp / canvas (diagram crops)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-dejavu-core \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    libpixman-1-0 \
  && rm -rf /var/lib/apt/lists/*

# Bun hoists workspace deps to the root node_modules — do not COPY nested
# apps/*/node_modules (they often do not exist and break Kaniko).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/bun.lock /app/bunfig.toml /app/turbo.json /app/tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages ./packages

# Prisma client generate at build (schema must be present)
WORKDIR /app/packages/db
RUN bun x prisma generate

WORKDIR /app

EXPOSE 4000

# Run migrations then start
CMD ["sh", "-c", "bun x prisma migrate deploy --schema packages/db/prisma/schema.prisma && bun apps/server/src/index.ts"]
