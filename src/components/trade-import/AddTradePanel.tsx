'use client'

import { useState } from 'react'
import { FileUp, CopyPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { Broker } from '@/lib/brokers'
import ManualEntry from './ManualEntry'
import UploadStep from './UploadStep'

export type AddTradeMode = 'manual' | 'upload'

export default function AddTradePanel({
  broker,
  accountId,
  defaultTimezone,
  initialMode,
}: {
  broker: Broker
  accountId: string
  defaultTimezone: string
  initialMode: AddTradeMode
}) {
  const [mode, setMode] = useState<AddTradeMode>(initialMode)

  const tabs: { key: AddTradeMode; icon: typeof FileUp; label: string }[] = [
    { key: 'manual', icon: CopyPlus, label: t('addTrades.method.manual.title') },
    { key: 'upload', icon: FileUp, label: t('addTrades.method.fileUpload.title') },
  ]

  return (
    <div className="w-full">
      {/* Mode switch */}
      <div className="mb-8 inline-grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              mode === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'manual' ? (
        <ManualEntry brokerId={broker.id} accountId={accountId} cancelHref="/add-trade" />
      ) : (
        <UploadStep broker={broker} accountId={accountId} defaultTimezone={defaultTimezone} />
      )}
    </div>
  )
}
