'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import StrategyFormModal, { type StrategyFormValue } from '@/components/strategies/StrategyFormModal'
import { deleteStrategy } from '@/lib/actions/strategies'
import { t } from '@/i18n'

export default function StrategyDetailActions({ strategy }: { strategy: StrategyFormValue }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)

  async function remove() {
    const ok = await confirm({
      title: t('strategies.delete.title'),
      message: t('strategies.delete.body', { name: strategy.name }),
      confirmLabel: t('strategies.delete.confirm'),
    })
    if (!ok) return
    const res = await deleteStrategy(strategy.id)
    if (handleRateLimit(res)) return
    if (res.success) {
      toast.success(t('strategies.toast.deleted'))
      router.push('/strategies')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
      >
        <Pencil className="h-4 w-4" />
        {t('strategies.edit')}
      </button>
      <button
        onClick={remove}
        aria-label={t('strategies.delete.confirm')}
        className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-loss/40 hover:text-loss"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {editing && (
        <StrategyFormModal strategy={strategy} onClose={() => setEditing(false)} onSaved={() => router.refresh()} />
      )}
    </div>
  )
}
