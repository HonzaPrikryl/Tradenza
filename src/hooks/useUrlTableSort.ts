'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { parseUrlSort, useTableSort, type TableSortState } from '@/hooks/useTableSort'

interface UseUrlTableSortOptions {
  pathname: string
  storageKey: string
  defaultSortBy: string
  defaultSortOrder?: 'asc' | 'desc'
  validSortKeys: readonly string[]
}

/**
 * Server-paginated tables: URL drives fetched data; localStorage restores sort when
 * navigating via plain links (e.g. sidebar) that omit query params.
 */
export function useUrlTableSort({
  pathname,
  storageKey,
  defaultSortBy,
  defaultSortOrder = 'desc',
  validSortKeys,
}: UseUrlTableSortOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { sortBy, sortOrder, toggleSort, setSort } = useTableSort({
    storageKey,
    defaultSortBy,
    defaultSortOrder,
    validSortKeys,
  })

  const urlSortBy = searchParams.get('sortBy')
  const urlSortOrder = searchParams.get('sortOrder')
  const urlSort = useMemo(
    () => parseUrlSort(urlSortBy, urlSortOrder, validSortKeys),
    [urlSortBy, urlSortOrder, validSortKeys],
  )

  useEffect(() => {
    if (urlSort) {
      setSort(urlSort)
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    params.set('sortBy', sortBy)
    params.set('sortOrder', sortOrder)
    router.replace(`${pathname}?${params.toString()}`)
  }, [urlSort, sortBy, sortOrder, searchParams, router, pathname, setSort])

  const displaySortBy = urlSort?.sortBy ?? sortBy
  const displaySortOrder = urlSort?.sortOrder ?? sortOrder

  const handleSort = (column: string, extraParams?: Record<string, string>) => {
    const next = toggleSort(column)
    const params = new URLSearchParams(searchParams.toString())
    params.set('sortBy', next.sortBy)
    params.set('sortOrder', next.sortOrder)
    params.set('page', '1')
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      params.set(key, value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return {
    sortBy: displaySortBy,
    sortOrder: displaySortOrder,
    handleSort,
    setSort,
  }
}

export type { TableSortState }
