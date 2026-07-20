'use client'

import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import UiModal from '@/components/ui/Modal'

// ─── Shared constants & types ─────────────────────────────────────────────────

export const PALETTE = [
  '#64748b',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#84cc16',
]

export const DEFAULT_COLOR = PALETTE[0]

export const inputClass =
  'w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
export const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

export type Tab = 'categories' | 'tags'

export interface Category {
  id: string
  name: string
  color: string
  count: number
}

export interface FlatTag {
  id: string
  name: string
  color: string
  used: number
  categoryId: string | null
  categoryName: string
  categoryColor: string
}

// ─── Color picker ─────────────────────────────────────────────────────────────

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const isCustom = !PALETTE.some((c) => c.toLowerCase() === value.toLowerCase())
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'h-7 w-7 rounded-full transition-transform hover:scale-110',
            value.toLowerCase() === c.toLowerCase() && 'ring-2 ring-offset-2 ring-offset-card ring-foreground/60',
          )}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}

      <label
        className={cn(
          'relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border transition-transform hover:scale-110',
          isCustom && 'ring-2 ring-offset-2 ring-offset-card ring-foreground/60',
        )}
        style={isCustom ? { backgroundColor: value } : undefined}
        title={t('settings.tagsManagement.customColor')}
      >
        {!isCustom && (
          <span
            className="h-full w-full"
            style={{
              background: 'conic-gradient(#ef4444,#f59e0b,#84cc16,#10b981,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)',
            }}
          />
        )}
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={t('settings.tagsManagement.customColor')}
        />
      </label>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
  onSave,
  saving,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  onSave: () => void
  saving: boolean
}) {
  return (
    <UiModal
      title={title}
      onClose={onClose}
      onConfirm={onSave}
      confirmLabel={saving ? t('settings.tagsManagement.saving') : t('settings.tagsManagement.save')}
      confirmDisabled={saving}
      cancelLabel={t('settings.tagsManagement.cancel')}
    >
      {children}
    </UiModal>
  )
}
