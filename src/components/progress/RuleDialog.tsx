'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import Modal from '@/components/ui/Modal'
import { createRule, updateRule, type ProgressRule } from '@/lib/actions/progress'

const inputClass =
  'w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

export default function RuleDialog({
  mode,
  rule,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  rule?: ProgressRule
  onClose: () => void
  onSaved?: () => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('validation.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), description: description.trim() || null }
      if (mode === 'edit' && rule) await updateRule(rule.id, payload)
      else await createRule(payload)
      toast.success(mode === 'edit' ? t('progress.rules.toast.updated') : t('progress.rules.toast.created'))
      onClose()
      onSaved?.()
    } catch {
      toast.error(t('progress.rules.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t(mode === 'edit' ? 'progress.rules.editTitle' : 'progress.rules.newTitle')}
      onClose={onClose}
      onConfirm={save}
      confirmLabel={saving ? t('progress.saving') : t('progress.save')}
      confirmDisabled={saving}
      cancelLabel={t('progress.cancel')}
    >
      <div>
        <label className={labelClass}>{t('progress.rules.nameLabel')}</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={t('progress.rules.namePlaceholder')}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>{t('progress.rules.descLabel')}</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('progress.rules.descPlaceholder')}
          className={inputClass}
        />
      </div>
    </Modal>
  )
}
