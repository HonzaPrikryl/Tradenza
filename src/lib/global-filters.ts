'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { DisplayUnit, GlobalFilters, FilterInput, TagIncludeGroup } from './global-filters-types'

const COOKIE = {
  accounts: 'tz_accounts',
  from: 'tz_from',
  to: 'tz_to',
  unit: 'tz_unit',
  sides: 'tz_sides',
  statuses: 'tz_statuses',
  outcomes: 'tz_outcomes',
  instruments: 'tz_instruments',
  symInc: 'tz_sym_inc',
  symExc: 'tz_sym_exc',
  ratings: 'tz_ratings',
  rMin: 'tz_rmin',
  rMax: 'tz_rmax',
  rNone: 'tz_rnone',
  dow: 'tz_dow',
  months: 'tz_months',
  durMin: 'tz_durmin',
  durMax: 'tz_durmax',
  entryT: 'tz_entry_t',
  exitT: 'tz_exit_t',
  tagsInc: 'tz_tags_inc',
  tagsExc: 'tz_tags_exc',
  tagsAll: 'tz_tags_all',
}

const GENERAL_COOKIES = [
  'tz_sides',
  'tz_statuses',
  'tz_outcomes',
  'tz_instruments',
  'tz_sym_inc',
  'tz_sym_exc',
  'tz_ratings',
  'tz_rmin',
  'tz_rmax',
  'tz_rnone',
  'tz_dow',
  'tz_months',
  'tz_durmin',
  'tz_durmax',
  'tz_entry_t',
  'tz_exit_t',
  'tz_tags_inc',
  'tz_tags_exc',
  'tz_tags_all',
]

function parseIds(raw?: string): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function readGlobalFilters(): Promise<GlobalFilters> {
  const c = await cookies()

  const accRaw = c.get(COOKIE.accounts)?.value
  let accountIds: string[] | null = null
  if (accRaw && accRaw !== 'all') {
    const parsed = parseIds(accRaw)
    if (parsed.length > 0) accountIds = parsed
  }

  const unit = (c.get(COOKIE.unit)?.value as DisplayUnit) === 'r' ? 'r' : 'dollar'

  const parseNums = (raw?: string): number[] => {
    if (!raw) return []
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.filter((x) => typeof x === 'number') : []
    } catch {
      return []
    }
  }

  const sides = parseIds(c.get(COOKIE.sides)?.value).filter((s): s is 'long' | 'short' => s === 'long' || s === 'short')
  const statuses = parseIds(c.get(COOKIE.statuses)?.value).filter(
    (s): s is 'open' | 'closed' => s === 'open' || s === 'closed',
  )
  const outcomes = parseIds(c.get(COOKIE.outcomes)?.value).filter(
    (o): o is 'win' | 'loss' | 'breakeven' => o === 'win' || o === 'loss' || o === 'breakeven',
  )
  const rMinRaw = c.get(COOKIE.rMin)?.value
  const rMaxRaw = c.get(COOKIE.rMax)?.value

  return {
    accountIds,
    dateFrom: c.get(COOKIE.from)?.value || undefined,
    dateTo: c.get(COOKIE.to)?.value || undefined,
    unit,
    sides,
    statuses,
    outcomes,
    instruments: parseIds(c.get(COOKIE.instruments)?.value),
    symbolsInclude: parseIds(c.get(COOKIE.symInc)?.value),
    symbolsExclude: parseIds(c.get(COOKIE.symExc)?.value),
    ratings: parseNums(c.get(COOKIE.ratings)?.value),
    rMin: rMinRaw !== undefined && rMinRaw !== '' && !Number.isNaN(Number(rMinRaw)) ? Number(rMinRaw) : undefined,
    rMax: rMaxRaw !== undefined && rMaxRaw !== '' && !Number.isNaN(Number(rMaxRaw)) ? Number(rMaxRaw) : undefined,
    rNone: c.get(COOKIE.rNone)?.value === '1',
    daysOfWeek: parseNums(c.get(COOKIE.dow)?.value),
    months: parseNums(c.get(COOKIE.months)?.value),
    durationMin: numOrUndef(c.get(COOKIE.durMin)?.value),
    durationMax: numOrUndef(c.get(COOKIE.durMax)?.value),
    entryTimeRanges: parseTimeRanges(c.get(COOKIE.entryT)?.value),
    exitTimeRanges: parseTimeRanges(c.get(COOKIE.exitT)?.value),
    tagInclude: parseTagInclude(c.get(COOKIE.tagsInc)?.value),
    excludeTags: parseIds(c.get(COOKIE.tagsExc)?.value),
  }
}

