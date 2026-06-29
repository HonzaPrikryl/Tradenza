'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { t } from '@/i18n'
import Select from '@/components/ui/Select'

const PAGE_SIZES = [10, 25, 50, 100]

export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
}) {
  const router = useRouter()
  const sp = useSearchParams()

  const go = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') p.delete(k)
      else p.set(k, v)
    }
    router.push(`?${p.toString()}`)
  }

  const btn =
    'text-xs px-3 py-1.5 border border-border rounded transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t('common.perPage')}</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => go({ size: v, page: '1' })}
          className="h-8 w-20 py-1"
          options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
        />
        <span className="ml-2">{t('trades.pagination', { page, pages: Math.max(totalPages, 1), total })}</span>
      </div>
      <div className="flex gap-2">
        <button className={btn} disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>
          {t('trades.prev')}
        </button>
        <button className={btn} disabled={page >= totalPages} onClick={() => go({ page: String(page + 1) })}>
          {t('trades.next')}
        </button>
      </div>
    </div>
  )
}
