import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { isAdmin } from '@/lib/admin'
import { getUserDetail, type AdminUserDetail } from '@/lib/actions/admin'
import { formatCurrency, cn } from '@/lib/utils'
import { t } from '@/i18n'

export const metadata: Metadata = { title: 'Admin · User' }
export const dynamic = 'force-dynamic'

function displayName(u: AdminUserDetail['user']): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || u.email || u.id
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA')
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  if (!(await isAdmin())) notFound()
  const { userId } = await params
  const detail = await getUserDetail(userId)
  if (!detail) notFound()

  const { user, stats, accounts, recentTrades } = detail
  const winRate = stats.closedCount > 0 ? Math.round((stats.winCount / stats.closedCount) * 100) : null

  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('admin.user.back')}
      </Link>

      {/* Identity */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{displayName(user)}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{user.email ?? '—'}</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          {user.username && <span>@{user.username}</span>}
          <span className="font-mono">{user.id}</span>
          <span>{t('admin.user.joined', { date: formatDate(user.createdAt) })}</span>
          <span>{t('admin.user.lastActive', { date: formatDate(stats.lastActiveAt) })}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t('admin.user.kpi.trades')} value={String(stats.tradeCount)} />
        <Tile
          label={t('admin.user.kpi.journaled')}
          value={String(stats.journaledCount)}
          sub={pct(stats.journaledCount, stats.tradeCount)}
        />
        <Tile
          label={t('admin.user.kpi.netPnl')}
          value={formatCurrency(stats.netPnl)}
          valueClass={stats.netPnl > 0 ? 'text-profit' : stats.netPnl < 0 ? 'text-loss' : undefined}
        />
        <Tile
          label={t('admin.user.kpi.winRate')}
          value={winRate === null ? '—' : `${winRate}%`}
          sub={t('admin.user.kpi.closed', { count: stats.closedCount })}
        />
        <Tile label={t('admin.user.kpi.accounts')} value={String(stats.accountCount)} />
        <Tile label={t('admin.user.kpi.reviews')} value={String(stats.reviewCount)} />
        <Tile label={t('admin.user.kpi.rules')} value={String(stats.ruleCount)} />
        <Tile
          label={t('admin.user.kpi.imports')}
          value={String(stats.importCount)}
          sub={t('admin.user.kpi.tags', { count: stats.tagCount })}
        />
      </div>

      {/* Accounts */}
      <Section title={t('admin.user.accounts.title')}>
        {accounts.length === 0 ? (
          <Empty>{t('admin.user.accounts.empty')}</Empty>
        ) : (
          <Table
            head={[
              t('admin.user.accounts.columns.name'),
              t('admin.user.accounts.columns.firm'),
              t('admin.user.accounts.columns.phase'),
              t('admin.user.accounts.columns.trades'),
              t('admin.user.accounts.columns.netPnl'),
            ]}
            align={['left', 'left', 'left', 'right', 'right']}
          >
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">
                  {a.name}
                  {a.archived && (
                    <span className="ml-2 text-xs text-muted-foreground">({t('admin.user.accounts.archived')})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{a.firm ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.phase ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{a.tradeCount}</td>
                <td className={cn('px-4 py-3 text-right tabular-nums', pnlClass(a.netPnl))}>
                  {formatCurrency(a.netPnl)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Recent trades */}
      <Section
        title={t('admin.user.trades.title')}
        hint={recentTrades.length > 0 ? t('admin.user.trades.hint', { count: recentTrades.length }) : undefined}
      >
        {recentTrades.length === 0 ? (
          <Empty>{t('admin.user.trades.empty')}</Empty>
        ) : (
          <Table
            head={[
              t('admin.user.trades.columns.symbol'),
              t('admin.user.trades.columns.direction'),
              t('admin.user.trades.columns.status'),
              t('admin.user.trades.columns.entry'),
              t('admin.user.trades.columns.netPnl'),
            ]}
            align={['left', 'left', 'left', 'left', 'right']}
          >
            {recentTrades.map((tr) => (
              <tr key={tr.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{tr.symbol}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{tr.direction}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{tr.status}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(tr.entryDatetime)}</td>
                <td className={cn('px-4 py-3 text-right tabular-nums', pnlClass(tr.netPnl))}>
                  {tr.netPnl === null ? '—' : formatCurrency(tr.netPnl)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}

function pnlClass(v: number | null): string | undefined {
  if (v === null || v === 0) return undefined
  return v > 0 ? 'text-profit' : 'text-loss'
}

function Tile({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className={cn('text-xl font-semibold tabular-nums', valueClass)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {label}
        {sub && <span className="ml-1 opacity-70">· {sub}</span>}
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Table({ head, align, children }: { head: string[]; align: ('left' | 'right')[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={cn('px-4 py-3 font-medium', align[i] === 'right' ? 'text-right' : 'text-left')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
