'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit, handleRateLimitBatch } from '@/components/ui/rate-limit-toast'
import { Plus, Search, Pencil, Trash2, X } from 'lucide-react'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useSelection } from '@/hooks/useSelection'
import Select from '@/components/ui/Select'
import { createTagGroup, createTag, updateTagGroup, deleteTagGroup } from '@/lib/actions/tags'
import ActionMenu from '@/components/ui/ActionMenu'
import DataTable from '@/components/ui/DataTable'
import { categoryColumns } from './columns'
import { ColorPicker, Modal, DEFAULT_COLOR, inputClass, labelClass, type Category } from './shared'

export default function CategoriesView({ categories, onChanged }: { categories: Category[]; onChanged: () => void }) {
  const confirm = useConfirm()
  const [sort, setSort] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const sel = useSelection()
  const [dialog, setDialog] = useState<{ mode: 'new' | 'edit'; cat?: Category } | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [saving, setSaving] = useState(false)
  const [tagList, setTagList] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  const addTagChip = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    setTagList((prev) => (prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]))
    setTagInput('')
  }
  const removeTagChip = (v: string) => setTagList((prev) => prev.filter((x) => x !== v))

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories
    return [...filtered].sort((a, b) => (sort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)))
  }, [categories, search, sort])

  const openNew = () => {
    setName('')
    setColor(DEFAULT_COLOR)
    setTagList([])
    setTagInput('')
    setDialog({ mode: 'new' })
  }
  const openEdit = (cat: Category) => {
    setName(cat.name)
    setColor(cat.color)
    setTagList([])
    setTagInput('')
    setDialog({ mode: 'edit', cat })
  }

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('settings.tagsManagement.toast.nameRequired'))
      return
    }
    setSaving(true)
    try {
      if (dialog?.mode === 'edit' && dialog.cat) {
        const res = await updateTagGroup(dialog.cat.id, { name: name.trim(), color })
        if (handleRateLimit(res)) return
        toast.success(t('settings.tagsManagement.toast.updated'))
        setDialog(null)
        onChanged()
        return
      }

      const res = await createTagGroup({ name: name.trim(), color })
      if (handleRateLimit(res)) return
      const groupId = res.group.id

      const pending = tagInput.trim()
      const seen = new Set<string>()
      const finalTags = [...tagList, ...(pending ? [pending] : [])].filter((tg) => {
        const key = tg.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      if (finalTags.length > 0) {
        const results = await Promise.all(finalTags.map((tg) => createTag({ name: tg, color, groupId })))
        if (handleRateLimitBatch(results)) {
          onChanged()
          return
        }
      }

      toast.success(t('settings.tagsManagement.toast.created'))
      setDialog(null)
      onChanged()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'settings.tagsManagement.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (cat: Category) => {
    const ok = await confirm({
      title: t('settings.tagsManagement.rowMenu.delete'),
      message: tRich('settings.tagsManagement.confirmDeleteCategory', { name: cat.name }),
      variant: 'delete',
    })
    if (!ok) return
    try {
      if (handleRateLimit(await deleteTagGroup(cat.id))) return
      toast.success(t('settings.tagsManagement.toast.deleted'))
      onChanged()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'settings.tagsManagement.toast.deleteError'))
    }
  }

  const bulkDelete = async () => {
    const ok = await confirm({
      title: t('settings.tagsManagement.rowMenu.delete'),
      message: tRich('settings.tagsManagement.confirmBulkCategories', { count: sel.size }),
      variant: 'delete',
    })
    if (!ok) return
    try {
      if (handleRateLimitBatch(await Promise.all(sel.ids.map((id) => deleteTagGroup(id))))) return
      toast.success(t('settings.tagsManagement.toast.deleted'))
      sel.clear()
      onChanged()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'settings.tagsManagement.toast.deleteError'))
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">{t('settings.tagsManagement.categoriesTitle')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.tagsManagement.categoriesSubtitle')}</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{t('settings.tagsManagement.sortBy')}</span>
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as 'asc' | 'desc')}
            className="h-9 w-36"
            options={[
              { value: 'asc', label: t('settings.tagsManagement.sortNameAsc') },
              { value: 'desc', label: t('settings.tagsManagement.sortNameDesc') },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {sel.size > 0 && (
            <button
              onClick={bulkDelete}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-loss/40 px-3 py-2 text-sm text-loss transition-colors hover:bg-loss/10"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('settings.tagsManagement.bulkDelete', { count: sel.size })}</span>
            </button>
          )}
          <div className="relative flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('settings.tagsManagement.searchCategory')}
              className="w-full sm:w-56 rounded-md border border-border bg-input/40 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <button
            onClick={openNew}
            className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 sm:px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settings.tagsManagement.addCategory')}</span>
          </button>
        </div>
      </div>

      <DataTable
        bordered={false}
        data={rows}
        rowKey={(c) => c.id}
        selection={sel}
        sort={{ by: 'name', order: sort }}
        onSortChange={(s) => setSort(s.order)}
        manualSorting
        empty={t('settings.tagsManagement.emptyCategories')}
        className="border-y border-border"
        columns={categoryColumns}
        actions={(c) => (
          <ActionMenu
            width={168}
            items={[
              { key: 'edit', label: t('settings.tagsManagement.rowMenu.edit'), icon: Pencil },
              { key: 'delete', label: t('settings.tagsManagement.rowMenu.delete'), icon: Trash2, danger: true },
            ]}
            onSelect={(k) => (k === 'edit' ? openEdit(c) : remove(c))}
          />
        )}
      />

      {dialog && (
        <Modal
          title={t(
            dialog.mode === 'edit'
              ? 'settings.tagsManagement.editCategoryTitle'
              : 'settings.tagsManagement.newCategoryTitle',
          )}
          onClose={() => setDialog(null)}
          onSave={save}
          saving={saving}
        >
          <div>
            <label className={labelClass}>{t('settings.tagsManagement.nameLabel')}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={t('settings.tagsManagement.namePlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('settings.tagsManagement.colorLabel')}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {dialog.mode === 'new' && (
            <div>
              <label className={labelClass}>{t('settings.tagsManagement.tagsInlineLabel')}</label>
              <div className="flex items-center gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      addTagChip(tagInput)
                    } else if (e.key === 'Backspace' && !tagInput && tagList.length > 0) {
                      removeTagChip(tagList[tagList.length - 1])
                    }
                  }}
                  maxLength={40}
                  placeholder={t('settings.tagsManagement.tagsInlinePlaceholder')}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => addTagChip(tagInput)}
                  disabled={!tagInput.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('settings.tagsManagement.tagsInlineAdd')}</span>
                </button>
              </div>
              {tagList.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tagList.map((tg) => (
                    <span
                      key={tg}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
                      style={{ borderColor: color, color, backgroundColor: `${color}1a` }}
                    >
                      {tg}
                      <button
                        type="button"
                        onClick={() => removeTagChip(tg)}
                        aria-label={t('settings.tagsManagement.tagsInlineRemove', { name: tg })}
                        className="opacity-70 transition-opacity hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.tagsManagement.tagsInlineHint')}</p>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
