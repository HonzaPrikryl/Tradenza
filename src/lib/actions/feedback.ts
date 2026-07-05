'use server'

import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { mutationAction } from '@/lib/safe-action'
import { db, feedback, users } from '@/lib/db'
import { isAdmin } from '@/lib/admin'
import { sendEmail, isMailerConfigured } from '@/lib/email'

export type FeedbackKind = 'bug' | 'idea' | 'other'

const feedbackSchema = z.object({
  kind: z.enum(['bug', 'idea', 'other']),
  message: z.string().trim().min(1).max(4000),
  imageUrl: z.string().url().max(2048).optional(),
})

// Only accept an image URL that we ourselves produced (lives under the R2 public
// base). Prevents storing/displaying arbitrary attacker-supplied URLs in the
// admin view.
function safeImageUrl(url: string | undefined): string | null {
  const base = process.env.R2_PUBLIC_URL
  if (!url || !base) return null
  return url.startsWith(base) ? url : null
}

// Submit a bug report / idea / wish. Auth + input validation + rate limiting are
// enforced by `mutationAction`. The row is always stored; the e-mail notification
// is best-effort and can never fail the submit.
export const submitFeedback = mutationAction([feedbackSchema], async ({ userId }, { kind, message, imageUrl }) => {
  const image = safeImageUrl(imageUrl)
  await db.insert(feedback).values({ userId, kind, message, imageUrl: image })

  if (isMailerConfigured() && process.env.FEEDBACK_NOTIFY_EMAIL) {
    void sendEmail({
      to: process.env.FEEDBACK_NOTIFY_EMAIL,
      subject: `[Tradenza] ${kind} feedback`,
      text: `Type: ${kind}\nUser: ${userId}\n\n${message}${image ? `\n\nAttachment: ${image}` : ''}`,
    })
  }

  return { success: true }
})

export interface FeedbackRow {
  id: string
  userId: string
  kind: FeedbackKind
  message: string
  imageUrl: string | null
  createdAt: Date
  email: string | null
}

// Admin-gated list of all submitted feedback, newest first.
export async function getFeedbackList(): Promise<FeedbackRow[]> {
  if (!(await isAdmin())) throw new Error('Forbidden')
  const rows = await db
    .select({
      id: feedback.id,
      userId: feedback.userId,
      kind: feedback.kind,
      message: feedback.message,
      imageUrl: feedback.imageUrl,
      createdAt: feedback.createdAt,
      email: users.email,
    })
    .from(feedback)
    .leftJoin(users, eq(users.id, feedback.userId))
    .orderBy(desc(feedback.createdAt))
    .limit(500)
  return rows
}
