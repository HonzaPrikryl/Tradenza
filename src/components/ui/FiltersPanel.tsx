'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Tag as TagIcon, CalendarClock, BookMarked, Check, X } from 'lucide-react'
import { applyFilters, resetFilters } from '@/lib/global-filters'
import type { GlobalFilters, TimeRange } from '@/lib/global-filters-types'
import type { TagGroupWithValues } from '@/lib/actions/tags'
import MultiSelect from './MultiSelect'
import { Box, TimeRangeRow } from './filters/FilterControls'
import { cn } from '@/lib/utils'
import { t, tList } from '@/i18n'

interface StrategyOpt {
  id: string
  name: string
  color: string
}

const WEEKDAYS = tList('datepicker.weekdays')
const WEEKDAYS_SHORT = tList('datepicker.weekdaysShort')
const MONTHS = tList('datepicker.months')
const MONTHS_SHORT = tList('datepicker.monthsShort')

interface Props {
  tagGroups: TagGroupWithValues[]
  filters: GlobalFilters
  symbols: string[]
  strategies: StrategyOpt[]
  onClose: () => void
}

type Cat = 'general' | 'tags' | 'dayTime' | 'strategy' | 'insights'

const inputClass =
  'w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground'

const RATING_VALUES = ['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5']

interface Badge {
  key: string
  label: string
  tone: 'primary' | 'loss'
  dot?: string
  clear: () => void
}

