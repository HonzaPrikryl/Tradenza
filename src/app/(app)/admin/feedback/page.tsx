import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { isAdmin } from '@/lib/admin'
import { getFeedbackList } from '@/lib/actions/feedback'
import AdminFeedbackTable from '@/components/admin/AdminFeedbackTable'
import { t } from '@/i18n'

export const metadata: Metadata = { title: 'Admin · Feedback' }
export const dynamic = 'force-dynamic'

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
        <AdminFeedbackTable items={items} />
      )}
    </div>
  )
}
