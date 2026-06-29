import type { CSSProperties } from 'react'
import { MAIN_ROW_HEIGHT as DASH_ROW } from '@/lib/dashboard/types'
import { t } from '@/i18n'

function KpiSkeleton() {
  return (
    <div className="flex h-full min-h-[124px] flex-col rounded-xl border border-border bg-card px-4 py-3">
      <div className="border-b border-border/60 pb-2">
        <div className="skeleton h-3 w-16 rounded" />
      </div>
      <div className="flex flex-1 items-center justify-between gap-3 pt-2">
        <div className="skeleton h-6 w-20 rounded" />
        <div className="skeleton h-12 w-12 rounded-full" />
      </div>
    </div>
  )
}

function MainSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
      <div className="skeleton mb-3 h-3 w-28 rounded" />
      <div className="skeleton flex-1 rounded" />
    </div>
  )
}

const MAIN_CELLS: { cs: number; rs: number }[] = [
  { cs: 1, rs: 1 },
  { cs: 1, rs: 1 },
  { cs: 1, rs: 1 },
  { cs: 2, rs: 2 },
  { cs: 1, rs: 1 },
  { cs: 1, rs: 1 },
]

export default function StatsCardsSkeleton() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex w-full shrink-0 gap-2 md:mt-4 md:w-auto">
          <div className="skeleton h-10 flex-1 rounded-lg md:w-32 md:flex-none" />
          <div className="skeleton h-10 w-10 shrink-0 rounded-lg md:w-[120px]" />
        </div>
      </div>

      <div className="space-y-4">
        <div
          className="grid gap-3 grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 min-[1500px]:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
          style={{ '--cols': 5 } as CSSProperties}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>

        <div
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 dash-main"
          style={{ '--main-row': DASH_ROW } as CSSProperties}
        >
          {MAIN_CELLS.map((c, i) => (
            <div
              key={i}
              className={`dash-cell min-h-0${c.cs >= 2 ? ' dash-wide' : ''}`}
              style={{ '--cs': c.cs, '--rs': c.rs } as CSSProperties}
            >
              <MainSkeleton />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