export default function FiltersPanel({ tagGroups, filters, symbols, strategies, onClose }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [cat, setCat] = useState<Cat>('general')

  const [sides, setSides] = useState<string[]>(filters.sides)
  const [statuses, setStatuses] = useState<string[]>(filters.statuses)
  const [outcomes, setOutcomes] = useState<string[]>(filters.outcomes)
  const [instruments, setInstruments] = useState<string[]>(filters.instruments)
  const [symInc, setSymInc] = useState<string[]>(filters.symbolsInclude)
  const [symExc, setSymExc] = useState<string[]>(filters.symbolsExclude)
  const [stratInc, setStratInc] = useState<string[]>(filters.strategiesInclude)
  const [stratExc, setStratExc] = useState<string[]>(filters.strategiesExclude)
  const [stratExpanded, setStratExpanded] = useState(
    filters.strategiesInclude.length > 0 || filters.strategiesExclude.length > 0,
  )
  const [ratings, setRatings] = useState<string[]>(filters.ratings.map(String))
  const [rMin, setRMin] = useState(filters.rMin !== undefined ? String(filters.rMin) : '')
  const [rMax, setRMax] = useState(filters.rMax !== undefined ? String(filters.rMax) : '')
  const [rNone, setRNone] = useState(filters.rNone)

  // Day & Time draft
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(filters.daysOfWeek.map(String))
  const [months, setMonths] = useState<string[]>(filters.months.map(String))
  const [durMin, setDurMin] = useState(filters.durationMin != null ? String(filters.durationMin) : '')
  const [durMax, setDurMax] = useState(filters.durationMax != null ? String(filters.durationMax) : '')
  const [entryRanges, setEntryRanges] = useState<TimeRange[]>(filters.entryTimeRanges)
  const [exitRanges, setExitRanges] = useState<TimeRange[]>(filters.exitTimeRanges)
  const [dtExpanded, setDtExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>()
    if (filters.daysOfWeek.length) s.add('dow')
    if (filters.months.length) s.add('month')
    if (filters.durationMin != null || filters.durationMax != null) s.add('duration')
    if (filters.entryTimeRanges.length) s.add('entry')
    if (filters.exitTimeRanges.length) s.add('exit')
    return s
  })

  const [includeTags, setIncludeTags] = useState<string[]>(filters.tagInclude.flatMap((g) => g.tagIds))
  const [excludeTags, setExcludeTags] = useState<string[]>(filters.excludeTags)
  const [matchAllGroups, setMatchAllGroups] = useState<Set<string>>(
    () => new Set(filters.tagInclude.filter((g) => g.matchAll).map((g) => g.groupId)),
  )
  const [tagExpanded, setTagExpanded] = useState<Set<string>>(
    () =>
      new Set(
        tagGroups
          .filter(
            (g) =>
              g.values.some((v) => filters.tagInclude.some((ti) => ti.tagIds.includes(v.id))) ||
              g.values.some((v) => filters.excludeTags.includes(v.id)),
          )
          .map((g) => g.id),
      ),
  )

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>()
    if (filters.instruments.length) s.add('instrument')
    if (filters.statuses.length) s.add('status')
    if (filters.sides.length) s.add('side')
    if (filters.symbolsInclude.length || filters.symbolsExclude.length) s.add('symbol')
    if (filters.outcomes.length) s.add('outcome')
    if (filters.ratings.length) s.add('rating')
    if (filters.rMin !== undefined || filters.rMax !== undefined || filters.rNone) s.add('r')
    return s
  })

  const setIncOnly = (next: string[]) => {
    setSymInc(next)
    setSymExc((prev) => prev.filter((s) => !next.includes(s)))
  }
  const setExcOnly = (next: string[]) => {
    setSymExc(next)
    setSymInc((prev) => prev.filter((s) => !next.includes(s)))
  }

  const setStratIncOnly = (next: string[]) => {
    setStratInc(next)
    setStratExc((prev) => prev.filter((s) => !next.includes(s)))
  }
  const setStratExcOnly = (next: string[]) => {
    setStratExc(next)
    setStratInc((prev) => prev.filter((s) => !next.includes(s)))
  }

  // Tags helpers
  const groupSelected = (g: TagGroupWithValues, arr: string[]) =>
    g.values.filter((v) => arr.includes(v.id)).map((v) => v.id)
  const setInclude = (g: TagGroupWithValues, selected: string[]) => {
    const gv = g.values.map((v) => v.id)
    setIncludeTags([...includeTags.filter((id) => !gv.includes(id)), ...selected])
    setExcludeTags(excludeTags.filter((id) => !selected.includes(id)))
  }
  const setExclude = (g: TagGroupWithValues, selected: string[]) => {
    const gv = g.values.map((v) => v.id)
    setExcludeTags([...excludeTags.filter((id) => !gv.includes(id)), ...selected])
    setIncludeTags(includeTags.filter((id) => !selected.includes(id)))
  }

  const apply = () =>
    start(async () => {
      await applyFilters({
        sides,
        statuses,
        outcomes,
        instruments,
        symbolsInclude: symInc,
        symbolsExclude: symExc,
        strategiesInclude: stratInc,
        strategiesExclude: stratExc,
        ratings: ratings.map(Number),
        rMin: rMin.trim() !== '' ? Number(rMin) : null,
        rMax: rMax.trim() !== '' ? Number(rMax) : null,
        rNone,
        daysOfWeek: daysOfWeek.map(Number),
        months: months.map(Number),
        durationMin: durMin.trim() !== '' ? Number(durMin) : null,
        durationMax: durMax.trim() !== '' ? Number(durMax) : null,
        entryTimeRanges: entryRanges.filter((r) => r.from && r.to),
        exitTimeRanges: exitRanges.filter((r) => r.from && r.to),
        tagInclude: tagGroups
          .map((g) => ({
            groupId: g.id,
            matchAll: matchAllGroups.has(g.id),
            tagIds: g.values.filter((v) => includeTags.includes(v.id)).map((v) => v.id),
          }))
          .filter((g) => g.tagIds.length > 0),
        excludeTags,
      })
      router.refresh()
      onClose()
    })

  const reset = () =>
    start(async () => {
      setSides([])
      setStatuses([])
      setOutcomes([])
      setInstruments([])
      setSymInc([])
      setSymExc([])
      setStratInc([])
      setStratExc([])
      setStratExpanded(false)
      setRatings([])
      setRMin('')
      setRMax('')
      setRNone(false)
      setDaysOfWeek([])
      setMonths([])
      setDurMin('')
      setDurMax('')
      setEntryRanges([])
      setExitRanges([])
      setDtExpanded(new Set())
      setExpanded(new Set())
      setIncludeTags([])
      setExcludeTags([])
      setMatchAllGroups(new Set())
      setTagExpanded(new Set())
      await resetFilters()
      router.refresh()
      onClose()
    })

  const rows: { key: string; label: string; hasValue: boolean; clear: () => void; control: React.ReactNode }[] = [
    {
      key: 'instrument',
      label: t('filters.general.instrument'),
      hasValue: instruments.length > 0,
      clear: () => setInstruments([]),
      control: (
        <MultiSelect
          value={instruments}
          onChange={setInstruments}
          placeholder={t('filters.general.instrument')}
          options={[
            { value: 'futures', label: t('enums.asset.futures') },
            { value: 'stocks', label: t('enums.asset.stocks') },
            { value: 'forex', label: t('enums.asset.forex') },
            { value: 'crypto', label: t('enums.asset.crypto') },
            { value: 'options', label: t('enums.asset.options') },
            { value: 'other', label: t('enums.asset.other') },
          ]}
        />
      ),
    },
    {
      key: 'status',
      label: t('filters.general.openClosed'),
      hasValue: statuses.length > 0,
      clear: () => setStatuses([]),
      control: (
        <MultiSelect
          value={statuses}
          onChange={setStatuses}
          placeholder={t('filters.general.openClosed')}
          options={[
            { value: 'closed', label: t('enums.status.closed') },
            { value: 'open', label: t('enums.status.open') },
          ]}
        />
      ),
    },
    {
      key: 'side',
      label: t('filters.general.side'),
      hasValue: sides.length > 0,
      clear: () => setSides([]),
      control: (
        <MultiSelect
          value={sides}
          onChange={setSides}
          placeholder={t('filters.general.side')}
          options={[
            { value: 'long', label: t('enums.direction.long') },
            { value: 'short', label: t('enums.direction.short') },
          ]}
        />
      ),
    },
    {
      key: 'symbol',
      label: t('filters.general.symbol'),
      hasValue: symInc.length > 0 || symExc.length > 0,
      clear: () => {
        setSymInc([])
        setSymExc([])
      },
      control: (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="mb-1 block text-[11px] text-primary">{t('filters.general.include')}</span>
            <MultiSelect
              options={symbols.map((s) => ({ value: s, label: s }))}
              value={symInc}
              disabledIds={symExc}
              onChange={setIncOnly}
            />
          </div>
          <div>
            <span className="mb-1 block text-[11px] text-loss">{t('filters.general.exclude')}</span>
            <MultiSelect
              options={symbols.map((s) => ({ value: s, label: s }))}
              value={symExc}
              disabledIds={symInc}
              onChange={setExcOnly}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'outcome',
      label: t('filters.general.status'),
      hasValue: outcomes.length > 0,
      clear: () => setOutcomes([]),
      control: (
        <MultiSelect
          value={outcomes}
          onChange={setOutcomes}
          placeholder={t('filters.general.status')}
          options={[
            { value: 'breakeven', label: t('filters.general.breakeven') },
            { value: 'loss', label: t('filters.general.loss') },
            { value: 'win', label: t('filters.general.win') },
          ]}
        />
      ),
    },
    {
      key: 'rating',
      label: t('filters.general.rating'),
      hasValue: ratings.length > 0,
      clear: () => setRatings([]),
      control: (
        <MultiSelect
          value={ratings}
          onChange={setRatings}
          placeholder={t('filters.general.rating')}
          options={RATING_VALUES.map((v) => ({ value: v, label: `★ ${v}` }))}
        />
      ),
    },
    {
      key: 'r',
      label: t('filters.general.rMultiple'),
      hasValue: rMin.trim() !== '' || rMax.trim() !== '' || rNone,
      clear: () => {
        setRMin('')
        setRMax('')
        setRNone(false)
      },
      control: (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="any"
              value={rMin}
              onChange={(e) => setRMin(e.target.value)}
              placeholder={t('filters.general.min')}
              className={inputClass}
            />
            <input
              type="number"
              step="any"
              value={rMax}
              onChange={(e) => setRMax(e.target.value)}
              placeholder={t('filters.general.max')}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={() => setRNone((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                rNone ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                  rNone && 'translate-x-4',
                )}
              />
            </span>
            {t('filters.general.none')}
          </button>
        </div>
      ),
    },
  ]

  const generalBadges: Badge[] = [
    ...instruments.map((i) => ({
      key: `i:${i}`,
      label: t(`enums.asset.${i}`),
      tone: 'primary' as const,
      clear: () => setInstruments(instruments.filter((x) => x !== i)),
    })),
    ...statuses.map((s) => ({
      key: `st:${s}`,
      label: t(`enums.status.${s}`),
      tone: 'primary' as const,
      clear: () => setStatuses(statuses.filter((x) => x !== s)),
    })),
    ...sides.map((s) => ({
      key: `sd:${s}`,
      label: t(`enums.direction.${s}`),
      tone: 'primary' as const,
      clear: () => setSides(sides.filter((x) => x !== s)),
    })),
    ...symInc.map((s) => ({
      key: `si:${s}`,
      label: s,
      tone: 'primary' as const,
      clear: () => setSymInc(symInc.filter((x) => x !== s)),
    })),
    ...symExc.map((s) => ({
      key: `se:${s}`,
      label: s,
      tone: 'loss' as const,
      clear: () => setSymExc(symExc.filter((x) => x !== s)),
    })),
    ...outcomes.map((o) => ({
      key: `o:${o}`,
      label: t(`filters.general.${o}`),
      tone: 'primary' as const,
      clear: () => setOutcomes(outcomes.filter((x) => x !== o)),
    })),
    ...ratings.map((r) => ({
      key: `r:${r}`,
      label: `★ ${r}`,
      tone: 'primary' as const,
      clear: () => setRatings(ratings.filter((x) => x !== r)),
    })),
  ]
  if (rMin.trim() !== '' || rMax.trim() !== '' || rNone) {
    const label =
      rNone && rMin.trim() === '' && rMax.trim() === ''
        ? `R: ${t('filters.general.none')}`
        : `R ${rMin || '−∞'}…${rMax || '∞'}`
    generalBadges.push({
      key: 'r',
      label,
      tone: 'primary',
      clear: () => {
        setRMin('')
        setRMax('')
        setRNone(false)
      },
    })
  }

  const tagInfo = (id: string) => {
    for (const g of tagGroups) {
      const v = g.values.find((x) => x.id === id)
      if (v) return v
    }
    return null
  }
  const removeTag = (id: string) => {
    setIncludeTags((prev) => prev.filter((x) => x !== id))
    setExcludeTags((prev) => prev.filter((x) => x !== id))
  }
  const tagBadges: Badge[] = [
    ...includeTags.map((id) => ({ id, mode: 'inc' as const })),
    ...excludeTags.map((id) => ({ id, mode: 'exc' as const })),
  ]
    .map(({ id, mode }): Badge | null => {
      const info = tagInfo(id)
      if (!info) return null
      return {
        key: id,
        label: info.name,
        tone: mode === 'exc' ? 'loss' : 'primary',
        dot: info.color,
        clear: () => removeTag(id),
      }
    })
    .filter((b): b is Badge => b !== null)

  const strategyName = (id: string) => strategies.find((s) => s.id === id)
  const strategyBadges: Badge[] = [
    ...stratInc.map((id) => ({ id, mode: 'inc' as const })),
    ...stratExc.map((id) => ({ id, mode: 'exc' as const })),
  ]
    .map(({ id, mode }): Badge | null => {
      const s = strategyName(id)
      if (!s) return null
      return {
        key: id,
        label: s.name,
        tone: mode === 'exc' ? 'loss' : 'primary',
        dot: s.color,
        clear: () => {
          setStratInc((prev) => prev.filter((x) => x !== id))
          setStratExc((prev) => prev.filter((x) => x !== id))
        },
      }
    })
    .filter((b): b is Badge => b !== null)

  const dtBadges: Badge[] = [
    ...daysOfWeek.map((d) => ({
      key: `d:${d}`,
      label: WEEKDAYS_SHORT[Number(d)],
      tone: 'primary' as const,
      clear: () => setDaysOfWeek(daysOfWeek.filter((x) => x !== d)),
    })),
    ...months.map((m) => ({
      key: `m:${m}`,
      label: MONTHS_SHORT[Number(m) - 1],
      tone: 'primary' as const,
      clear: () => setMonths(months.filter((x) => x !== m)),
    })),
  ]
  if (durMin.trim() !== '' || durMax.trim() !== '') {
    dtBadges.push({
      key: 'dur',
      label: `${durMin || '0'}–${durMax || '∞'}m`,
      tone: 'primary',
      clear: () => {
        setDurMin('')
        setDurMax('')
      },
    })
  }
  entryRanges.forEach((r, i) => {
    if (r.from && r.to)
      dtBadges.push({
        key: `et:${i}`,
        label: `↦ ${r.from}–${r.to}`,
        tone: 'primary',
        clear: () => setEntryRanges(entryRanges.filter((_, j) => j !== i)),
      })
  })
  exitRanges.forEach((r, i) => {
    if (r.from && r.to)
      dtBadges.push({
        key: `xt:${i}`,
        label: `↤ ${r.from}–${r.to}`,
        tone: 'primary',
        clear: () => setExitRanges(exitRanges.filter((_, j) => j !== i)),
      })
  })

  const toggleRow = (key: string, hasValue: boolean, clear: () => void) => {
    if (expanded.has(key) || hasValue) {
      clear()
      setExpanded((p) => {
        const n = new Set(p)
        n.delete(key)
        return n
      })
    } else {
      setExpanded((p) => new Set(p).add(key))
    }
  }

  const toggleDt = (key: string, hasValue: boolean, clear: () => void, onExpand?: () => void) => {
    if (dtExpanded.has(key) || hasValue) {
      clear()
      setDtExpanded((p) => {
        const n = new Set(p)
        n.delete(key)
        return n
      })
    } else {
      setDtExpanded((p) => new Set(p).add(key))
      onExpand?.()
    }
  }

  const cats: { key: Cat; label: string; icon: typeof Users; enabled: boolean }[] = [
    { key: 'general', label: t('filters.categories.general'), icon: Users, enabled: true },
    { key: 'tags', label: t('filters.categories.tags'), icon: TagIcon, enabled: true },
    { key: 'strategy', label: t('filters.categories.strategy'), icon: BookMarked, enabled: true },
    { key: 'dayTime', label: t('filters.categories.dayTime'), icon: CalendarClock, enabled: true },
  ]

  return (
    <div className="flex w-full lg:w-[600px] lg:max-w-[88vw] flex-col">
      <div className="flex flex-col sm:flex-row min-h-[300px]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 sm:w-52 sm:shrink-0 sm:flex-col sm:gap-0 sm:space-y-2 sm:overflow-visible sm:pb-0 sm:pr-3">
          {cats.map((c) => {
            const badges =
              c.key === 'general'
                ? generalBadges
                : c.key === 'tags'
                  ? tagBadges
                  : c.key === 'strategy'
                    ? strategyBadges
                    : c.key === 'dayTime'
                      ? dtBadges
                      : []
            return (
              <div
                key={c.key}
                className={cn(
                  'overflow-hidden rounded-md border transition-colors shrink-0 sm:w-full',
                  cat === c.key ? 'border-primary/40' : 'border-border',
                )}
              >
                <button
                  disabled={!c.enabled}
                  onClick={() => setCat(c.key)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-2 text-sm transition-colors',
                    cat === c.key ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent',
                    !c.enabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                  )}
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  {c.label}
                </button>
                {badges.length > 0 && (
                  <div className="hidden sm:flex flex-wrap gap-1 border-t border-border px-2 py-1.5">
                    {badges.slice(0, 3).map((b) => (
                      <span
                        key={b.key}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]',
                          b.tone === 'loss' ? 'bg-loss/15 text-loss' : 'bg-primary/15 text-primary',
                        )}
                      >
                        {b.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.dot }} />}
                        {b.label}
                        <X
                          className="h-2.5 w-2.5 cursor-pointer opacity-70 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            b.clear()
                          }}
                        />
                      </span>
                    ))}
                    {badges.length > 3 && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        +{badges.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 max-h-[60vh] overflow-y-auto pl-0 sm:pl-4">
          {cat === 'general' && (
            <div className="space-y-0.5">
              {rows.map((d) => {
                const on = expanded.has(d.key) || d.hasValue
                return (
                  <div key={d.key} className="rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleRow(d.key, d.hasValue, d.clear)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <Box checked={on} />
                      <span className={cn(on && 'font-medium')}>{d.label}</span>
                    </button>
                    {on && <div className="mb-2 mt-1 pl-6">{d.control}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {cat === 'tags' && (
            <div className="space-y-0.5">
              {tagGroups.length === 0 && <p className="text-sm text-muted-foreground">{t('filters.tags.noTags')}</p>}
              {tagGroups.map((g) => {
                const options = g.values.map((v) => ({ value: v.id, label: v.name, dot: v.color }))
                const inc = groupSelected(g, includeTags)
                const exc = groupSelected(g, excludeTags)
                const hasValue = inc.length > 0 || exc.length > 0
                const on = tagExpanded.has(g.id) || hasValue
                const matchAll = matchAllGroups.has(g.id)
                return (
                  <div key={g.id} className="rounded-md">
                    <button
                      type="button"
                      onClick={() => {
                        if (on) {
                          const gv = g.values.map((v) => v.id)
                          setIncludeTags((prev) => prev.filter((id) => !gv.includes(id)))
                          setExcludeTags((prev) => prev.filter((id) => !gv.includes(id)))
                          setMatchAllGroups((p) => {
                            const n = new Set(p)
                            n.delete(g.id)
                            return n
                          })
                          setTagExpanded((p) => {
                            const n = new Set(p)
                            n.delete(g.id)
                            return n
                          })
                        } else {
                          setTagExpanded((p) => new Set(p).add(g.id))
                        }
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <Box checked={on} />
                      <span className="font-medium" style={{ color: g.color }}>
                        {g.name}
                      </span>
                    </button>
                    {on && (
                      <div className="mb-2 mt-1 space-y-2 pl-6">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="mb-1 block text-[11px] text-primary">{t('filters.tags.modeInclude')}</span>
                            <MultiSelect
                              options={options}
                              value={inc}
                              disabledIds={exc}
                              onChange={(ids) => setInclude(g, ids)}
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[11px] text-loss">{t('filters.tags.modeExclude')}</span>
                            <MultiSelect
                              options={options}
                              value={exc}
                              disabledIds={inc}
                              onChange={(ids) => setExclude(g, ids)}
                            />
                          </div>
                        </div>
                        {inc.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setMatchAllGroups((p) => {
                                const n = new Set(p)
                                if (n.has(g.id)) n.delete(g.id)
                                else n.add(g.id)
                                return n
                              })
                            }
                            className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <span
                              className={cn(
                                'relative h-4 w-8 shrink-0 rounded-full transition-colors',
                                matchAll ? 'bg-primary' : 'bg-muted',
                              )}
                            >
                              <span
                                className={cn(
                                  'absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
                                  matchAll && 'translate-x-4',
                                )}
                              />
                            </span>
                            {t('filters.tags.matchAll')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {cat === 'strategy' && (
            <div className="space-y-0.5">
              {strategies.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('filters.strategy.none')}</p>
              ) : (
                (() => {
                  const hasValue = stratInc.length > 0 || stratExc.length > 0
                  const on = stratExpanded || hasValue
                  const options = strategies.map((s) => ({ value: s.id, label: s.name, dot: s.color }))
                  return (
                    <div className="rounded-md">
                      <button
                        type="button"
                        onClick={() => {
                          if (on) {
                            setStratInc([])
                            setStratExc([])
                            setStratExpanded(false)
                          } else {
                            setStratExpanded(true)
                          }
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent"
                      >
                        <Box checked={on} />
                        <span className={cn(on && 'font-medium')}>{t('filters.strategy.label')}</span>
                      </button>
                      {on && (
                        <div className="mb-2 mt-1 grid grid-cols-2 gap-2 pl-6">
                          <div>
                            <span className="mb-1 block text-[11px] text-primary">{t('filters.strategy.include')}</span>
                            <MultiSelect
                              options={options}
                              value={stratInc}
                              disabledIds={stratExc}
                              onChange={setStratIncOnly}
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[11px] text-loss">{t('filters.strategy.exclude')}</span>
                            <MultiSelect
                              options={options}
                              value={stratExc}
                              disabledIds={stratInc}
                              onChange={setStratExcOnly}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()
              )}
            </div>
          )}

          {cat === 'dayTime' && (
            <div className="space-y-0.5">
              {/* Day of week */}
              {(() => {
                const on = dtExpanded.has('dow') || daysOfWeek.length > 0
                return (
                  <div className="rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleDt('dow', daysOfWeek.length > 0, () => setDaysOfWeek([]))}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <Box checked={on} />
                      <span className={cn(on && 'font-medium')}>{t('filters.dayTime.dayOfWeek')}</span>
                    </button>
                    {on && (
                      <div className="mb-2 mt-1 pl-6">
                        <MultiSelect
                          value={daysOfWeek}
                          onChange={setDaysOfWeek}
                          placeholder={t('filters.dayTime.dayOfWeek')}
                          options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
                        />
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Month */}
              {(() => {
                const on = dtExpanded.has('month') || months.length > 0
                return (
                  <div className="rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleDt('month', months.length > 0, () => setMonths([]))}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <Box checked={on} />
                      <span className={cn(on && 'font-medium')}>{t('filters.dayTime.month')}</span>
                    </button>
                    {on && (
                      <div className="mb-2 mt-1 pl-6">
                        <MultiSelect
                          value={months}
                          onChange={setMonths}
                          placeholder={t('filters.dayTime.month')}
                          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                        />
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Duration */}
              {(() => {
                const has = durMin.trim() !== '' || durMax.trim() !== ''
                const on = dtExpanded.has('duration') || has
                return (
                  <div className="rounded-md">
                    <button
                      type="button"
                      onClick={() =>
                        toggleDt('duration', has, () => {
                          setDurMin('')
                          setDurMax('')
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <Box checked={on} />
                      <span className={cn(on && 'font-medium')}>{t('filters.dayTime.duration')}</span>
                    </button>
                    {on && (
                      <div className="mb-2 mt-1 grid grid-cols-2 gap-2 pl-6">
                        <input
                          type="number"
                          min={0}
                          value={durMin}
                          onChange={(e) => setDurMin(e.target.value)}
                          placeholder={t('filters.dayTime.min')}
                          className={inputClass}
                        />
                        <input
                          type="number"
                          min={0}
                          value={durMax}
                          onChange={(e) => setDurMax(e.target.value)}
                          placeholder={t('filters.dayTime.max')}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Entry time */}
              <TimeRangeRow
                label={t('filters.dayTime.entryTime')}
                expanded={dtExpanded.has('entry') || entryRanges.length > 0}
                ranges={entryRanges}
                onToggle={() =>
                  toggleDt(
                    'entry',
                    entryRanges.length > 0,
                    () => setEntryRanges([]),
                    () => {
                      if (entryRanges.length === 0) setEntryRanges([{ from: '', to: '' }])
                    },
                  )
                }
                onChange={setEntryRanges}
              />

              {/* Exit time */}
              <TimeRangeRow
                label={t('filters.dayTime.exitTime')}
                expanded={dtExpanded.has('exit') || exitRanges.length > 0}
                ranges={exitRanges}
                onToggle={() =>
                  toggleDt(
                    'exit',
                    exitRanges.length > 0,
                    () => setExitRanges([]),
                    () => {
                      if (exitRanges.length === 0) setExitRanges([{ from: '', to: '' }])
                    },
                  )
                }
                onChange={setExitRanges}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <button onClick={reset} disabled={pending} className="text-sm text-primary hover:underline disabled:opacity-50">
          {t('filters.reset')}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
          >
            {t('filters.cancel')}
          </button>
          <button
            onClick={apply}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {t('filters.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
