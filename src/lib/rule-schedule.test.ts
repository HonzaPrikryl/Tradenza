import { describe, it, expect } from 'vitest'
import { scheduleLabel, isoWeekdayShort, isoWeekdayMin, WEEKDAYS_PRESET } from './rule-schedule'

describe('isoWeekday labels', () => {
  it('maps ISO weekdays (1=Mon … 7=Sun) to short labels', () => {
    expect(isoWeekdayShort(1)).toBe('Mon')
    expect(isoWeekdayShort(5)).toBe('Fri')
    expect(isoWeekdayShort(6)).toBe('Sat')
    expect(isoWeekdayShort(7)).toBe('Sun')
  })

  it('maps ISO weekdays to minimal labels', () => {
    expect(isoWeekdayMin(1)).toBe('Mo')
    expect(isoWeekdayMin(7)).toBe('Su')
  })
})

describe('scheduleLabel', () => {
  it('collapses all seven days to "Daily"', () => {
    expect(scheduleLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Daily')
  })

  it('collapses the weekday preset into a range', () => {
    expect(scheduleLabel([...WEEKDAYS_PRESET])).toBe('Mon–Fri')
  })

  it('lists a two-day run individually (runs collapse only at length ≥ 3)', () => {
    expect(scheduleLabel([6, 7])).toBe('Sat, Sun')
  })

  it('lists non-contiguous days individually', () => {
    expect(scheduleLabel([1, 3, 5])).toBe('Mon, Wed, Fri')
  })

  it('mixes a collapsed run with a trailing single day', () => {
    expect(scheduleLabel([1, 2, 3, 5])).toBe('Mon–Wed, Fri')
  })

  it('sorts and de-duplicates the input first', () => {
    expect(scheduleLabel([3, 1, 2, 2])).toBe('Mon–Wed')
  })
})
