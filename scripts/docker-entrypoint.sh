#!/bin/sh
# Container entrypoint: inject runtime config, bring the schema up to date,
# then start the server.
set -e

# ── Clerk publishable-key injection (prebuilt images) ─────────────────────────
# NEXT_PUBLIC_* values are inlined into the compiled bundles at build time, so a
# prebuilt public image (GHCR) is compiled with this sentinel instead of a real
# key. Swap it for the real key from the environment on boot — this makes one
# published image work for every deployment. Locally built images already
# contain the real key, so the grep finds nothing and this is a no-op.
# Keep in sync with the ARG default in the Dockerfile.
CLERK_KEY_SENTINEL="pk_test_cGxhY2Vob2xkZXIudHJhZGVuemEuZGV2JA=="

if [ -n "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ] &&
  [ "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" != "$CLERK_KEY_SENTINEL" ]; then
  grep -rl "$CLERK_KEY_SENTINEL" .next server.js 2>/dev/null | while read -r file; do
    sed -i "s|$CLERK_KEY_SENTINEL|$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|g" "$file"
  done
elif grep -rql "$CLERK_KEY_SENTINEL" .next server.js 2>/dev/null; then
  echo "[entrypoint] WARNING: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set —" \
    "this prebuilt image contains a placeholder key and sign-in will not work." >&2
fi

# ── Migrations ────────────────────────────────────────────────────────────────
# Set SKIP_MIGRATIONS=1 to opt out (e.g. when running multiple replicas and
# migrating from a separate job instead).
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  node migrate.cjs
fi

exec node server.js
