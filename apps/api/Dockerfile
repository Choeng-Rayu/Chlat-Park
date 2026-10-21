# syntax=docker/dockerfile:1
#
# The Chlat-Park API image.
#
# Multi-stage: dependencies → build → a slim production image that carries
# only the runtime files and the production dependency tree.
#
# Migrations are NOT run on boot. `specs/architecture/deployment.md` §5
# requires migrations to be applied in a controlled release step, before the
# new version serves traffic, so a bad migration can never turn into a crash
# loop. Run them explicitly with:
#
#   docker compose run --rm migrate
#
# or, against a deployed image:
#
#   docker run --rm --env-file .env <image> npx prisma migrate deploy

ARG NODE_VERSION=22
ARG PNPM_VERSION=11.9.0

# ---------------------------------------------------------------------------
# Stage 1 — the dependency tree.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

# Only the manifests are copied first, so the install layer is cached until a
# dependency actually changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/ui/package.json packages/ui/package.json

# `pnpm fetch` downloads every package into the store without linking it, so
# the install in the next stage is fully offline.
#
# The fetch timeouts are generous: a cold CI runner pulling ~700 packages
# over a slow link regularly exceeds pnpm's default 60s per request.
RUN pnpm fetch --frozen-lockfile --fetch-timeout 300000 --fetch-retries 5

# ---------------------------------------------------------------------------
# Stage 2 — build.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

COPY --from=deps /app /app
COPY . .

# The build needs the whole workspace; the Prisma client is generated for the
# target platform (linux-musl) so the runtime image does not need the engine
# download step.
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @chlat/contracts build \
 && pnpm --filter @chlat/api-client build \
 && pnpm --filter @chlat/api run build

# ---------------------------------------------------------------------------
# Stage 3 — the production dependency tree.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS prod-deps
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

COPY --from=deps /app /app
COPY . .
RUN pnpm install --offline --frozen-lockfile --prod --filter @chlat/api...

# ---------------------------------------------------------------------------
# Stage 4 — the runtime image.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# `dumb-init` gives the process a real PID 1, so SIGTERM reaches Node and the
# container stops gracefully.
RUN apk add --no-cache dumb-init

# The `node` user ships with the base image.
RUN mkdir -p /app && chown -R node:node /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/node_modules/.pnpm/node_modules ./node_modules/.pnpm/node_modules

USER node

EXPOSE 3001

# The liveness probe. The readiness probe (`/health/ready`) additionally
# checks the database and the migration state.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
