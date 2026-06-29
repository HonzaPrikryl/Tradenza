'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { UNGROUPED_ID } from '@/lib/tags-constants'
import { type TagGroupWithValues } from '@/lib/actions/tags'
import CategoriesView from './tags/CategoriesView'
import TagsView from './tags/TagsView'
import { type Tab, type Category, type FlatTag } from './tags/shared'

export default function TagsManagementClient({ groups }: { groups: TagGroupWithValues[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('categories')

  const categories: Category[] = useMemo(
    () =>
      groups
        .filter((g) => g.id !== UNGROUPED_ID)
        .map((g) => ({ id: g.id, name: g.name, color: g.color, count: g.values.length })),
    [groups],
  )
  const allTags: FlatTag[] = useMemo(
    () =>
      groups.flatMap((g) =>
        g.values.map((v) => ({
          id: v.id,
          name: v.name,
          color: v.color,
          used: v.tradeCount,
          categoryId: g.id === UNGROUPED_ID ? null : g.id,
          categoryName: g.name,
          categoryColor: g.color,
        })),
      ),
    [groups],
  )
  const hasUngrouped = groups.some((g) => g.id === UNGROUPED_ID)

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {(['categories', 'tags'] as Tab[]).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              'rounded-md px-5 py-2 text-sm font-medium transition-colors',
              tab === tb ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(tb === 'categories' ? 'settings.tagsManagement.categoriesTab' : 'settings.tagsManagement.tagsTab')}
          </button>
        ))}
      </div>

      {tab === 'categories' ? (
        <CategoriesView categories={categories} onChanged={() => router.refresh()} />
      ) : (
        <TagsView
          tags={allTags}
          categories={categories}
          hasUngrouped={hasUngrouped}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  )
}
