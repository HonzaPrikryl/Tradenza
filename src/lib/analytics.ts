import posthog from 'posthog-js'

export type ImportKind = 'trades' | 'fills'

export type ImportFunnelProps = {
  kind?: ImportKind
  broker?: string
  /** Source column names only. Row values are never sent. */
  headers?: string[]
  unmapped?: string[]
  /** Fields the user had to correct by hand — the auto-mapper's error report. */
  remapped?: string[]
}

const MAX_HEADERS = 40
const MAX_HEADER_LENGTH = 64

/** Keeps header payloads bounded; exports occasionally carry hundreds of columns. */
export function headerSample(headers: string[]): string[] {
  return headers.slice(0, MAX_HEADERS).map((h) => h.trim().slice(0, MAX_HEADER_LENGTH))
}

// The small, deliberate set of product events worth tracking — the actions that
// map to real questions ("do people add trades? which import path? do they
// actually use the journal & discipline features that make this product what it
// is?"). NOT every CRUD: keeping this list short keeps the PostHog taxonomy
// clean and the funnels/retention charts meaningful.
//
// Declaring events here (instead of scattering string literals at call sites)
// makes the taxonomy greppable and typo-proof.
//
// The three funnels these power:
//   activation  — account_created → onboarding_completed → (trade_created |
//                 trades_imported): does a new user reach their first trade?
//   engagement  — trade_journaled / daily_review_completed: do they use the
//                 journaling + discipline loop that is the product's core value?
//   csv import  — import_file_parsed → (trades_imported | import_failed |
//                 import_abandoned), with import_parse_failed as the pre-funnel
//                 drop-off. Because the mapper is heuristic rather than a set of
//                 per-broker parsers, these events carry the source column names
//                 (headers only — never row values): a failed import turns into
//                 a concrete list of headers to teach COLUMN_CANDIDATES.
export type AnalyticsEvent =
  // — Setup / activation —
  | { name: 'account_created' }
  | { name: 'onboarding_completed' }
  // — Getting trades in —
  | { name: 'trade_created'; props?: { source?: 'manual'; assetClass?: string } }
  | { name: 'trades_imported'; props?: { count?: number; kind?: ImportKind; remapped?: string[] } }
  | { name: 'trades_exported'; props?: { count?: number } }
  // — CSV import funnel —
  | { name: 'import_parse_failed'; props?: { reason?: 'empty' | 'unreadable'; broker?: string } }
  | { name: 'import_file_parsed'; props?: ImportFunnelProps & { rows?: number; autoMapped?: number } }
  | { name: 'import_failed'; props?: ImportFunnelProps & { total?: number; skipped?: number; errors?: number } }
  | { name: 'import_abandoned'; props?: ImportFunnelProps }
  // — Core value: journaling & discipline (fired once per record per visit) —
  | { name: 'trade_journaled' }
  | { name: 'daily_review_completed' }
  | { name: 'progress_rule_created' }
  // — Feature adoption —
  | { name: 'dashboard_customized'; props?: { kind?: 'create' | 'edit' } }
  | { name: 'strategy_created' }

// Analytics is optional: when the PostHog key is unset the provider never
// initialises, so this is a no-op. Wrapped in try/catch because analytics must
// never break a user action.
const ENABLED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)

export function track(event: AnalyticsEvent, opts?: { beacon?: boolean }): void {
  if (!ENABLED || typeof window === 'undefined') return
  try {
    posthog.capture(
      event.name,
      'props' in event ? event.props : undefined,
      // Unload-time events (tab close, navigation away) need sendBeacon or the
      // request is cancelled before it leaves the browser.
      opts?.beacon ? { transport: 'sendBeacon' } : undefined,
    )
  } catch {
    /* swallow — never let analytics throw into a user flow */
  }
}
