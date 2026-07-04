'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ArrowRight, X, Sparkles } from 'lucide-react'
import { dismissOnboarding } from '@/lib/onboarding'
import { t } from '@/i18n'

export type StepKey = 'trade' | 'tags' | 'discipline'

export interface OnboardingStep {
  key: StepKey
  done: boolean
}

const HREFS: Record<StepKey, string> = {
  trade: '/add-trade',
  tags: '/settings/tags',
  discipline: '/progress?tab=rules',
}

export default function GettingStarted({ steps, isDemo }: { steps: OnboardingStep[]; isDemo: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const doneCount = steps.filter((s) => s.done).length

  const dismiss = () =>
    startTransition(async () => {
      await dismissOnboarding()
      router.refresh()
    })

  return (
    <div className="mb-5 rounded-xl border border-primary/25 bg-primary/[0.06] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('onboarding.gettingStarted.title')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('onboarding.gettingStarted.progress', { done: doneCount, total: steps.length })}
              {isDemo ? ` — ${t('onboarding.gettingStarted.demoNote')}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          aria-label={t('onboarding.gettingStarted.dismiss')}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/60 px-3.5 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={
                  step.done
                    ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground'
                    : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border'
                }
              >
                {step.done && <Check className="h-3.5 w-3.5" />}
              </span>
              <span
                className={
                  step.done
                    ? 'truncate text-sm text-muted-foreground line-through'
                    : 'truncate text-sm font-medium text-foreground'
                }
              >
                {t(`onboarding.gettingStarted.steps.${step.key}.label`)}
              </span>
            </div>
            {!step.done && (
              <Link
                href={HREFS[step.key]}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {t(`onboarding.gettingStarted.steps.${step.key}.cta`)}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
