import posthog from 'posthog-js'

// The small, deliberate set of product events worth tracking — the actions that
// map to real questions ("do people add trades? which import path? do they adopt
// the discipline features?"). NOT every CRUD: keeping this list short keeps the
// PostHog taxonomy clean and the funnels/retention charts meaningful.
//
// Declaring events here (instead of scattering string literals at call sites)
// makes the taxonomy greppable and typo-proof.
export type AnalyticsEvent =
  | { name: 'trade_created'; props?: { source?: 'manual' | 'quick_add'; assetClass?: string } }
  | { name: 'trades_imported'; props?: { count?: number; kind?: 'trades' | 'fills' } }
  | { name: 'account_created' }
  | { name: 'trades_exported'; props?: { count?: number } }
  | { name: 'progress_rule_created' }
  | { name: 'onboarding_completed' }

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
