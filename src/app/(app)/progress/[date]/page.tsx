import { notFound } from 'next/navigation'
import { getDayProgress, getDailyNote, getTodayKey } from '@/lib/actions/progress'
import { getDayDetail } from '@/lib/actions/dashboard'
import DayReviewClient from '@/components/progress/DayReviewClient'
import { t } from '@/i18n'
import type { Metadata } from 'next'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params
  return { title: `${date} · ${t('meta.progress')}` }
}

export default async function DayReviewPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!DATE_RE.test(date)) notFound()

  const [today, detail, dayProgress, note] = await Promise.all([
    getTodayKey(),
    getDayDetail(date),
    getDayProgress(date),
    getDailyNote(date),
  ])

  return (
    <DayReviewClient
      date={date}
      editable={date <= today}
      detail={detail}
      rules={dayProgress.rules}
      anyRules={dayProgress.anyRules}
      hasTrades={dayProgress.hasTrades}
      initialCheckedIn={dayProgress.checkedIn}
      note={note}
      currency="USD"
    />
  )
}