function numOrUndef(raw?: string): number | undefined {
  return raw !== undefined && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : undefined
}

function parseTimeRanges(raw?: string): { from: string; to: string }[] {
  if (!raw) return []
  try {
    const p = JSON.parse(raw)
    if (!Array.isArray(p)) return []
    return p
      .filter((r) => r && typeof r.from === 'string' && typeof r.to === 'string')
      .map((r) => ({ from: r.from, to: r.to }))
  } catch {
    return []
  }
}

function parseTagInclude(raw?: string): TagIncludeGroup[] {
  if (!raw) return []
  try {
    const p = JSON.parse(raw)
    if (!Array.isArray(p)) return []
    return p
      .filter((g) => g && typeof g.groupId === 'string' && Array.isArray(g.tagIds))
      .map((g) => ({
        groupId: g.groupId,
        matchAll: g.matchAll === true,
        tagIds: g.tagIds.filter((x: unknown) => typeof x === 'string'),
      }))
      .filter((g) => g.tagIds.length > 0)
  } catch {
    return []
  }
}

export async function readDateRange(): Promise<{ from?: Date; to?: Date }> {
  const { dateFrom, dateTo } = await readGlobalFilters()
  return {
    from: dateFrom ? new Date(dateFrom) : undefined,
    to: dateTo ? new Date(`${dateTo}T23:59:59.999`) : undefined,
  }
}

export async function setAccountsFilter(accountIds: string[] | null) {
  const c = await cookies()
  if (!accountIds || accountIds.length === 0) c.set(COOKIE.accounts, 'all', { path: '/' })
  else c.set(COOKIE.accounts, JSON.stringify(accountIds), { path: '/' })
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setDateRangeFilter(from?: string, to?: string) {
  const c = await cookies()
  if (from) c.set(COOKIE.from, from, { path: '/' })
  else c.delete(COOKIE.from)
  if (to) c.set(COOKIE.to, to, { path: '/' })
  else c.delete(COOKIE.to)
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setDisplayUnit(unit: DisplayUnit) {
  const c = await cookies()
  c.set(COOKIE.unit, unit, { path: '/' })
  revalidatePath('/', 'layout')
  return { success: true }
}

// Apply General + Tags filters from the panel at once.
export async function applyFilters(input: FilterInput) {
  const c = await cookies()
  const setArr = (name: string, arr: (string | number)[]) => {
    if (arr.length > 0) c.set(name, JSON.stringify(arr), { path: '/' })
    else c.delete(name)
  }
  const setNum = (name: string, value?: number | null) => {
    if (value !== undefined && value !== null && !Number.isNaN(value)) c.set(name, String(value), { path: '/' })
    else c.delete(name)
  }

  setArr(COOKIE.sides, input.sides)
  setArr(COOKIE.statuses, input.statuses)
  setArr(COOKIE.outcomes, input.outcomes)
  setArr(COOKIE.instruments, input.instruments)
  setArr(COOKIE.symInc, input.symbolsInclude)
  setArr(COOKIE.symExc, input.symbolsExclude)
  setArr(COOKIE.ratings, input.ratings)
  setNum(COOKIE.rMin, input.rMin)
  setNum(COOKIE.rMax, input.rMax)
  if (input.rNone) c.set(COOKIE.rNone, '1', { path: '/' })
  else c.delete(COOKIE.rNone)

  setArr(COOKIE.dow, input.daysOfWeek)
  setArr(COOKIE.months, input.months)
  setNum(COOKIE.durMin, input.durationMin)
  setNum(COOKIE.durMax, input.durationMax)
  if (input.entryTimeRanges.length > 0) c.set(COOKIE.entryT, JSON.stringify(input.entryTimeRanges), { path: '/' })
  else c.delete(COOKIE.entryT)
  if (input.exitTimeRanges.length > 0) c.set(COOKIE.exitT, JSON.stringify(input.exitTimeRanges), { path: '/' })
  else c.delete(COOKIE.exitT)

  if (input.tagInclude.length > 0) c.set(COOKIE.tagsInc, JSON.stringify(input.tagInclude), { path: '/' })
  else c.delete(COOKIE.tagsInc)
  setArr(COOKIE.tagsExc, input.excludeTags)

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function resetFilters() {
  const c = await cookies()
  GENERAL_COOKIES.forEach((name) => c.delete(name))
  revalidatePath('/', 'layout')
  return { success: true }
}
