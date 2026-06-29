import { Check, XCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { ALL_ASSETS, type AssetType, type Broker } from '@/lib/brokers'

export function BrokerIcon({ broker, size = 'md' }: { broker: Broker; size?: 'sm' | 'md' | 'lg' }) {
  const dim =
    size === 'lg'
      ? 'w-12 h-12 text-base rounded-xl'
      : size === 'sm'
        ? 'w-5 h-5 text-[11px] rounded'
        : 'w-8 h-8 text-sm rounded-lg'
  return (
    <span
      className={cn('flex items-center justify-center font-bold shrink-0 border border-border text-foreground', dim)}
    >
      {broker.short}
    </span>
  )
}

export function AssetTypeList({ assets }: { assets: AssetType[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      {ALL_ASSETS.map((a) => {
        const on = assets.includes(a)
        return (
          <span
            key={a}
            className={cn('flex items-center gap-1.5', on ? 'text-foreground' : 'text-muted-foreground/60')}
          >
            {on ? (
              <CheckCircle2 className="h-4 w-4 text-profit" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground/50" />
            )}
            {t(`addTrades.assets.${a}`)}
          </span>
        )
      })}
    </div>
  )
}

export { Check }
