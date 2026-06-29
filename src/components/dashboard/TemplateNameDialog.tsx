'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { t } from '@/i18n'
import Dialog from '@/components/ui/Dialog'

const MAX = 30

interface Props {
  open: boolean
  title: string
  description?: string
  label?: string
  initialName?: string
  confirmLabel?: string
  pending?: boolean
  onSubmit: (name: string) => void
  onClose: () => void
}

export default function TemplateNameDialog({
  open,
  title,
  description,
  label = t('dashboard.templateDialog.nameLabel'),
  initialName = '',
  confirmLabel = t('common.save'),
  pending,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(initialName)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, initialName])

  const trimmed = name.trim()
  const valid = trimmed.length > 0 && trimmed.length <= MAX

  function submit() {
    if (valid && !pending) onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onClose={onClose} z="z-[200]" className="rounded-xl animate-fade-in">
      <div className="flex items-start justify-between gap-3 px-6 pt-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {description && <p className="px-6 pt-1.5 text-sm text-muted-foreground">{description}</p>}

      <div className="px-6 pt-4">
        <label className="block text-sm font-medium mb-1.5">{label}</label>
        <input
          ref={inputRef}
          value={name}
          maxLength={MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary/60"
          placeholder={label}
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{t('dashboard.templateDialog.maxChars', { max: MAX })}</span>
          <span className="tabular">
            {trimmed.length}/{MAX}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={submit}
          disabled={!valid || pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
