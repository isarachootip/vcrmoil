# ==========================================
# Base Image
# ==========================================
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
RUN apk add --no-cache libc6-compat openssl curl wget

# ==========================================
# Builder Stage
# ==========================================
FROM base AS builder
WORKDIR /app

# Copy monorepo workspace configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./

# Copy all packages and workspace package.json files
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/widget/package.json ./apps/widget/package.json

# Install dependencies (respecting pnpm-workspace allowBuilds)
RUN pnpm install --frozen-lockfile

# Build shared library, generate Prisma client, build API
RUN pnpm --filter @vcrm/shared build
RUN pnpm --filter @vcrm/api prisma:generate
RUN pnpm --filter @vcrm/api build

# ==========================================
# Production Runner Stage
# ==========================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Create non-root system user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy artifacts from builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Fix script permissions and ownership
RUN chmod +x ./docker-entrypoint.sh && chown -R nestjs:nodejs /app

USER nestjs
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=90s \
  CMD curl -f http://localhost:4000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
