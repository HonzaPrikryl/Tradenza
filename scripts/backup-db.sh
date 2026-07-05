#!/usr/bin/env bash
#
# Logical backup of the Neon (PostgreSQL) database.
#
# Produces a single compressed, plain-SQL dump you can restore anywhere with
# `psql` — independent of Neon's own history/PITR retention. Safe to run locally
# for an ad-hoc snapshot, or from CI on a schedule (see
# .github/workflows/db-backup.yml).
#
#   Usage:  DATABASE_URL="postgres://…" ./scripts/backup-db.sh [output_dir]
#
# Notes:
#   • pg_dump's major version should be >= your server's. Neon runs PostgreSQL 18
#     at time of writing — install the pg18 client if your distro ships older.
#   • --no-owner / --no-privileges keep the dump portable (no Neon-specific roles),
#     so it restores cleanly into a fresh database or a local Postgres.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is not set" >&2
  exit 1
fi

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/tradenza-${STAMP}.sql.gz"

echo "→ dumping database to $FILE"
# PG_DUMP lets the caller pin an exact client binary (e.g. a versioned path like
# /usr/lib/postgresql/18/bin/pg_dump) — pg_dump must be >= the server version,
# and the one first on PATH is often older than the caller expects.
"${PG_DUMP:-pg_dump}" "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --quote-all-identifiers \
  | gzip -9 > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "✓ backup complete: $FILE ($SIZE)"

# Emit the path for CI steps that upload it (e.g. to object storage).
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "file=$FILE" >> "$GITHUB_OUTPUT"
fi
