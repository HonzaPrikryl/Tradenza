'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit, handleRateLimitBatch } from '@/components/ui/rate-limit-toast'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useSelection } from '@/hooks/useSelection'
import Select from '@/components/ui/Select'
import { UNGROUPED_ID } from '@/lib/tags-constants'
import { createTag, updateTag, deleteTag } from '@/lib/actions/tags'
import ActionMenu from '@/components/ui/ActionMenu'
import { Modal, inputClass, labelClass, type Category, type FlatTag } from './shared'

export default function TagsView({
  tags,
  categories,
  hasUngrouped,
  onChanged,
}: {
  tags: FlatTag[]
  categories: Category[]
  hasUngrouped: boolean
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const sel = useSelection()
  const [dialog, setDialog] = useState<{ mode: 'new' | 'edit'; tag?: FlatTag } | null>(null)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>(UNGROUPED_ID)
  const [saving, setSaving] = useState(false)

  const inheritedColor = (catId: string): string => {
    if (catId === UNGROUPED_ID) return '#64748b'
    return categories.find((c) => c.id === catId)?.color ?? '#6366f1'
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tags.filter((tg) => {
      if (filter !== 'all') {
        const fid = filter === UNGROUPED_ID ? null : filter
        if (tg.categoryId !== fid) return false
      }
      if (q && !tg.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [tags, filter, search])

  const rowIds = rows.map((r) => r.id)
  const allChecked = sel.allSelected(rowIds)
  const toggleAll = () => sel.toggleAll(rowIds)
  const toggle = (id: string) => sel.toggle(id)

  const filterOptions = [
    { value: 'all', label: t('settings.tagsManagement.allCategories') },
    ...categories.map((c) => ({ value: c.id, label: c.name, dot: c.color })),
    ...(hasUngrouped ? [{ value: UNGROUPED_ID, label: t('settings.tagsManagement.ungrouped') }] : []),
  ]
  const categoryOptions = [
    ...categories.map((c) => ({ value: c.id, label: c.name, dot: c.color })),
    { value: UNGROUPED_ID, label: t('settings.tagsManagement.ungrouped') },
  ]

  const openNew = () => {
    setName('')
    setCategoryId(filter !== 'all' && filter !== UNGROUPED_ID ? filter : (categories[0]?.id ?? UNGROUPED_ID))
    setDialog({ mode: 'new' })
  }
  const openEdit = (tg: FlatTag) => {
    setName(tg.name)
    setCategoryId(tg.categoryId ?? UNGROUPED_ID)
    setDialog({ mode: 'edit', tag: tg })
  }

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('settings.tagsManagement.toast.nameRequired'))
      return
    }
    setSaving(true)
    const groupId = categoryId === UNGROUPED_ID ? null : categoryId
    const color = inheritedColor(categoryId)
    try {
      const res =
        dialog?.mode === 'edit' && dialog.tag
          ? await updateTag(dialog.tag.id, { name: name.trim(), color })
          : await createTag({ name: name.trim(), color, groupId: groupId ?? undefined })
      if (handleRateLimit(res)) return
      toast.success(
        dialog?.mode === 'edit'
          ? t('settings.tagsManagement.toast.updated')
          : t('settings.tagsManagement.toast.created'),
      )
      setDialog(null)
      onChanged()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'settings.tagsManagement.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tg: FlatTag) => {
    const ok = await confirm({
      title: t('settings.tagsManagement.rowMenu.delete'),
      message: tRich('settings.tagsManagement.confirmDeleteTag', { name: tg.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      if (handleRateLimit(await deleteTag(tg.id))) return
      toast.success(t('settings.tagsManagement.toast.deleted'))
      onChanged()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'settings.tagsManagement.toast.deleteError'))
    }
  }

  const bulkDelete = async () => {
    const ok = await confirm({
      title: t('settings.tagsManagement.rowMenu.delete'),
      message: tRich('settings.tagsManagement.confirmBulkTags', { count: sel.size }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      if (handleRateLimitBatch(await Promise.all(sel.ids.map((id) => deleteTag(id))))) return
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
        <h2 className="text-base font-semibold tracking-tight">{t('settings.tagsManagement.tagsTitle')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.tagsManagement.tagsSubtitle')}</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{t('settings.tagsManagement.filterByCategory')}</span>
          <Select value={filter} onValueChange={setFilter} className="h-9 w-48" options={filterOptions} />
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
              placeholder={t('settings.tagsManagement.searchTags')}
              className="w-full sm:w-56 rounded-md border border-border bg-input/40 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <button
            onClick={openNew}
            className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 sm:px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('settings.tagsManagement.addTag')}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="w-12 px-5 py-3 text-left">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-primary" />
              </th>
              <th className="px-3 py-3 text-left font-medium">{t('settings.tagsManagement.col.tagName')}</th>
              <th className="px-3 py-3 text-left font-medium">{t('settings.tagsManagement.col.category')}</th>
              <th className="px-3 py-3 text-left font-medium">{t('settings.tagsManagement.col.used')}</th>
              <th className="w-12 px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((tg) => (
              <tr key={tg.id} className="border-b border-border/60 transition-colors hover:bg-accent/40 last:border-0">
                <td className="px-5 py-3">
                  <input
                    type="checkbox"
                    checked={sel.has(tg.id)}
                    onChange={() => toggle(tg.id)}
                    className="accent-primary"
                  />
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2 font-medium text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tg.categoryColor }} />
                    {tg.name}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tg.categoryColor }} />
                    {tg.categoryId === null ? t('settings.tagsManagement.ungrouped') : tg.categoryName}
                  </span>
                </td>
                <td className="px-3 py-3 tabular text-muted-foreground">{tg.used}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end">
                    <ActionMenu
                      width={168}
                      items={[
                        { key: 'edit', label: t('settings.tagsManagement.rowMenu.edit'), icon: Pencil },
                        {
                          key: 'delete',
                          label: t('settings.tagsManagement.rowMenu.delete'),
                          icon: Trash2,
                          danger: true,
                        },
                      ]}
                      onSelect={(k) => (k === 'edit' ? openEdit(tg) : remove(tg))}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            {t('settings.tagsManagement.emptyTags')}
          </div>
        )}
      </div>

      {dialog && (
        <Modal
          title={t(
            dialog.mode === 'edit' ? 'settings.tagsManagement.editTagTitle' : 'settings.tagsManagement.newTagTitle',
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
              placeholder={t('settings.tagsManagement.tagNamePlaceholder')}
              className={inputClass}
            />
          </div>
          {dialog.mode === 'new' && (
            <div>
              <label className={labelClass}>{t('settings.tagsManagement.categoryLabel')}</label>
              <Select value={categoryId} onValueChange={setCategoryId} options={categoryOptions} />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
