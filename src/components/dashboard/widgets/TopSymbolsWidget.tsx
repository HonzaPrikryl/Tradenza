'use client'

import { memo } from 'react'
import { Trophy } from 'lucide-react'
import { formatUnit, cn } from '@/lib/utils'
import { t } from '@/i18n'
import { useDashboardData } from '../DashboardDataContext'
import { WidgetShell, WidgetEmpty } from './shared'

function TopSymbolsWidget() {
  const { data, currency, unit } = useDashboardData()
  const rows = data.topSymbols
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)))

  return (
    <WidgetShell
      title={t('dashboard.widgets.top-symbols.label')}
      icon={<Trophy className="w-3.5 h-3.5 text-muted-foreground" />}
      className="h-full min-h-[20rem]"
      bodyClassName="px-4 pb-4 overflow-y-auto"
    >
      {rows.length === 0 ? (
        <WidgetEmpty label={t('dashboard.noData')} />
      ) : (
        <div className="space-y-2.5 pt-1">
          {rows.map((s) => (
            <div key={s.symbol}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-mono font-medium">{s.symbol}</span>
                <span className={cn('tabular text-xs font-medium', s.netPnl >= 0 ? 'text-profit' : 'text-loss')}>
                  {formatUnit(s.netPnl, unit, currency)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    s.netPnl >= 0 ? 'bg-profit' : 'bg-loss',
                  )}
                  style={{ width: `${(Math.abs(s.netPnl) / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  )
}

export default memo(TopSymbolsWidget)
