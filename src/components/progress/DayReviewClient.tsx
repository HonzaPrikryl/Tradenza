'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ArrowLeft, ChevronRight, ListChecks, Lock, CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { formatCurrency, axisUnit, cn } from '@/lib/utils'
import { t } from '@/i18n'
import { getUiLocale } from '@/i18n/config'
import type { DayDetail } from '@/lib/dashboard/types'
import type { DayRule } from '@/lib/actions/progress'
import { toggleRuleCompletion, setDayCheckedIn, markAllSoftDone } from '@/lib/actions/progress'
import { computeDayStatus, dayInScope, isCleanNoTrade } from '@/lib/progress-compute'
import { useChartColors, makeTooltipStyle } from '@/components/dashboard/widgets/shared'
import ProgressRing from './ProgressRing'
import DailyNoteEditor from './DailyNoteEditor'
import DayRulesSections from './DayRulesSections'
import DayStatusBadge from './DayStatusBadge'

function formatDateHeader(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(getUiLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const cls =
    tone === undefined ? 'text-foreground' : tone > 0 ? 'text-profit' : tone < 0 ? 'text-loss' : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold tabular leading-tight', cls)}>{value}</div>
    </div>
  )
}

export default function DayReviewClient({
  date,
  editable,
  detail,
  rules: initialRules,
  anyRules = true,
  hasTrades = false,
  initialCheckedIn = false,
  note,
  currency,
}: {
  date: string
  editable: boolean
  detail: DayDetail
  rules: DayRule[]
  anyRules?: boolean
  hasTrades?: boolean
  initialCheckedIn?: boolean
  note: string
  currency: string
}) {
  const router = useRouter()
  const c = useChartColors()
  const [rules, setRules] = useState(initialRules)
  const [checkedIn, setCheckedIn] = useState(initialCheckedIn)
  const [pending, startTransition] = useTransition()

  const s = detail.stats
  const color = (s?.netPnl ?? 0) >= 0 ? c.profit : c.loss

  const hardRules = rules.filter((r) => r.type === 'hard')
  const softRules = rules.filter((r) => r.type === 'soft')
  const softDone = softRules.filter((r) => r.completed).length
  const softTotal = softRules.length
  const hardTotal = hardRules.length
  const hardViolations = hardRules.filter((r) => !r.completed).length
  const ratio = softTotal > 0 ? softDone / softTotal : 0
  const inScope = dayInScope({
    hasTrades,
    checkedIn,
    hasLoggedRules: rules.some((r) => (r.type === 'hard' ? !r.completed : r.completed)),
  })
  const cleanNoTrade = isCleanNoTrade(checkedIn, hasTrades)
  const status = computeDayStatus({ inScope, cleanNoTrade, hardTotal, hardViolations, softTotal, softDone })

  const toggle = (ruleId: string, next: boolean) => {
    if (!editable) return
    const isHardViolation = rules.find((r) => r.id === ruleId)?.type === 'hard' && next === false
    setRules((arr) => arr.map((r) => (r.id === ruleId ? { ...r, completed: next } : r)))
    startTransition(async () => {
      try {
        if (handleRateLimit(await toggleRuleCompletion(ruleId, date, next))) {
          setRules((arr) => arr.map((r) => (r.id === ruleId ? { ...r, completed: !next } : r)))
          return
        }
        router.refresh()
        if (isHardViolation) {
          toast(t('progress.day.hardViolationLogged'), {
            action: { label: t('progress.day.undo'), onClick: () => toggle(ruleId, true) },
          })
        }
      } catch (err) {
        setRules((arr) => arr.map((r) => (r.id === ruleId ? { ...r, completed: !next } : r)))
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
      }
    })
  }

  const markAllSoft = () => {
    if (!editable) return
    const prev = rules
    setRules((arr) => arr.map((r) => (r.type === 'soft' ? { ...r, completed: true } : r)))
    startTransition(async () => {
      try {
        if (handleRateLimit(await markAllSoftDone(date))) {
          setRules(prev)
          return
        }
        router.refresh()
      } catch (err) {
        setRules(prev)
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
      }
    })
  }

  const toggleCheckIn = () => {
    if (!editable) return
    const next = !checkedIn
    setCheckedIn(next)
    startTransition(async () => {
      try {
        if (handleRateLimit(await setDayCheckedIn(date, next))) {
          setCheckedIn(!next)
          return
        }
        router.refresh()
      } catch (err) {
        setCheckedIn(!next)
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
      }
    })
  }

  return (
    <div className="p-4 sm:p-6 animate-in">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/progress"
            aria-label={t('progress.dayReview.back')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{formatDateHeader(date)}</h1>
          <span className={cn('text-lg tabular font-bold', s.netPnl >= 0 ? 'text-profit' : 'text-loss')}>
            {formatCurrency(s.netPnl, currency)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label={t('progress.dayReview.netPnl')} value={formatCurrency(s.netPnl, currency)} tone={s.netPnl} />
        <Stat label={t('progress.dayReview.winRate')} value={`${s.winRate.toFixed(1)}%`} />
        <Stat label={t('progress.dayReview.trades')} value={`${s.totalTrades}`} />
        <Stat
          label={t('progress.dayReview.profitFactor')}
          value={isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}
        />
        <Stat label={t('progress.dayReview.grossPnl')} value={formatCurrency(s.grossPnl, currency)} tone={s.grossPnl} />
        <Stat label={t('progress.dayReview.winners')} value={`${s.wins} / ${s.losses}`} />
        <Stat label={t('progress.dayReview.commissions')} value={formatCurrency(s.commissions, currency)} />
        <Stat label={t('progress.dayReview.volume')} value={`${Math.round(s.volume)}`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Running P&L */}
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">{t('progress.dayReview.runningPnl')}</h3>
          {detail.trades.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('progress.dayReview.noTrades')}</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={detail.cumulative} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="reviewCum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: c.axis }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: c.axis }}
                    tickFormatter={(v) => axisUnit(v, 'dollar')}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <ReferenceLine y={0} stroke={c.axis} strokeOpacity={0.3} />
                  <Tooltip
                    contentStyle={makeTooltipStyle(c)}
                    formatter={(v: number) => [formatCurrency(v, currency), 'Cumulative']}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke={color}
                    strokeWidth={1.75}
                    fill="url(#reviewCum)"
                    dot={false}
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Trades */}
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {t('progress.dayReview.tradesTitle', { count: detail.trades.length })}
          </h3>
          <div className="flex-1 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {detail.trades.map((tr) => (
              <Link
                key={tr.id}
                href={`/trades/${tr.id}`}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <span
                  className={cn(
                    'shrink-0 rounded px-1 py-0.5 text-[10px] font-medium uppercase',
                    tr.direction === 'long' ? 'badge-profit' : 'badge-loss',
                  )}
                >
                  {tr.direction === 'long' ? 'L' : 'S'}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-medium">{tr.symbol}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{tr.time}</span>
                    <span>·</span>
                    <span
                      className={cn(
                        'tabular',
                        tr.rMultiple == null ? '' : tr.rMultiple >= 0 ? 'text-profit' : 'text-loss',
                      )}
                    >
                      {tr.rMultiple == null
                        ? '—'
                        : `${tr.rMultiple >= 0 ? '' : '-'}${Math.abs(tr.rMultiple).toFixed(2)}R`}
                    </span>
                  </span>
                </div>
                <span
                  className={cn(
                    'shrink-0 whitespace-nowrap text-sm tabular font-medium',
                    tr.netPnl >= 0 ? 'text-profit' : 'text-loss',
                  )}
                >
                  {formatCurrency(tr.netPnl, currency)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            {detail.trades.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t('progress.dayReview.noTrades')}
              </div>
            )}
          </div>
        </div>

        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-4">
            <ProgressRing
              ratio={ratio}
              size={60}
              label={
                <span className="text-sm">
                  {softDone}
                  <span className="text-muted-foreground">/{softTotal}</span>
                </span>
              }
            />
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                {t('progress.dayReview.rulesTitle')}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {rules.length > 0 && <DayStatusBadge status={status} className="text-xs" />}
                {hardTotal > 0 && (
                  <span
                    className={cn('text-xs font-medium', hardViolations > 0 ? 'text-loss' : 'text-muted-foreground')}
                  >
                    {hardViolations > 0
                      ? hardViolations === 1
                        ? t('progress.hardBroken.one')
                        : t('progress.hardBroken.other', { count: hardViolations })
                      : t('progress.day.hardClean', { total: hardTotal })}
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/progress"
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t('progress.dayReview.discipline')}
            </Link>
          </div>

          {!editable && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              {t('progress.dayReview.readOnly')}
            </div>
          )}

          {editable && !hasTrades && (
            <div className="mb-3">
              <button
                type="button"
                onClick={toggleCheckIn}
                aria-pressed={checkedIn}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  checkedIn
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent/50',
                )}
              >
                {checkedIn ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                {t('progress.day.checkInNoTrade')}
              </button>
              <p className="mt-1 px-1 text-[11px] text-muted-foreground/80">{t('progress.day.checkInNoTradeHint')}</p>
            </div>
          )}

          {rules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {anyRules ? t('progress.day.noScheduledRules') : t('progress.day.noActiveRules')}
            </p>
          ) : (
            <DayRulesSections
              rules={rules}
              editable={editable}
              busy={pending}
              onToggleRule={toggle}
              onMarkAllSoft={markAllSoft}
            />
          )}
        </div>
      </div>

      <div className="mt-5">
        <DailyNoteEditor date={date} initialNote={note} />
      </div>
    </div>
  )
}
