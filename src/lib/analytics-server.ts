import { PostHog } from 'posthog-node'

// Server-side analytics for lifecycle events that happen outside the browser —
// i.e. from Clerk webhooks (`user.created`, `user.deleted`). Capturing these on
// the server means they fire exactly once and also cover admin-initiated actions
// (a user deleted from the Clerk dashboard), which a client-side event would miss.
//
// Optional: no-ops when the PostHog key is unset. Reuses the same project key as
// the browser SDK. Creates a short-lived client and flushes before returning —
// the reliable pattern in serverless, where a fire-and-forget capture would be
// dropped when the function ends.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'

export type ServerEvent = 'signed_up' | 'account_deleted'

export async function captureServer(event: ServerEvent, distinctId: string): Promise<void> {
  if (!KEY || !distinctId) return
  const client = new PostHog(KEY, { host: HOST, flushAt: 1, flushInterval: 0 })
  try {
    client.capture({ distinctId, event })
    await client.shutdown()
  } catch {
    /* analytics must never break the webhook */
  }
}
