import { t } from '@/i18n'

export default function TradesHeader({ total }: { total: number }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('trades.title')}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{t('trades.subtitle', { count: total })}</p>
    </div>
  )
}
