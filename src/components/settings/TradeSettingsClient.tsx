'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DollarSign, Percent, RotateCcw } from 'lucide-react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { setBreakevenPref, resetBreakevenPref, type GlobalSettings } from '@/lib/global-settings'
import type { BreakevenMode } from '@/lib/breakeven'

export default function TradeSettingsClient({ settings }: { settings: GlobalSettings }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">{t('settings.trade.title')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.trade.subtitle')}</p>
      </div>

      <div className="max-w-md space-y-6 px-5 py-5">
        <BreakevenSection initial={settings.breakeven} />
      </div>
    </div>
  )
}

function BreakevenSection({ initial }: { initial: GlobalSettings['breakeven'] }) {
  const router = useRouter()
  const [, start] = useTransition()

  const [mode, setMode] = useState<BreakevenMode>(initial?.mode ?? 'dollar')
  const [from, setFrom] = useState(initial ? String(initial.from) : '')
  const [to, setTo] = useState(initial ? String(initial.to) : '')

  const persist = (m: BreakevenMode, f: string, tv: string) =>
    start(async () => {
      await setBreakevenPref({ mode: m, from: Number(f) || 0, to: Number(tv) || 0 })
      toast.success(t('settings.global.saved'))
      router.refresh()
    })

  const onMode = (m: BreakevenMode) => {
    if (m === mode) return
    setMode(m)
    persist(m, from, to)
  }

  const reset = () =>
    start(async () => {
      await resetBreakevenPref()
      setMode('dollar')
      setFrom('')
      setTo('')
      toast.success(t('settings.global.saved'))
      router.refresh()
    })

  const Icon = mode === 'percent' ? Percent : DollarSign
  const isSet = from.trim() !== '' || to.trim() !== ''

  return (
    <div>
      <label className="block text-sm font-medium">{t('settings.global.breakeven')}</label>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('settings.global.breakevenHint')}</p>

      <div className="mt-3 inline-flex rounded-lg border border-border bg-card p-1">
        {(['dollar', 'percent'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(m === 'dollar' ? 'settings.global.breakevenModeDollar' : 'settings.global.breakevenModePercent')}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-end gap-3">
        <Field
          label={t('settings.global.breakevenFrom')}
          value={from}
          onChange={setFrom}
          onCommit={() => persist(mode, from, to)}
          icon={<Icon className="h-3.5 w-3.5" />}
        />
        <Field
          label={t('settings.global.breakevenTo')}
          value={to}
          onChange={setTo}
          onCommit={() => persist(mode, from, to)}
          icon={<Icon className="h-3.5 w-3.5" />}
        />
        <button
          type="button"
          onClick={reset}
          disabled={!isSet}
          title={t('settings.global.breakevenReset')}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors',
            isSet ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'cursor-not-allowed opacity-40',
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('settings.global.breakevenReset')}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  onCommit,
  icon,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  icon: React.ReactNode
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground">
          {icon}
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2.5 text-sm tabular outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="0"
        />
      </span>
    </label>
  )
}
