import { t } from '@/i18n'

// The legend under both year heatmaps.
//
// It used to be written out twice, and the two copies had drifted into different entries
// in a different order — the trading one led with the green ramp, the habits one led with
// a grey square and omitted "no activity" from the trading side entirely. Since both grids
// use the SAME red/amber/green ramp and the same hatches, the legend that decodes them
// must be one component; a difference between the tabs would be a claim that the colours
// mean different things.
//
// Order runs worst → best after the scale, and ends with the two "nothing to score" states
// so the scale itself stays first, where the eye lands.

function Swatch({ className }: { className: string }) {
  return <span className={`h-3 w-3 rounded-[3px] border ${className}`} />
}

export default function HeatLegend({
  /**
   * Show the no-trade-day shade. Trading only: it marks a day you deliberately sat out and
   * still kept your rules, and habits have no such notion — `cleanNoTrade` isn't even a
   * field on a habit cell, so the grid there can never render it.
   */
  noTrade = false,
}: {
  noTrade?: boolean
}) {
  return (
    <>
      <span className="flex items-center gap-1">
        <span>{t('progress.calendar.legendLess')}</span>
        <Swatch className="heat-l1" />
        <Swatch className="heat-l3" />
        <Swatch className="heat-perfect" />
        <span>{t('progress.calendar.legendMore')}</span>
      </span>
      {/* Its own green hatch, distinct from the ramp — a sat-out day is disciplined, but it
          has no task tally to shade by, so it must not read as "100% done". Trimming this
          entry left a colour on the grid with nothing to decode it. */}
      {noTrade && (
        <span className="flex items-center gap-1">
          <Swatch className="heat-notrade" />
          {t('progress.calendar.legendNoTrade')}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Swatch className="day-yellow" />
        {t('progress.calendar.legendYellow')}
      </span>
      <span className="flex items-center gap-1">
        <Swatch className="day-red" />
        {t('progress.calendar.legendRed')}
      </span>
      {/* No data on a day something was scheduled, and its excused (blue) variant. An excused day isn't a
          third kind of day — it's an unlogged one that doesn't count against you — so it
          shares the label rather than spending another colour on the scale. */}
      <span className="flex items-center gap-1">
        <Swatch className="heat-unlogged" />
        <Swatch className="heat-away" />
        {t('progress.calendar.legendNotLogged')}
      </span>
      {/* Distinct from "not logged": nothing was ever SCHEDULED, so there was nothing to
          log. Both render grey-ish and the difference decides whether the day counts
          against you, which makes it the one pair worth spelling out. */}
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-[3px] border border-muted-foreground/30 bg-muted/50" />
        {t('progress.calendar.legendNone')}
      </span>
    </>
  )
}
