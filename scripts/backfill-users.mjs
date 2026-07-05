// One-time backfill of the `users` registry table from Clerk.
//
// The `users` table is normally kept in sync by the Clerk webhook, but users who
// signed up BEFORE the table existed have no row. This script pages through every
// Clerk user and upserts them, so the DB count matches reality. Safe to re-run
// (idempotent upsert).
//
// Run:
//   node --env-file=.env.local scripts/backfill-users.mjs
//
// Requires CLERK_SECRET_KEY and DATABASE_URL in the env file.

import { createClerkClient } from '@clerk/backend'
import { neon } from '@neondatabase/serverless'

const { DATABASE_URL, CLERK_SECRET_KEY } = process.env
if (!DATABASE_URL || !CLERK_SECRET_KEY) {
  console.error(
    '❌ Missing DATABASE_URL or CLERK_SECRET_KEY (run with: node --env-file=.env.local scripts/backfill-users.mjs)',
  )
  process.exit(1)
}

const sql = neon(DATABASE_URL)
const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY })

function primaryEmail(u) {
  const primary = u.primaryEmailAddressId && u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
  return (primary || u.emailAddresses[0])?.emailAddress ?? null
}

let offset = 0
const limit = 100
let total = 0

for (;;) {
  const { data: page } = await clerk.users.getUserList({ limit, offset })
  if (page.length === 0) break

  for (const u of page) {
    const email = primaryEmail(u)
    const createdAt = u.createdAt ? new Date(u.createdAt) : new Date()
    await sql`
      INSERT INTO users (id, email, first_name, last_name, username, created_at, updated_at)
      VALUES (${u.id}, ${email}, ${u.firstName ?? null}, ${u.lastName ?? null}, ${u.username ?? null}, ${createdAt}, now())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        username = EXCLUDED.username,
        updated_at = now()
    `
    total++
  }
  offset += page.length
  console.log(`  …synced ${total} users so far`)
}

const [{ n }] = await sql`SELECT count(*)::int AS n FROM users`
console.log(`✓ Backfill complete. ${total} users processed; ${n} rows now in users table.`)
