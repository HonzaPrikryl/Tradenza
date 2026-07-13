'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, CopyPlus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { type AssetType } from '@/lib/brokers'
import { AssetTypeList } from './shared'

type Method = 'autoSync' | 'fileUpload' | 'manual'

export default function MethodSelect({
  brokerId,
  accountId,
  canUpload,
  assets,
  known,
}: {
  brokerId: string
  accountId: string
  canUpload: boolean
  assets: AssetType[]
  known: boolean
}) {
  const router = useRouter()
  const [method, setMethod] = useState<Method>(canUpload ? 'fileUpload' : 'manual')

  const goNext = () => {
    const dest = method === 'fileUpload' ? 'upload' : 'manual'
    router.push(`/trade-import/${dest}?broker=${brokerId}&account=${accountId}`)
  }

  const cards: {
    key: Method
    icon: LucideIcon
    title: string
    desc: string
    badge?: string
    badgeTone?: 'muted' | 'recommended'
    disabled?: boolean
    note?: string
    cta?: string
  }[] = [
    {
      key: 'fileUpload',
      icon: FileUp,
      title: t('addTrades.method.fileUpload.title'),
      desc: t('addTrades.method.fileUpload.desc'),
      badge: t('addTrades.method.fileUpload.badge'),
      badgeTone: 'recommended',
      disabled: !canUpload,
      note: canUpload ? undefined : t('addTrades.method.fileUpload.notSupported'),
    },
    {
      key: 'manual',
      icon: CopyPlus,
      title: t('addTrades.method.manual.title'),
      desc: t('addTrades.method.manual.desc'),
    },
  ]

  return (
    <div className="w-full">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          const selected = method === c.key && !c.disabled
          const Icon = c.icon
          return (
            <button
              key={c.key}
              disabled={c.disabled}
              onClick={() => !c.disabled && setMethod(c.key)}
              className={cn(
                'relative flex flex-col items-center rounded-2xl border px-6 py-7 text-center transition-colors',
                c.disabled
                  ? 'cursor-not-allowed border-border bg-card/40 opacity-70'
                  : selected
                    ? 'border-primary bg-card ring-1 ring-primary'
                    : 'border-border bg-card hover:border-border/80 hover:bg-accent/30',
              )}
            >
              {c.badge && (
                <span
                  className={cn(
                    'absolute left-4 top-4 rounded-md px-2 py-0.5 text-[11px] font-medium',
                    c.badgeTone === 'recommended' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {c.badge}
                </span>
              )}

              <span className="mt-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
                <Icon className="h-7 w-7 text-primary" />
              </span>

              <span className="mt-4 text-lg font-semibold">{c.title}</span>
              <span className="mt-1 text-xs text-muted-foreground">{c.desc}</span>
              {c.cta && <span className="mt-2 text-xs text-muted-foreground">{c.cta}</span>}
              {c.note && <span className="mt-2 text-xs text-primary/80">{c.note}</span>}
            </button>
          )
        })}
      </div>

      {/* Supported asset types — for file upload */}
      {canUpload && known && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-sm font-semibold">{t('addTrades.method.supportedAssets')}</p>
          <AssetTypeList assets={assets} />
        </div>
      )}

      <div className="mt-10 flex justify-center">
        <button
          onClick={goNext}
          className="w-full max-w-md rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('addTrades.common.continue')}
        </button>
      </div>
    </div>
  )
}
