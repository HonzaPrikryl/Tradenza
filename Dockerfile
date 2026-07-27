# ─── Tradenza — production image ──────────────────────────────────────────────
# Multi-stage build producing a small, non-root runtime image based on Next.js
# standalone output. Migrations are bundled into a single self-contained script
# and applied automatically by the entrypoint before the server starts.
#
# Build-time vs. runtime configuration:
#   - NEXT_PUBLIC_* variables are inlined into the client bundle at build time,
#     so they must be passed as build args (docker-compose.yml wires them from
#     your .env). The Clerk publishable key is the only required one.
#   - Everything else (DATABASE_URL, CLERK_SECRET_KEY, R2, …) is read at runtime
#     from the container environment.

# ─── deps: install node_modules ───────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── build: compile the app + bundle the migration runner ─────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client-side (inlined) configuration.
# The publishable-key default is a format-valid SENTINEL, not a real key: the
# published GHCR image is built with it, and the entrypoint substitutes the
# real key from the runtime environment at startup. Local compose builds pass
# the real key as a build arg, so the sentinel never survives to runtime there.
# Keep this value in sync with CLERK_KEY_SENTINEL in scripts/docker-entrypoint.sh.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_cGxhY2Vob2xkZXIudHJhZGVuemEuZGV2JA==
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
ARG NEXT_PUBLIC_APP_URL=
ARG NEXT_PUBLIC_MARKETING_URL=
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_POSTHOG_KEY=
ARG NEXT_PUBLIC_POSTHOG_HOST=
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST

# Placeholders so build-time module evaluation passes; real values come from the
# runtime environment (server env vars are NOT baked into the bundle).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    CLERK_SECRET_KEY=sk_test_build_placeholder \
    BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Bundle the migration runner into one dependency-free file so the runtime image
# needs no node_modules for it. esbuild ships with drizzle-kit.
RUN npx esbuild scripts/docker-migrate.mjs \
      --bundle --platform=node --format=cjs --external:pg-native \
      --outfile=migrate.cjs

# ─── runner: minimal runtime image ────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# wget is used by the HEALTHCHECK (busybox wget is built into alpine).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/migrate.cjs ./migrate.cjs
COPY --from=build --chown=node:node /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER node
EXPOSE 3000

# Shell form on purpose: $PORT is expanded at container runtime, so the probe
# follows the port the server was actually told to listen on.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
