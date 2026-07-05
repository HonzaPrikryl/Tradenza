import posthog from 'posthog-js'

// The small, deliberate set of product events worth tracking — the actions that
// map to real questions ("do people add trades? which import path? do they
// actually use the journal & discipline features that make this product what it
// is?"). NOT every CRUD: keeping this list short keeps the PostHog taxonomy
// clean and the funnels/retention charts meaningful.
//
// Declaring events here (instead of scattering string literals at call sites)
// makes the taxonomy greppable and typo-proof.
//
// The two funnels these power:
//   activation  — account_created → onboarding_completed → (trade_created |
//                 trades_imported): does a new user reach their first trade?
//   engagement  — trade_journaled / daily_review_completed: do they use the
//                 journaling + discipline loop that is the product's core value?
export type AnalyticsEvent =
  // — Setup / activation —
  | { name: 'account_created' }
  | { name: 'onboarding_completed' }
  // — Getting trades in —
  | { name: 'trade_created'; props?: { source?: 'manual'; assetClass?: string } }
  | { name: 'trades_imported'; props?: { count?: number; kind?: 'trades' | 'fills' } }
  | { name: 'trades_exported'; props?: { count?: number } }
  // — Core value: journaling & discipline (fired once per record per visit) —
  | { name: 'trade_journaled' }
  | { name: 'daily_review_completed' }
  | { name: 'progress_rule_created' }
  // — Feature adoption —
  | { name: 'dashboard_customized'; props?: { kind?: 'create' | 'edit' } }

// Analytics is optional: when the PostHog key is unset the provider never
// initialises, so this is a no-op. Wrapped in try/catch because analytics must
// never break a user action.
const ENABLED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)

export function track(event: AnalyticsEvent): void {
  if (!ENABLED || typeof window === 'undefined') return
  try {
    posthog.capture(event.name, 'props' in event ? event.props : undefined)
  } catch {
    /* swallow — never let analytics throw into a user flow */
  }
}
