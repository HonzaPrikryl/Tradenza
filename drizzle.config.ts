import type { Config } from 'drizzle-kit'
import { loadEnvConfig } from '@next/env'

// drizzle-kit je samostatné CLI a nenačítá .env.local automaticky,
// proto ho načteme stejně jako to dělá Next.js
loadEnvConfig(process.cwd())

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
