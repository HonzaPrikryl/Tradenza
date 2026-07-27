// Applies the versioned migrations in ./drizzle to DATABASE_URL.
//
// Bundled at image build time (see Dockerfile) into a single self-contained file
// and executed by the container entrypoint before the app starts, so a container
// is always running against an up-to-date schema. Retries while Postgres is
// still booting (a fresh `docker compose up` starts both services at once).
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const RETRIES = 30
const RETRY_DELAY_MS = 2000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForDb(pool) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await pool.query('select 1')
      return
    } catch (err) {
      if (attempt === RETRIES) throw err
      console.log(`[migrate] database not ready (attempt ${attempt}/${RETRIES}), retrying…`)
      await sleep(RETRY_DELAY_MS)
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const pool = new pg.Pool({ connectionString: url, max: 1 })
  try {
    await waitForDb(pool)
    console.log('[migrate] applying migrations…')
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
    console.log('[migrate] done')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
