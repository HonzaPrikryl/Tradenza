import { t } from '@/i18n'

export default function TradesHeader({ total, actions }: { total: number; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('trades.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('trades.subtitle', { count: total })}</p>
      </div>
      {actions}
    </div>
  )
}
