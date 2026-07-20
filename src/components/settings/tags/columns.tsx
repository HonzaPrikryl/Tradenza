import type { DataTableColumn } from '@/components/ui/DataTable'
import { t } from '@/i18n'
import type { Category, FlatTag } from './shared'

/** Tags without a category are grouped under a synthetic "Ungrouped" label. */
export const categoryLabel = (tg: FlatTag) =>
  tg.categoryId === null ? t('settings.tagsManagement.ungrouped') : tg.categoryName

export const categoryColumns: DataTableColumn<Category>[] = [
  {
    key: 'name',
    header: t('settings.tagsManagement.col.categoryName'),
    sortable: true,
    cellClassName: 'font-medium text-foreground',
    cell: (c) => c.name,
  },
  {
    key: 'color',
    header: t('settings.tagsManagement.col.color'),
    cell: (c) => <span className="inline-block h-5 w-5 rounded-full" style={{ backgroundColor: c.color }} />,
  },
]

export const tagColumns: DataTableColumn<FlatTag>[] = [
  {
    key: 'name',
    header: t('settings.tagsManagement.col.tagName'),
    sortable: true,
    cell: (tg) => (
      <span className="inline-flex items-center gap-2 font-medium text-foreground">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tg.categoryColor }} />
        {tg.name}
      </span>
    ),
  },
  {
    key: 'category',
    header: t('settings.tagsManagement.col.category'),
    sortable: true,
    cell: (tg) => (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tg.categoryColor }} />
        {categoryLabel(tg)}
      </span>
    ),
  },
  {
    key: 'used',
    header: t('settings.tagsManagement.col.used'),
    sortable: true,
    initialSortDir: 'desc',
    cellClassName: 'tabular text-muted-foreground',
    cell: (tg) => tg.used,
  },
]
