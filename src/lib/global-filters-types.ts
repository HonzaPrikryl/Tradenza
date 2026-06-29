export type DisplayUnit = 'dollar' | 'r'
export type Outcome = 'win' | 'loss' | 'breakeven'

export interface TagIncludeGroup {
  groupId: string
  matchAll: boolean
  tagIds: string[]
}

export interface TimeRange {
  from: string // "HH:mm"
  to: string // "HH:mm"
}

export interface GlobalFilters {
  accountIds: string[] | null
  dateFrom?: string // yyyy-MM-dd
  dateTo?: string // yyyy-MM-dd
  unit: DisplayUnit
  sides: ('long' | 'short')[]
  statuses: ('open' | 'closed')[]
  outcomes: Outcome[]
  instruments: string[]
  symbolsInclude: string[]
  symbolsExclude: string[]
  ratings: number[] // 0.5 – 5 in 0.5 steps
  rMin?: number
  rMax?: number
  rNone: boolean // include trades without an R-multiple
  // Day & Time
  daysOfWeek: number[]
  months: number[] // 1–12, by entry date
  durationMin?: number // minutes
  durationMax?: number
  entryTimeRanges: TimeRange[]
  exitTimeRanges: TimeRange[]
  tagInclude: TagIncludeGroup[]
  excludeTags: string[]
}

export interface FilterInput {
  sides: string[]
  statuses: string[]
  outcomes: string[]
  instruments: string[]
  symbolsInclude: string[]
  symbolsExclude: string[]
  ratings: number[]
  rMin?: number | null
  rMax?: number | null
  rNone: boolean
  daysOfWeek: number[]
  months: number[]
  durationMin?: number | null
  durationMax?: number | null
  entryTimeRanges: TimeRange[]
  exitTimeRanges: TimeRange[]
  tagInclude: TagIncludeGroup[]
  excludeTags: string[]
}
