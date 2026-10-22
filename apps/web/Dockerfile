# syntax=docker/dockerfile:1
#
# The Chlat-Park web image.
#
# Multi-stage: dependencies → build → a slim runtime that serves the Next.js
# standalone output.

ARG NODE_VERSION=22
ARG PNPM_VERSION=11.9.0

# ---------------------------------------------------------------------------
# Stage 1 — the dependency tree.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# pnpm refuses to run non-interactively when it would have to remove an
# existing `node_modules` directory, and a Docker build has no TTY:
#
#   ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
#
# `CI=true` is the documented way to say "yes, proceed without asking", and it
# is what every CI runner already sets.
ENV CI=true
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/api-client/package.json packages/api-client/package.json

RUN pnpm fetch --frozen-lockfile --fetch-timeout 300000 --fetch-retries 5

# ---------------------------------------------------------------------------
# Stage 2 — build.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

COPY --from=deps /app /app
COPY . .

RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @chlat/contracts build \
 && pnpm --filter @chlat/api-client build \
 && pnpm --filter @chlat/web run build

# ---------------------------------------------------------------------------
# Stage 3 — the runtime image.
#
# `output: "standalone"` in `next.config.ts` emits a self-contained server
# with only the modules it actually uses, so the runtime stage does not need
# a production install of its own.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN apk add --no-cache dumb-init
RUN mkdir -p /app && chown -R node:node /app

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
