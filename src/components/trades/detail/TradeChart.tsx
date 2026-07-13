'use client'

import { useEffect, useRef } from 'react'
import { Loader2, CandlestickChart } from 'lucide-react'
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
  type SeriesMarker,
} from 'lightweight-charts'
import { t } from '@/i18n'
import { type CandlesResult } from '@/lib/actions/candles'
import type { NormalizedExecution } from './executions'

// ─── Trade detail chart ───────────────────────────────────────────────────────

export default function TradeChart({
  executions,
  result,
}: {
  executions: NormalizedExecution[]
  result: CandlesResult | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Chart render
  useEffect(() => {
    const el = containerRef.current
    if (!el || result?.status !== 'ok') return

    const { candles, intervalSec } = result
    const textColor = getComputedStyle(el).color || '#9ca3af'

    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(127,127,127,0.10)' },
        horzLines: { color: 'rgba(127,127,127,0.10)' },
      },
      rightPriceScale: { borderColor: 'rgba(127,127,127,0.25)' },
      timeScale: {
        borderColor: 'rgba(127,127,127,0.25)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(127,127,127,0.4)', labelBackgroundColor: '#6366f1' },
        horzLine: { color: 'rgba(127,127,127,0.4)', labelBackgroundColor: '#6366f1' },
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      // No dotted last-price level line across the chart.
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
    })

    const tzShift = -new Date(candles[0].t * 1000).getTimezoneOffset() * 60

    candleSeries.setData(
      candles.map((c) => ({
        time: (c.t + tzShift) as UTCTimestamp,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      })),
    )
    volumeSeries.setData(
      candles.map((c) => ({
        time: (c.t + tzShift) as UTCTimestamp,
        value: c.v,
        color: c.c >= c.o ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)',
      })),
    )

    const firstT = candles[0].t
    const lastT = candles[candles.length - 1].t
    const markers: SeriesMarker<UTCTimestamp>[] = executions.map((e) => {
      const snapped = Math.min(Math.max(Math.floor(e.time / intervalSec) * intervalSec, firstT), lastT) + tzShift
      return e.side === 'buy'
        ? {
            time: snapped as UTCTimestamp,
            position: 'belowBar',
            shape: 'arrowUp',
            color: '#26a69a',
            text: `${t('trades.detail.chart.buy')} ${e.quantity} @ ${e.price}`,
          }
        : {
            time: snapped as UTCTimestamp,
            position: 'aboveBar',
            shape: 'arrowDown',
            color: '#ef5350',
            text: `${t('trades.detail.chart.sell')} ${e.quantity} @ ${e.price}`,
          }
    })
    markers.sort((a, b) => Number(a.time) - Number(b.time))
    createSeriesMarkers(candleSeries, markers)

    const seenPrices = new Set<number>()
    for (const e of executions) {
      const key = Math.round(e.price * 1e6)
      if (seenPrices.has(key)) continue
      seenPrices.add(key)
      candleSeries.createPriceLine({
        price: e.price,
        color: e.side === 'buy' ? '#26a69a' : '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: e.side === 'buy' ? t('trades.detail.chart.buy') : t('trades.detail.chart.sell'),
      })
    }

    chart.timeScale().fitContent()

    return () => chart.remove()
  }, [result, executions])

  if (result === null) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('trades.detail.chart.loading')}
      </div>
    )
  }

  if (result.status !== 'ok') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
        <CandlestickChart className="h-8 w-8 text-muted-foreground/50" />
        <p className="max-w-md text-sm text-muted-foreground">{t(`trades.detail.chart.${result.status}`)}</p>
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full text-muted-foreground" />
}
