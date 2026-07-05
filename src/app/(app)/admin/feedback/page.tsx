import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { isAdmin } from '@/lib/admin'
import { getFeedbackList, type FeedbackKind } from '@/lib/actions/feedback'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export const metadata: Metadata = { title: 'Admin · Feedback' }
export const dynamic = 'force-dynamic'

const KIND_CLASS: Record<FeedbackKind, string> = {
  bug: 'bg-loss/15 text-loss',
  idea: 'bg-profit/15 text-profit',
  other: 'bg-muted text-muted-foreground',
}

function formatDateTime(value: Date): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-CA')
}

export default async function AdminFeedbackPage() {
  if (!(await isAdmin())) notFound()
  const items = await getFeedbackList()

  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('admin.nav.users')}
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('admin.feedback.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('admin.feedback.subtitle')}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {t('admin.feedback.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('admin.feedback.columns.kind')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.feedback.columns.message')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.feedback.columns.user')}</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.feedback.columns.date')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <span
                      className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', KIND_CLASS[f.kind])}
                    >
                      {t(`admin.feedback.kind.${f.kind}`)}
                    </span>
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <div className="whitespace-pre-wrap break-words">{f.message}</div>
                    {f.imageUrl && (
                      <a href={f.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={f.imageUrl}
                          alt=""
                          className="max-h-24 rounded-md border border-border object-contain"
                        />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{f.email ?? f.userId}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(f.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
