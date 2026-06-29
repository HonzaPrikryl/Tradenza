// Jednorázová migrace: přidá účty (accounts) + trades.account_id.
// Obchází drizzle-kit push, který na téhle DB padá na nesouvisejícím diffu.
// Spuštění:  node --env-file=.env.local scripts/add-accounts.mjs
//
// Skript je idempotentní – lze ho spustit opakovaně bez škody.

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ Chybí DATABASE_URL (spusť s: node --env-file=.env.local scripts/add-accounts.mjs)')
  process.exit(1)
}

const sql = neon(url)

async function step(label, fn) {
  try {
    await fn()
    console.log('  ✓', label)
  } catch (err) {
    console.error('  ✗ Selhalo:', label)
    throw err
  }
}

console.log('▶ Spouštím migraci účtů…')

// 1) enum account_status
await step(
  'enum account_status',
  () => sql`
  DO $$ BEGIN
    CREATE TYPE account_status AS ENUM ('active','passed','failed');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
`,
)

// 2) tabulka accounts
await step(
  'tabulka accounts',
  () => sql`
  CREATE TABLE IF NOT EXISTS accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    name text NOT NULL,
    firm text,
    account_size numeric(18,2),
    phase text,
    starting_balance numeric(18,2),
    currency text NOT NULL DEFAULT 'USD',
    status account_status NOT NULL DEFAULT 'active',
    is_default boolean NOT NULL DEFAULT false,
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`,
)

// 3) index na user_id
await step(
  'index accounts_user_id_idx',
  () => sql`
  CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id);
`,
)

// 4) sloupec trades.account_id
await step(
  'sloupec trades.account_id',
  () => sql`
  ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_id uuid;
`,
)

// 5) FK (stejný název jako generuje drizzle)
await step(
  'FK trades.account_id → accounts.id',
  () => sql`
  DO $$ BEGIN
    ALTER TABLE trades
      ADD CONSTRAINT trades_account_id_accounts_id_fk
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
`,
)

// 6) index na account_id
await step(
  'index trades_account_id_idx',
  () => sql`
  CREATE INDEX IF NOT EXISTS trades_account_id_idx ON trades (account_id);
`,
)

console.log('✅ Hotovo. Účty a trades.account_id jsou v databázi.')
