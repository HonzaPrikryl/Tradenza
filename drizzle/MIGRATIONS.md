# Database migrations

This project uses **versioned migrations** (`drizzle-kit generate` + `migrate`).
`db:push` is intentionally not used: on an existing database it fails with `42P16`
(`column "id" is in a primary key`) because push diffs the whole schema and tries to recreate
primary keys. `generate`/`migrate` produce explicit, reviewable SQL and avoid that.

## Everyday workflow

```bash
# 1) edit src/lib/db/schema.ts
npm run db:generate -- --name change_description   # writes drizzle/000X_*.sql + meta snapshot
# 2) review & commit the generated SQL, then:
npm run db:migrate                                 # applies pending migrations
```

Migrations are applied per environment by running `db:migrate` with that environment's
`DATABASE_URL`. Migrate only runs migrations newer than the last one recorded in
`drizzle.__drizzle_migrations`, so already-applied ones are skipped.

Deploy to production:

```bash
vercel env pull .env.production.local
dotenv -e .env.production.local -- npm run db:migrate
```

## Adopting an existing database

An existing, populated database has no migration journal, so `migrate` would treat it as empty
and try to `CREATE TABLE` tables that already exist. Seed the baseline once per such database:

1. Generate the baseline snapshot: `npm run db:generate -- --name baseline`.
2. Read the baseline's `when` value from `drizzle/meta/_journal.json`.
3. In the target database, create the journal and mark the baseline as applied. Reconcile any
   columns that exist in `schema.ts` but not yet in the DB with `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

```sql
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
VALUES ('baseline', <WHEN>);   -- <WHEN> = the baseline "when" from _journal.json
```

Run `npm run db:migrate` afterwards to confirm nothing is pending. A fresh, empty database needs
none of this — `db:migrate` builds the full schema from the baseline directly.
