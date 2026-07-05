// Startup environment validation.
//
// Runs once at server boot (see instrumentation.ts) so a misconfigured deployment
// fails fast with a clear message, instead of surfacing later as an obscure runtime
// error. Kept as a pure function over a plain record so it is trivial to unit-test.

type EnvSource = Record<string, string | undefined>

// Variables the app cannot run without.
const REQUIRED = ['DATABASE_URL', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'] as const

// Optional integrations that are all-or-nothing: setting some keys but not the rest
// is almost always a mistake (the feature will half-work or fail), so we warn.
const GROUPS: { name: string; keys: string[] }[] = [
  {
    name: 'Cloudflare R2',
    keys: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'],
  },
  { name: 'Upstash Redis', keys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] },
  { name: 'Feedback e-mail (Resend)', keys: ['RESEND_API_KEY', 'FEEDBACK_FROM_EMAIL', 'FEEDBACK_NOTIFY_EMAIL'] },
]

function isSet(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export interface EnvCheck {
  /** Fatal problems — the app should not start. */
  errors: string[]
  /** Non-fatal misconfigurations worth surfacing in logs. */
  warnings: string[]
}

/** Inspect an environment source and report problems, without throwing. */
export function checkEnv(source: EnvSource): EnvCheck {
  const errors: string[] = []
  const warnings: string[] = []

  for (const key of REQUIRED) {
    if (!isSet(source[key])) errors.push(`Missing required environment variable: ${key}`)
  }

  for (const group of GROUPS) {
    const present = group.keys.filter((k) => isSet(source[k]))
    if (present.length > 0 && present.length < group.keys.length) {
      const missing = group.keys.filter((k) => !isSet(source[k]))
      warnings.push(
        `${group.name} is partially configured — also set ${missing.join(', ')} ` +
          `(or unset all of its keys to disable it).`,
      )
    }
  }

  return { errors, warnings }
}

/**
 * Validate the environment at startup: log any warnings and throw a single, clear
 * error if a required variable is missing.
 */
export function validateEnv(source: EnvSource = process.env): void {
  const { errors, warnings } = checkEnv(source)

  for (const warning of warnings) {
    console.warn(`[env] ${warning}`)
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.map((e) => `  • ${e}`).join('\n')}`)
  }
}
