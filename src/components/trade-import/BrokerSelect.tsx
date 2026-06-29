'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { POPULAR_BROKERS, searchBrokers, type Broker } from '@/lib/brokers'
import { BrokerIcon } from './shared'

export default function BrokerSelect() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Broker | null>(null)
  const [focused, setFocused] = useState(false)

  const results = useMemo(() => searchBrokers(q), [q])
  const showDropdown = focused && q.trim().length > 0 && results.length > 0
  const showNoResults = q.trim().length > 0 && results.length === 0

  const pick = (b: Broker) => {
    setSelected(b)
    setQ(b.name)
    setFocused(false)
  }

  const goNext = (brokerId: string) => router.push(`/trade-import/account?broker=${brokerId}`)

  return (
    <div className="mx-auto w-full max-w-[460px]">
      {/* Search */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setSelected(null)
            setFocused(true)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (selected) goNext(selected.id)
              else if (results.length === 1) goNext(results[0].id)
            }
          }}
          placeholder={t('addTrades.broker.searchPlaceholder')}
          className={cn(
            'w-full rounded-lg border bg-input/40 px-4 py-3 pr-11 text-sm placeholder:text-muted-foreground focus:outline-none',
            focused ? 'border-primary ring-1 ring-primary' : 'border-border',
          )}
        />
        <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        {showDropdown && (
          <div className="absolute z-20 mt-2 max-h-[360px] w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-2xl">
            {results.map((b) => (
              <button
                key={b.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(b)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <BrokerIcon broker={b} size="sm" />
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Not found */}
      {showNoResults && (
        <button
          onClick={() => goNext('generic')}
          className="mt-3 flex w-full items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-left transition-colors hover:bg-primary/15"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-primary" />
          <span className="text-sm font-medium">{t('addTrades.broker.noResults')}</span>
          <span className="text-sm text-muted-foreground">{t('addTrades.broker.noResultsHint')}</span>
        </button>
      )}

      {/* Popular brokers */}
      {!showNoResults && (
        <div className="mt-7">
          <p className="mb-3 text-sm font-semibold">{t('addTrades.broker.popular')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 sm:gap-y-4">
            {POPULAR_BROKERS.map((b) => {
              const isSel = selected?.id === b.id
              return (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                    isSel ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-accent',
                  )}
                >
                  <BrokerIcon broker={b} />
                  <span className="font-medium">{b.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Continue */}
      <button
        disabled={!selected}
        onClick={() => selected && goNext(selected.id)}
        className={cn(
          'mt-8 w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors',
          selected
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'cursor-not-allowed bg-muted text-muted-foreground',
        )}
      >
        {t('addTrades.common.continue')}
      </button>
    </div>
  )
}
