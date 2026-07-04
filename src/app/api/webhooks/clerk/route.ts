import type { NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import * as Sentry from '@sentry/nextjs'
import { purgeUserData } from '@/lib/db/purge-user'

// Clerk webhook endpoint. Configure it in the Clerk Dashboard (Webhooks) to point
// at `/api/webhooks/clerk` and subscribe to the `user.deleted` event; put the
// signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`.
//
// On user deletion we erase all of that user's data.
export async function POST(request: NextRequest): Promise<Response> {
  let event
  try {
    event = await verifyWebhook(request)
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (event.type === 'user.deleted' && event.data.id) {
    try {
      await purgeUserData(event.data.id)
    } catch (err) {
      Sentry.captureException(err, { tags: { component: 'clerk-webhook' }, extra: { userId: event.data.id } })
      return new Response('Failed to process webhook', { status: 500 })
    }
  }

  return new Response('OK', { status: 200 })
}
