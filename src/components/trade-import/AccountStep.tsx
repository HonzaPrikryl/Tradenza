'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { createAccount, type AccountInput } from '@/lib/actions/accounts'
import { track } from '@/lib/analytics'

const inputClass =
  'w-full rounded-md border border-border bg-input/40 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

const emptyForm: AccountInput = {
  name: '',
  firm: '',
  broker: '',
  timezone: '',
  accountSize: '',
  phase: '',
  startingBalance: '',
  currency: 'USD',
}

export default function AccountStep({ brokerId, brokerName }: { brokerId: string; brokerName: string | null }) {
  const router = useRouter()
  const [form, setForm] = useState<AccountInput>({ ...emptyForm, firm: brokerName ?? '' })
  const [saving, setSaving] = useState(false)
  const [balanceEdited, setBalanceEdited] = useState(false)

  const canContinue = form.name.trim().length > 0

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error(t('accounts.toast.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const res = await createAccount({ ...form, broker: brokerId })
      if (handleRateLimit(res)) {
        setSaving(false)
        return
      }
      track({ name: 'account_created' })
      toast.success(t('addTrades.account.created'))
      router.push(`/trade-import/method?broker=${brokerId}&account=${res.account.id}`)
    } catch (e) {
      toast.error(getActionErrorMessage(e, 'accounts.toast.saveError'))
      setSaving(false)
    }
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('accounts.name')} *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && canContinue && submit()}
              placeholder={t('accounts.namePlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('accounts.firm')}</label>
            <input
              value={form.firm as string}
              onChange={(e) => setForm({ ...form, firm: e.target.value })}
              placeholder={t('accounts.firmPlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('accounts.phase')}</label>
            <input
              value={form.phase as string}
              onChange={(e) => setForm({ ...form, phase: e.target.value })}
              placeholder={t('accounts.phasePlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('accounts.accountSize')}</label>
            <input
              type="number"
              step="any"
              value={form.accountSize as number | string}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Number(e.target.value)
                setForm((f) => ({ ...f, accountSize: val, startingBalance: balanceEdited ? f.startingBalance : val }))
              }}
              placeholder="50000"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('accounts.startingBalance')}</label>
              <input
                type="number"
                step="any"
                value={form.startingBalance as number | string}
                onChange={(e) => {
                  setBalanceEdited(true)
                  setForm((f) => ({ ...f, startingBalance: e.target.value === '' ? '' : Number(e.target.value) }))
                }}
                placeholder="50000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('accounts.currency')}</label>
              {/* USD-only for now — locked so all amounts stay in one currency. */}
              <input value="USD" readOnly disabled aria-readonly className={cn(inputClass, 'opacity-70')} />
            </div>
          </div>
        </div>
      </div>

      {/* Continue */}
      <button
        disabled={!canContinue || saving}
        onClick={submit}
        className={cn(
          'mt-8 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
          canContinue && !saving
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'cursor-not-allowed bg-muted text-muted-foreground',
        )}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('addTrades.account.createAndContinue')}
      </button>
    </div>
  )
}
