import type { Config } from 'drizzle-kit'
import { loadEnvConfig } from '@next/env'

// drizzle-kit is a standalone CLI and does not load .env.local automatically,
// so we load it the same way Next.js does
loadEnvConfig(process.cwd())

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
