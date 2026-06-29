import WizardChrome from '@/components/trade-import/WizardChrome'
import BrokerSelect from '@/components/trade-import/BrokerSelect'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('addTrades.eyebrow') }

export default function ChooseBrokerPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <WizardChrome step={1} />
      <div className="flex flex-1 flex-col items-center px-4 pb-16 pt-6">
        <p className="text-xs font-medium text-muted-foreground">{t('addTrades.eyebrow')}</p>
        <h1 className="mt-1 max-w-xl text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('addTrades.broker.title')}
        </h1>
        <div className="mt-8 w-full">
          <BrokerSelect />
        </div>
      </div>
    </div>
  )
}
