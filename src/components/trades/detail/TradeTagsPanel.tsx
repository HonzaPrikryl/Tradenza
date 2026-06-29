'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Check, Plus, X, Settings2, MoreHorizontal, Pencil, Trash2, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { t, tRich } from '@/i18n'
import { UNGROUPED_ID } from '@/lib/tags-constants'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useOutsideClick } from '@/hooks/useOutsideClick'
import SortableList, { type DragHandleProps } from '@/components/ui/SortableList'
import {
  setTradeTags,
  createTag,
  createTagGroup,
  updateTag,
  deleteTag,
  updateTagGroup,
  deleteTagGroup,
  reorderTagGroups,
  type TagGroupWithValues,
} from '@/lib/actions/tags'

const NEUTRAL_COLOR = '#64748b'

function GroupSelect({
  group,
  selected,
  onToggle,
  onCreated,
}: {
  group: TagGroupWithValues
  selected: string[]
  onToggle: (tagId: string) => void
  onCreated: () => void
}) {
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), { enabled: open })

  const chosen = group.values.filter((v) => selected.includes(v.id))
  const q = query.trim().toLowerCase()
  const filtered = q ? group.values.filter((v) => v.name.toLowerCase().includes(q)) : group.values
  const exact = group.values.some((v) => v.name.toLowerCase() === q)

  const handleCreate = async () => {
    const name = query.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const res = await createTag({ name, color: group.color, groupId: group.id })
      setQuery('')
      onCreated()
      if (res?.tag?.id) onToggle(res.tag.id)
    } catch {
      toast.error(t('trades.tagSelector.createFailed'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (v: { id: string; name: string }) => {
    setEditingId(v.id)
    setEditName(v.name)
  }
  const saveTag = async (v: { id: string; color: string }) => {
    const name = editName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      await updateTag(v.id, { name, color: v.color })
      setEditingId(null)
      onCreated()
    } catch {
      toast.error(t('trades.detail.tags.updateTagFailed'))
    } finally {
      setBusy(false)
    }
  }
  const removeTag = async (v: { id: string; name: string }) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: tRich('trades.detail.tags.confirmDeleteTag', { name: v.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await deleteTag(v.id)
      setEditingId(null)
      onCreated()
    } catch {
      toast.error(t('trades.detail.tags.deleteTagFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex min-h-[38px] w-full items-center gap-1.5 rounded-md border border-border bg-input/40 px-2.5 py-1.5 text-left text-sm transition-colors',
          open ? 'border-primary ring-1 ring-primary' : 'hover:border-border/80',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {chosen.length === 0 ? (
            <span className="text-muted-foreground">{t('trades.detail.tags.select')}</span>
          ) : (
            chosen.map((v) => (
              <span
                key={v.id}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                style={{ backgroundColor: `${v.color}26`, color: v.color }}
              >
                {v.name}
                <X
                  className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(v.id)
                  }}
                />
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-border bg-popover py-1 shadow-2xl">
          <div className="px-2 pb-1 pt-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !exact && handleCreate()}
              placeholder={t('trades.detail.tags.searchPlaceholder')}
              className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((v) => {
              const isSel = selected.includes(v.id)
              if (editingId === v.id) {
                return (
                  <div key={v.id} className="flex items-center gap-1 px-2 py-1">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveTag(v)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="min-w-0 flex-1 rounded-md border border-border bg-input/40 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveTag(v)}
                      aria-label={t('common.save')}
                      className="rounded-md p-1 text-primary transition-colors hover:bg-accent"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeTag(v)}
                      aria-label={t('common.delete')}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-loss/10 hover:text-loss"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      aria-label={t('common.cancel')}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              }
              return (
                <div key={v.id} className="group flex items-center pr-1.5 transition-colors hover:bg-accent">
                  <button
                    type="button"
                    onClick={() => onToggle(v.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-sm"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: v.color }} />
                    <span className="min-w-0 flex-1 truncate text-left">{v.name}</span>
                    {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      startEdit(v)
                    }}
                    aria-label={t('trades.detail.tags.editTag')}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            {filtered.length === 0 && !q && (
              <p className="px-3 py-2 text-xs text-muted-foreground">{t('trades.detail.tags.empty')}</p>
            )}
            {q && !exact && (
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-primary transition-colors hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('trades.detail.tags.create', { name: query.trim() })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryHeader({
  group,
  editable,
  onReload,
  dragHandleProps,
}: {
  group: TagGroupWithValues
  editable: boolean
  onReload: () => void
  dragHandleProps?: DragHandleProps
}) {
  const confirm = useConfirm()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [busy, setBusy] = useState(false)
  const ref = useOutsideClick<HTMLDivElement>(() => setMenuOpen(false), { enabled: menuOpen, escape: false })

  const save = async () => {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    try {
      await updateTagGroup(group.id, { name: n, color: group.color })
      setEditing(false)
      onReload()
    } catch {
      toast.error(t('trades.detail.tags.updateCategoryFailed'))
    } finally {
      setBusy(false)
    }
  }

  const changeColor = async (color: string) => {
    try {
      await updateTagGroup(group.id, { name: group.name, color })
      onReload()
    } catch {
      toast.error(t('trades.detail.tags.updateCategoryFailed'))
    }
  }

  const remove = async () => {
    setMenuOpen(false)
    const ok = await confirm({
      title: t('common.delete'),
      message: tRich('trades.detail.tags.confirmDeleteCategory', { name: group.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteTagGroup(group.id)
      onReload()
    } catch {
      toast.error(t('trades.detail.tags.deleteCategoryFailed'))
    }
  }

  if (editing) {
    return (
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setEditing(false)
              setName(group.name)
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-input/40 px-2 py-1 text-xs focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          disabled={busy}
          onClick={save}
          aria-label={t('common.save')}
          className="rounded-md p-1 text-primary transition-colors hover:bg-accent"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setName(group.name)
          }}
          aria-label={t('common.cancel')}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {editable && dragHandleProps && (
        <span
          {...dragHandleProps}
          aria-label={t('trades.detail.tags.reorder')}
          className="-ml-1 cursor-grab text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
      <span className="text-xs font-medium">{group.name}</span>
      {editable && (
        <div ref={ref} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('trades.detail.tags.categoryMenu')}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              menuOpen && 'bg-accent text-foreground',
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-40 mt-1 min-w-[140px] rounded-lg border border-border bg-popover py-1 shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setName(group.name)
                  setEditing(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground/90 transition-colors hover:bg-accent"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t('common.edit')}
              </button>
              <label className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-foreground/90 transition-colors hover:bg-accent">
                <span
                  className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ring-1 ring-border"
                  style={{ backgroundColor: group.color }}
                >
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(group.color) ? group.color : '#64748b'}
                    onChange={(e) => changeColor(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={t('trades.detail.tags.changeColor')}
                  />
                </span>
                {t('trades.detail.tags.changeColor')}
              </label>
              <button
                type="button"
                onClick={remove}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-loss transition-colors hover:bg-loss/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('common.delete')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TradeTagsPanel({
  tradeId,
  groups: initialGroups,
  selectedTagIds,
}: {
  tradeId: string
  groups: TagGroupWithValues[]
  selectedTagIds: string[]
}) {
  const [groups, setGroups] = useState(initialGroups)
  const [selected, setSelected] = useState<string[]>(selectedTagIds)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  const realGroups = groups.filter((g) => g.id !== UNGROUPED_ID)
  const ungroupedGroups = groups.filter((g) => g.id === UNGROUPED_ID)

  const applyOrder = async (orderedRealIds: string[]) => {
    const byId = new Map(realGroups.map((g) => [g.id, g]))
    const next = orderedRealIds.map((id) => byId.get(id)!).filter(Boolean)
    setGroups([...next, ...ungroupedGroups]) // optimistic
    try {
      await reorderTagGroups(orderedRealIds)
    } catch {
      toast.error(t('trades.detail.tags.reorderFailed'))
      reload()
    }
  }

  const reload = async () => {
    try {
      const { getTagGroups } = await import('@/lib/actions/tags')
      setGroups(await getTagGroups())
    } catch {
      /* noop */
    }
  }

  const toggle = async (tagId: string) => {
    const prev = selected
    const next = prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    setSelected(next) // optimistic
    try {
      await setTradeTags(tradeId, next)
    } catch {
      setSelected(prev)
      toast.error(t('trades.detail.tags.updateFailed'))
    }
  }

  const handleCreateGroup = async () => {
    const name = groupName.trim()
    if (!name || savingGroup) return
    setSavingGroup(true)
    try {
      await createTagGroup({ name, color: NEUTRAL_COLOR })
      setGroupName('')
      setCreatingGroup(false)
      await reload()
    } catch {
      toast.error(t('trades.tagSelector.createGroupFailed'))
    } finally {
      setSavingGroup(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="space-y-4">
        <SortableList
          items={realGroups}
          getId={(g) => g.id}
          onReorder={applyOrder}
          className="space-y-4"
          renderItem={(g, { handleProps }) => (
            <>
              <CategoryHeader group={g} editable onReload={reload} dragHandleProps={handleProps} />
              <GroupSelect group={g} selected={selected} onToggle={toggle} onCreated={reload} />
            </>
          )}
        />
        {ungroupedGroups.map((g) => (
          <div key={g.id}>
            <CategoryHeader group={g} editable={false} onReload={reload} />
            <GroupSelect group={g} selected={selected} onToggle={toggle} onCreated={reload} />
          </div>
        ))}
        {groups.length === 0 && <p className="text-xs text-muted-foreground">{t('trades.detail.tags.noGroups')}</p>}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        {creatingGroup ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateGroup()
                if (e.key === 'Escape') setCreatingGroup(false)
              }}
              placeholder={t('trades.detail.tags.categoryName')}
              className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              disabled={savingGroup}
              onClick={handleCreateGroup}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCreatingGroup(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('trades.detail.tags.addCategory')}
            </button>
            <Link
              href="/settings/tags"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t('settings.tagsManagement.manageTags')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
