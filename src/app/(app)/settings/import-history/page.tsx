import { getImportHistory } from '@/lib/actions/wizard'
import { getBroker } from '@/lib/brokers'
import { formatDateTime, cn } from '@/lib/utils'
import { t } from '@/i18n'
import DeleteImportButton from '@/components/settings/DeleteImportButton'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.settingsImportHistory') }

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-profit/15 text-profit',
  partial: 'bg-amber-400/15 text-amber-400',
  failed: 'bg-loss/15 text-loss',
}

export default async function ImportHistoryPage() {
  const rows = await getImportHistory()

  return (
    <div className="p-4 sm:p-6 animate-in">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">{t('settings.importHistory.title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.importHistory.subtitle')}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">{t('settings.importHistory.col.account')}</th>
                <th className="px-5 py-3 text-left font-medium">{t('settings.importHistory.col.broker')}</th>
                <th className="px-5 py-3 text-left font-medium">{t('settings.importHistory.col.uploadDate')}</th>
                <th className="px-5 py-3 text-right font-medium">{t('settings.importHistory.col.transactions')}</th>
                <th className="px-5 py-3 text-right font-medium">{t('settings.importHistory.col.trades')}</th>
                <th className="px-5 py-3 text-left font-medium">{t('settings.importHistory.col.status')}</th>
                <th className="px-5 py-3 text-right font-medium">{t('settings.importHistory.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const broker = getBroker(r.broker ?? undefined)
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors hover:bg-accent/40 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-foreground">{r.accountName ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{broker?.name ?? r.broker ?? '—'}</td>
                    <td className="px-5 py-3 tabular text-muted-foreground whitespace-nowrap">
                      {formatDateTime(new Date(r.uploadDate))}
                    </td>
                    <td className="px-5 py-3 text-right tabular">{r.transactions}</td>
                    <td className="px-5 py-3 text-right tabular">{r.trades}</td>
                    <td className="px-5 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[r.status])}>
                        {t(`settings.importHistory.status.${r.status}`)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <DeleteImportButton id={r.id} filename={r.filename} trades={r.trades} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              {t('settings.importHistory.empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
