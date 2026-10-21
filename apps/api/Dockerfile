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
# pnpm refuses to run non-interactively when it would have to remove an
# existing `node_modules` directory, and a Docker build has no TTY:
#
#   ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
#
# `CI=true` is the documented way to say "yes, proceed without asking", and it
# is what every CI runner already sets. Without it the `prod-deps` stage
# fails, because the layer it inherits from `deps` carries a modules dir that
# does not match the `--prod` filter.
ENV CI=true
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
ENV CI=true
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

COPY --from=deps /app /app
COPY . .

# The build needs the whole workspace; the Prisma client is generated for the
# target platform (linux-musl) so the runtime image does not need the engine
# download step.
RUN pnpm install --offline --frozen-lockfile

# The API's build script runs `prisma generate` itself, so the client is
# generated for the *target* platform (linux-musl) inside this stage, right
# before TypeScript compiles it. The generator is platform-specific, which is
# why it must run in the image rather than on the host.
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
ENV CI=true
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

COPY --from=deps /app /app
COPY . .
RUN pnpm install --offline --frozen-lockfile --prod --filter @chlat/api...

# ---------------------------------------------------------------------------
# Stage 4 — the migration image.
#
# A separate image from the runtime one, because the Prisma CLI is a
# *devDependency*: it is not in the production dependency tree, so `npx prisma`
# inside the runtime image tries to download it from the registry at boot
# (and fails in an air-gapped or offline deploy).
#
# This stage carries the full dependency tree plus the CLI, and it is what
# the `migrate` compose service runs. It is never used to serve traffic.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS migrate
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

COPY --from=deps /app /app
COPY . .
RUN pnpm install --offline --frozen-lockfile
# The migrate image needs the generated client too, so the seed script can
# open a connection. The API's build script generates it.
RUN pnpm --filter @chlat/contracts build \
 && pnpm --filter @chlat/api-client build \
 && pnpm --filter @chlat/api run build

# ---------------------------------------------------------------------------
# Stage 5 — the runtime image.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3001

# The working directory is the app's own directory inside the mirrored
# workspace, so Node resolves `node_modules` by walking up to the root store
# exactly as it does in development.
WORKDIR /app/apps/api

# `dumb-init` gives the process a real PID 1, so SIGTERM reaches Node and the
# container stops gracefully.
RUN apk add --no-cache dumb-init

# The `node` user ships with the base image.
RUN mkdir -p /app && chown -R node:node /app

# pnpm's layout is symlinked and *relative*. A dependency installed for the
# API appears as:
#
#   apps/api/node_modules/reflect-metadata
#     -> ../../../node_modules/.pnpm/reflect-metadata@0.2.2/node_modules/reflect-metadata
#
# The symlink is relative to the workspace root, so the runtime has to keep
# that shape: the app's `node_modules` must live at `apps/api/node_modules`
# and the store at the root `node_modules/.pnpm`. Flattening either one
# leaves a dangling symlink, and the API dies on the first import with
# "Cannot find package 'reflect-metadata'".
#
# So the runtime mirrors the workspace layout exactly.
#
# The COPY destinations are relative to WORKDIR, which is `/app/apps/api`.
# Copying to `apps/api/...` from there would nest the app inside itself.
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/prisma ./prisma
# The shared store lives at the workspace root, one level above the app.
COPY --from=prod-deps --chown=node:node /app/node_modules/.pnpm /app/node_modules/.pnpm
# The contracts package has its own dependencies (`zod`), and its symlinks
# point into the same root store. Without this the API dies with
# "Cannot find package 'zod' imported from /app/packages/contracts/dist/…".
COPY --from=prod-deps --chown=node:node /app/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=build --chown=node:node /app/packages/contracts/dist /app/packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json /app/packages/contracts/package.json

USER node

EXPOSE 3001

# The liveness probe. The readiness probe (`/health/ready`) additionally
# checks the database and the migration state.
#
# The global prefix is `api/v1` — set once in `main.ts` from the contracts'
# `API_PREFIX` — so the path is `/api/v1/health/live`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
