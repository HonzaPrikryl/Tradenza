'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import UiModal from '@/components/ui/Modal'
import RichTextEditor from '@/components/ui/RichTextEditor'
import StrategyImagesField from '@/components/strategies/StrategyImagesField'
import { inputClass, labelClass } from '@/components/settings/tags/shared'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { createStrategy, updateStrategy } from '@/lib/actions/strategies'
import { track } from '@/lib/analytics'
import { isEmptyHtml } from '@/lib/html'
import { t } from '@/i18n'

// Minimal, serializable shape both StrategyDTO and the detail page's strategy
// object satisfy — so the same modal edits a strategy from either surface.
export interface StrategyFormValue {
  id: string
  name: string
  description: string | null
  entryChecklist: string[]
  exitChecklist: string[]
  imageUrls: string[]
}

interface Props {
  /** null → create a new strategy; otherwise edit the given one. */
  strategy: StrategyFormValue | null
  onClose: () => void
  onSaved?: () => void
}

type FormState = {
  id: string
  name: string
  description: string
  entryChecklist: string[]
  exitChecklist: string[]
  imageUrls: string[]
}

function ChecklistField({
  label,
  items,
  onChange,
}: {
  label: string
  items: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={item}
              onChange={(e) => {
                const next = [...items]
                next[idx] = e.target.value
                onChange(next)
              }}
              placeholder={t('strategies.form.criterionPlaceholder')}
              maxLength={200}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              aria-label={t('strategies.form.removeCriterion')}
              className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-loss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary text-xs"
        >
          <Plus className="h-4 w-4" />
          {t('strategies.form.addCriterion')}
        </button>
      </div>
    </div>
  )
}

export default function StrategyFormModal({ strategy, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => ({
    id: strategy?.id ?? '',
    name: strategy?.name ?? '',
    description: strategy?.description ?? '',
    entryChecklist: strategy?.entryChecklist ?? [],
    exitChecklist: strategy?.exitChecklist ?? [],
    imageUrls: strategy?.imageUrls ?? [],
  }))
  const [saving, startSaving] = useTransition()

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  function save() {
    if (saving) return
    const name = form.name.trim()
    if (!name) return
    const payload = {
      name,
      description: isEmptyHtml(form.description) ? null : form.description,
      entryChecklist: form.entryChecklist.map((c) => c.trim()).filter(Boolean),
      exitChecklist: form.exitChecklist.map((c) => c.trim()).filter(Boolean),
      imageUrls: form.imageUrls,
    }
    startSaving(async () => {
      const res = form.id ? await updateStrategy(form.id, payload) : await createStrategy(payload)
      if (handleRateLimit(res)) return
      if (res.success) {
        if (!form.id) track({ name: 'strategy_created' })
        toast.success(form.id ? t('strategies.toast.updated') : t('strategies.toast.created'))
        onSaved?.()
        onClose()
      }
    })
  }

  return (
    <UiModal
      title={form.id ? t('strategies.edit') : t('strategies.new')}
      onClose={onClose}
      onConfirm={save}
      confirmLabel={saving ? t('strategies.form.saving') : t('strategies.form.save')}
      confirmDisabled={saving || form.name.trim().length === 0}
      cancelLabel={t('strategies.form.cancel')}
      className="max-w-2xl"
    >
      <div>
        <label className={labelClass}>{t('strategies.form.name')}</label>
        <input
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder={t('strategies.form.namePlaceholder')}
          maxLength={80}
          autoFocus
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>{t('strategies.form.description')}</label>
        <div className="overflow-hidden rounded-md border border-border bg-input/30 focus-within:border-primary">
          <RichTextEditor
            value={form.description}
            onChange={(html) => patch({ description: html })}
            placeholder={t('strategies.form.descriptionPlaceholder')}
            minHeight={140}
          />
        </div>
      </div>

      <ChecklistField
        label={t('strategies.form.entryChecklist')}
        items={form.entryChecklist}
        onChange={(entryChecklist) => patch({ entryChecklist })}
      />

      <ChecklistField
        label={t('strategies.form.exitChecklist')}
        items={form.exitChecklist}
        onChange={(exitChecklist) => patch({ exitChecklist })}
      />

      <StrategyImagesField value={form.imageUrls} onChange={(urls) => patch({ imageUrls: urls })} />
    </UiModal>
  )
}
