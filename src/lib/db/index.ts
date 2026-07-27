import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

// ─── Driver selection ─────────────────────────────────────────────────────────
// The app speaks to Postgres through one of two drivers:
//   - 'neon': Neon's serverless HTTP driver — no TCP, ideal on serverless hosts
//     (Vercel). Note: it does NOT support interactive transactions.
//   - 'pg':   node-postgres with a connection pool — for any standard Postgres
//     (Docker, RDS, Supabase, bare metal). Full feature set incl. transactions.
// Set DATABASE_DRIVER=neon|pg to force one; otherwise it is auto-detected from
// the connection string host (…neon.tech → neon, anything else → pg).
function resolveDriver(url: string): 'neon' | 'pg' {
  const explicit = process.env.DATABASE_DRIVER?.toLowerCase()
  if (explicit === 'neon' || explicit === 'pg') return explicit
  if (explicit) {
    throw new Error(`Invalid DATABASE_DRIVER "${explicit}" — expected "neon" or "pg".`)
  }
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* non-URL connection strings fall through to the generic driver */
  }
  return host.endsWith('.neon.tech') ? 'neon' : 'pg'
}

export type Database = NodePgDatabase<typeof schema>

function createDb(url: string): Database {
  if (resolveDriver(url) === 'neon') {
    // Structurally compatible with the node-postgres database for everything the
    // app uses; the cast unifies the export type. (db.transaction throws on this
    // driver — neon-http has no transaction support.)
    return drizzleNeonHttp(neon(url), { schema }) as unknown as Database
  }
  const pool = new Pool({
    connectionString: url,
    // Modest default; override for busy self-hosted instances.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  })
  return drizzleNodePg(pool, { schema })
}

export const db = createDb(process.env.DATABASE_URL)

export * from './schema'
