# Database backups & recovery

Tradenza's only stateful, irreplaceable component is the **Neon PostgreSQL**
database. Everything else (the app, R2 screenshots, Clerk users) can be
rebuilt or is owned by a third party. This document describes how the database
is protected and how to restore it.

There are two independent layers, and you want both:

| Layer                       | Protects against                              | Retention                | Restore speed |
| --------------------------- | --------------------------------------------- | ------------------------ | ------------- |
| **Neon history / PITR**     | Fat-finger deletes, bad migration, app bug    | 24 h (Free) → up to 30 d | Seconds       |
| **Scheduled logical dumps** | Losing the whole Neon project/account, region | As long as you keep them | Minutes       |

Neon's built-in history is fast and effortless but lives **inside** Neon — if
the account is deleted, suspended, or the region has an incident, it goes with
it. The off-Neon dumps are the true disaster-recovery copy. On the Free tier,
Neon's history retention is short, which makes the scheduled dump the more
important of the two.

## Layer 1 — Neon history / Point-in-Time Recovery

Neon continuously retains write-ahead log history for your project. Within the
retention window you can branch or reset the database to **any second** in the
past — no snapshots to schedule.

**Enable / configure (one-time, ~5 min, no code):**

1. Neon Console → your project → **Settings → Storage** (or **Branches →
   history retention**).
2. Set **History retention** as high as your plan allows (Free is limited;
   paid tiers go up to 30 days). Higher = longer window to recover from a
   problem you notice late.

**Recover a mistake (e.g. a bad `DELETE` or migration):**

1. Neon Console → **Branches → Create branch**.
2. Choose **"from a point in time"** and pick the timestamp just **before** the
   incident.
3. Neon creates a new branch with the data as it was then. Inspect it, then
   either point the app at the new branch's connection string, or copy the
   good rows back into `main`.

Because recovery is branch-based, it's non-destructive: you never overwrite the
current database while investigating.

## Layer 2 — Scheduled logical dumps (off-Neon)

A nightly `pg_dump` produces a portable `.sql.gz` you can restore into **any**
PostgreSQL — a fresh Neon project, a local Postgres, another provider. This is
your insurance if the Neon project itself is ever lost.

This repo ships both pieces:

- **`scripts/backup-db.sh`** — creates a compressed, portable dump.
- **`.github/workflows/db-backup.yml`** — runs the script daily at 03:00 UTC
  (and on-demand via the Actions tab).

### Setup (one-time)

1. **Add the production connection string as a secret.** GitHub repo →
   **Settings → Secrets and variables → Actions → New repository secret**:
   - `DATABASE_URL_PROD` = your production Neon connection string.
2. **(Recommended) Also push dumps to durable object storage** so they survive
   independently of GitHub. Add these secrets to send each dump to Cloudflare R2
   (or any S3-compatible bucket):
   - `R2_ENDPOINT` = `https://<account_id>.r2.cloudflarestorage.com`
   - `R2_BACKUP_BUCKET` = e.g. `tradenza-backups`
   - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - Use a **separate bucket** from screenshots, ideally with object-lock /
     versioning enabled.
   - If you skip this, dumps are still kept as GitHub Actions **artifacts** for
     30 days (fine as a start, but capped and tied to GitHub).
3. **Test it now:** Actions tab → **DB Backup → Run workflow**. Confirm it goes
   green and produces an artifact (and an R2 object, if configured).

### Run a backup manually / locally

```bash
# Pull production env, or export DATABASE_URL yourself
DATABASE_URL="postgres://…prod…" ./scripts/backup-db.sh ./backups
# → ./backups/tradenza-20260705T030000Z.sql.gz
```

You need the PostgreSQL client tools (`pg_dump`), version **>= the server's**
(Neon runs PostgreSQL 18 at time of writing).

### Restore a dump

Restore into a **new / empty** database (never straight over live prod):

```bash
# 1. Create a fresh Neon branch or project and grab its connection string.
# 2. Restore:
gunzip -c tradenza-20260705T030000Z.sql.gz | psql "postgres://…target…"
```

Then run outstanding migrations if the dump predates them
(`npm run db:migrate`), verify the data, and only then repoint the app.

## Recovery playbook (quick reference)

- **Accidental delete / bad migration, noticed soon** → Neon PITR branch from a
  timestamp before the incident (Layer 1). Fastest path.
- **Neon project/account lost** → provision a new Neon project, restore the
  latest dump with `psql` (Layer 2), update `DATABASE_URL` in Vercel, redeploy.
- **Verify backups are real** → once a month, restore the latest dump into a
  throwaway branch and sanity-check row counts. A backup you've never restored
  is a hope, not a backup.

## Restore-test checklist

- [ ] `DB Backup` workflow is green on its schedule.
- [ ] Latest dump exists in R2 (or as an artifact).
- [ ] A test restore into an empty DB succeeds and the app boots against it.
- [ ] Neon history retention is set to the maximum your plan allows.
