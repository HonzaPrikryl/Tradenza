'use client'

import Link from 'next/link'
import { ArrowLeft, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import ThemeToggle from '@/components/ui/ThemeToggle'

const STEPS = ['broker', 'account', 'method', 'trades'] as const

export default function WizardChrome({
  step,
  backHref,
  closeHref = '/add-trade',
}: {
  step: number
  backHref?: string
  closeHref?: string
}) {
  return (
    <div className="px-3 sm:px-4 pt-5 pb-2 lg:relative lg:flex lg:items-center lg:justify-center">
      <div className="flex items-center justify-between lg:contents">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={t('addTrades.common.back')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:absolute lg:left-4 lg:top-5"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <span className="h-9 w-9 shrink-0 lg:hidden" aria-hidden />
        )}

        <div className="flex items-center gap-1 shrink-0 lg:absolute lg:right-4 lg:top-5">
          <ThemeToggle />
          <Link
            href={closeHref}
            aria-label={t('addTrades.common.close')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <ol
        className="mt-4 lg:mt-0 mx-auto flex w-full max-w-[440px] items-center gap-2"
        aria-label={t('addTrades.eyebrow')}
      >
        {STEPS.map((key, i) => {
          const n = i + 1
          const done = n < step
          const current = n === step
          const isLast = i === STEPS.length - 1
          return (
            <li key={key} className={cn('flex flex-col items-center gap-1.5', isLast ? 'shrink-0' : 'flex-1')}>
              <div className="flex w-full items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                    done && 'bg-primary text-primary-foreground',
                    current && 'bg-primary/20 text-primary ring-1 ring-primary',
                    !done && !current && 'bg-muted text-muted-foreground',
                  )}
                  aria-current={current ? 'step' : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                {!isLast && (
                  <span
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      done ? 'bg-primary' : current ? 'bg-primary/40' : 'bg-muted',
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'w-full truncate text-left text-[10px] sm:text-[11px] font-medium mr-2',
                  current ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`addTrades.steps.${key}`)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
