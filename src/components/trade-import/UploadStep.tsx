'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import {
  FileUp,
  Info,
  ChevronDown,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import Select from '@/components/ui/Select'
import { AssetTypeList, BrokerIcon } from './shared'
import { defaultAssetClass, type AssetType, type Broker } from '@/lib/brokers'
import {
  buildImportMapping,
  buildFillMapping,
  extractTable,
  looksLikeFills,
  unmappedRequiredFields,
  IMPORT_FIELDS,
  IMPORT_REQUIRED,
  FILL_FIELDS,
  FILL_REQUIRED,
} from '@/lib/csv-columns'
import { importTradesCsv, importFillsCsv, type WizardImportResult } from '@/lib/actions/wizard'
import { track, headerSample, type ImportFunnelProps } from '@/lib/analytics'
import { timezoneOptions, FALLBACK_TIMEZONE } from '@/lib/timezones'
import {
  detectDecimalSeparator,
  detectDayFirst,
  parseNumber,
  parseDateInTz,
  stripTzAbbrev,
  MAX_TRADE_ROWS,
  MAX_FILL_ROWS,
} from '@/lib/actions/wizard-helpers'
import { setAccountsFilter } from '@/lib/global-filters'

const NONE = '__none__'
type ImportMode = 'trades' | 'fills'

// Fields whose cells the importer reads as numbers / instants. Used to show the
// user what a column will actually become before anything is written.
const NUMERIC_FIELDS = ['entryPrice', 'exitPrice', 'quantity', 'fees', 'grossPnl', 'netPnl', 'price', 'commission']
const DATE_FIELDS = ['entryDate', 'exitDate', 'datetime']

// Mirrors FORMAT_SAMPLE_ROWS on the server so both reach the same conclusion.
const FORMAT_SAMPLE_ROWS = 200

export default function UploadStep({
  broker,
  accountId,
  defaultTimezone,
}: {
  broker: Broker
  accountId: string
  defaultTimezone: string
}) {
  const router = useRouter()
  const [tz, setTz] = useState(defaultTimezone || FALLBACK_TIMEZONE)
  const tzOptions = useMemo(() => timezoneOptions(tz), [tz])
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<WizardImportResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [colMap, setColMap] = useState<Record<string, string>>({})
  const [showAllFields, setShowAllFields] = useState(false)
  const [mode, setMode] = useState<ImportMode>('trades')
  const [modeTouched, setModeTouched] = useState(false)
  // Asset class for this import, constrained to what the broker actually
  // supports. Single-asset brokers (most futures prop firms) resolve to their
  // one type automatically and never render a picker.
  const assetChoices = broker.assets
  const [assetClass, setAssetClass] = useState<AssetType>(defaultAssetClass(broker))

  const headers = useMemo(() => (rows.length > 0 ? Object.keys(rows[0]) : []), [rows])

  // Import funnel bookkeeping. `remapped` is the auto-mapper's error report:
  // every field the user had to fix by hand is a header we failed to recognise.
  const remappedRef = useRef<Set<string>>(new Set())
  const funnelRef = useRef<ImportFunnelProps | null>(null)
  const settledRef = useRef(false)

  useEffect(() => {
    if (headers.length === 0 || modeTouched) return
    setMode(looksLikeFills(headers) ? 'fills' : 'trades')
  }, [headers, modeTouched])

  useEffect(() => {
    if (headers.length === 0) {
      setColMap({})
      return
    }
    setColMap(mode === 'fills' ? buildFillMapping(headers) : buildImportMapping(headers))
  }, [headers, mode])

  const fields: readonly string[] = mode === 'fills' ? FILL_FIELDS : IMPORT_FIELDS
  const requiredFields: readonly string[] = mode === 'fills' ? FILL_REQUIRED : IMPORT_REQUIRED
  const missingRequired = unmappedRequiredFields(colMap, requiredFields)
  // The server caps a single import. Checking here turns an opaque validation
  // rejection into an instruction the user can act on.
  const maxRows = mode === 'fills' ? MAX_FILL_ROWS : MAX_TRADE_ROWS
  const tooManyRows = rows.length > maxRows

  const funnelProps = (): ImportFunnelProps => ({
    kind: mode,
    broker: broker.id,
    headers: headerSample(headers),
    unmapped: missingRequired,
    remapped: [...remappedRef.current],
  })

  useEffect(() => {
    funnelRef.current = file && !settledRef.current ? funnelProps() : null
  })

  // Leaving the wizard with a file loaded and nothing imported is the drop-off
  // we most want to see; it never reaches the server, so it has to be reported
  // from here.
  useEffect(() => {
    const flush = () => {
      if (!funnelRef.current) return
      track({ name: 'import_abandoned', props: funnelRef.current }, { beacon: true })
      funnelRef.current = null
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  const detectedFields = fields.filter((f) => colMap[f])

  const setField = (field: string, header: string) => {
    remappedRef.current.add(field)
    setColMap((prev) => {
      const next = { ...prev }
      if (header === NONE) delete next[field]
      else next[field] = header
      return next
    })
  }

  // Leading rows are often blank for optional columns, so scan a few.
  const sampleValue = (header: string | undefined): string => {
    if (!header) return ''
    for (const r of rows.slice(0, 20)) {
      const v = (r[header] ?? '').trim()
      if (v) return v.length > 32 ? `${v.slice(0, 32)}…` : v
    }
    return ''
  }

  // Number and date conventions are inferred per file, with the same functions
  // and the same sample the server uses, so the preview can't disagree with what
  // actually gets stored.
  const columnValues = useCallback(
    (forFields: readonly string[]) =>
      forFields.flatMap((f) => (colMap[f] ? rows.slice(0, FORMAT_SAMPLE_ROWS).map((r) => r[colMap[f]]) : [])),
    [rows, colMap],
  )
  const decimal = useMemo(() => detectDecimalSeparator(columnValues(NUMERIC_FIELDS)), [columnValues])
  const dayFirst = useMemo(() => detectDayFirst(columnValues(DATE_FIELDS)), [columnValues])

  /**
   * How the importer will actually read a cell. Showing the raw text alone hides
   * the whole class of bugs where the right column is mapped but the value is
   * misread — "1,5" stored as 15, "4:13 PM" stored as 04:13.
   */
  const parsedPreview = (field: string, raw: string): string | null => {
    if (!raw) return null
    if (NUMERIC_FIELDS.includes(field)) {
      const n = parseNumber(raw, decimal)
      return n === null ? t('addTrades.upload.mapping.unparsable') : String(n)
    }
    if (DATE_FIELDS.includes(field)) {
      const d = parseDateInTz(stripTzAbbrev(raw), tz, dayFirst)
      if (!d) return t('addTrades.upload.mapping.unparsable')
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        dateStyle: 'short',
        timeStyle: 'medium',
        hour12: false,
      }).format(d)
    }
    return null
  }

  const renderFieldSelect = (field: string) => {
    const required = requiredFields.includes(field)
    const value = colMap[field] ?? NONE
    const missing = required && value === NONE
    return (
      <div key={field}>
        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {t(`addTrades.upload.fields.${field}`)}
          {required && <span className="text-loss">*</span>}
        </label>
        <select
          value={value}
          onChange={(e) => setField(field, e.target.value)}
          className={cn(
            'w-full rounded-md border bg-input/40 px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary',
            missing ? 'border-loss/60' : 'border-border focus:border-primary',
          )}
        >
          <option value={NONE}>{t('addTrades.upload.mapping.none')}</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        {value === NONE ? <p className="mt-1 text-[11px]">&nbsp;</p> : sampleCell(field, sampleValue(colMap[field]))}
      </div>
    )
  }

  /** Raw cell, and the reading beside it when the two differ. */
  const sampleCell = (field: string, raw: string) => {
    const parsed = parsedPreview(field, raw)
    const unparsable = parsed === t('addTrades.upload.mapping.unparsable')
    return (
      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
        {raw || t('addTrades.upload.mapping.emptySample')}
        {parsed !== null && parsed !== raw && (
          <span className={cn('ml-1.5', unparsable ? 'text-loss' : 'text-foreground')}>→ {parsed}</span>
        )}
      </p>
    )
  }

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0]
      if (!f) return
      setResult(null)
      setParseError(null)
      remappedRef.current = new Set()
      settledRef.current = false
      Papa.parse<string[]>(f, {
        header: false,
        skipEmptyLines: 'greedy',
        complete: (res) => {
          const matrix = (res.data as string[][]).map((r) => r.map((c) => (c ?? '').toString()))
          const { rows: data } = extractTable(matrix)
          if (data.length === 0) {
            track({ name: 'import_parse_failed', props: { reason: 'empty', broker: broker.id } })
            setParseError(t('addTrades.upload.emptyFile'))
            setFile(null)
            setRows([])
            return
          }
          const hdrs = Object.keys(data[0])
          const fills = looksLikeFills(hdrs)
          const auto = fills ? buildFillMapping(hdrs) : buildImportMapping(hdrs)
          track({
            name: 'import_file_parsed',
            props: {
              kind: fills ? 'fills' : 'trades',
              broker: broker.id,
              headers: headerSample(hdrs),
              unmapped: unmappedRequiredFields(auto, fills ? FILL_REQUIRED : IMPORT_REQUIRED),
              rows: data.length,
              autoMapped: Object.keys(auto).length,
            },
          })
          setFile(f)
          setRows(data)
        },
        error: () => {
          track({ name: 'import_parse_failed', props: { reason: 'unreadable', broker: broker.id } })
          setParseError(t('addTrades.upload.parseError'))
          setFile(null)
          setRows([])
        },
      })
    },
    [broker.id],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    noClick: true,
  })

  const doImport = async () => {
    if (!file || rows.length === 0 || importing || missingRequired.length > 0 || tooManyRows) return
    setImporting(true)
    try {
      const res =
        mode === 'fills'
          ? await importFillsCsv({ accountId, filename: file.name, timezone: tz, assetClass, mapping: colMap, rows })
          : await importTradesCsv({
              accountId,
              filename: file.name,
              timezone: tz,
              assetClass,
              mapping: colMap,
              rows,
            })
      if (handleRateLimit(res)) return
      settledRef.current = true
      funnelRef.current = null
      setResult(res)
      if (res.imported > 0) {
        track({
          name: 'trades_imported',
          props: { count: res.imported, kind: mode, remapped: [...remappedRef.current] },
        })
        toast.success(t('addTrades.upload.importedToast', { count: res.imported }))
      } else if (res.duplicates === 0 || res.skipped > 0) {
        // A file that was already imported is not a mapping failure — counting it
        // as one would bury the real ones.
        track({
          name: 'import_failed',
          props: {
            ...funnelProps(),
            unmapped: res.unmappedRequired,
            total: res.total,
            skipped: res.skipped,
            errors: res.errors.length,
          },
        })
      }
    } catch (e) {
      toast.error(getActionErrorMessage(e, 'addTrades.upload.importError'))
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    settledRef.current = true
    funnelRef.current = null
    remappedRef.current = new Set()
    setFile(null)
    setRows([])
    setResult(null)
    setParseError(null)
    setModeTouched(false)
    setShowAllFields(false)
  }

  if (result) {
    const ok = result.imported > 0
    // Nothing imported because everything was already in the account is a normal
    // outcome, not a failure — saying "nothing was imported" reads like a bug.
    const allDuplicates = !ok && result.duplicates > 0 && result.skipped === 0
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
        {ok || allDuplicates ? (
          <CheckCircle2 className={cn('mx-auto h-12 w-12', ok ? 'text-profit' : 'text-muted-foreground')} />
        ) : (
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
        )}
        <h2 className="mt-4 text-xl font-semibold">
          {ok
            ? t('addTrades.upload.resultTitle', { count: result.imported })
            : allDuplicates
              ? t('addTrades.upload.resultTitleDuplicates')
              : t('addTrades.upload.resultTitleNone')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('addTrades.upload.resultDetail', {
            total: result.total,
            imported: result.imported,
            skipped: result.skipped,
          })}
        </p>

        {result.duplicates > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t('addTrades.upload.resultDuplicates', { count: result.duplicates })}
          </p>
        )}

        {result.unmappedRequired.length > 0 && (
          <p className="mt-3 text-sm text-amber-400">
            {t('addTrades.upload.missingColumns', { cols: result.unmappedRequired.join(', ') })}
          </p>
        )}

        {result.errors.length > 0 && (
          <div className="mt-4 text-left">
            <button
              onClick={() => setShowErrors((s) => !s)}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {t('addTrades.upload.showErrors', { count: result.errors.length })}
              <ChevronDown className={cn('h-4 w-4 transition-transform', showErrors && 'rotate-180')} />
            </button>
            {showErrors && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            {t('addTrades.upload.importAnother')}
          </button>
          <button
            onClick={async () => {
              try {
                await setAccountsFilter([accountId])
              } catch {
                /* noop */
              }
              router.push('/trades')
            }}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('addTrades.upload.viewTrades')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-10 md:grid-cols-2">
        {/* Left: upload */}
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{t('addTrades.upload.yourFile')}</h2>
          </div>

          {/* Time zone */}
          <div className="mt-5">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              {t('addTrades.upload.timeZone')}
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </label>
            <div className="mt-1.5">
              <Select value={tz} onValueChange={setTz} options={tzOptions} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t('addTrades.upload.timeZoneHint')}</p>
          </div>

          {/* Asset type — only when the broker supports more than one */}
          {assetChoices.length > 1 && (
            <div className="mt-5">
              <label className="text-sm font-medium">{t('addTrades.upload.assetType')}</label>
              <div className="mt-1.5 inline-flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
                {assetChoices.map((a) => {
                  const active = a === assetClass
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAssetClass(a)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm transition-colors',
                        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(`addTrades.assets.${a}`)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t('addTrades.upload.assetTypeHint')}</p>
            </div>
          )}

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={cn(
              'mt-5 rounded-xl border border-dashed px-6 py-10 text-center transition-colors',
              isDragActive ? 'border-primary bg-primary/10' : 'border-primary/40 bg-primary/5',
            )}
          >
            <input {...getInputProps()} />
            {file ? (
              <div>
                <FileText className="mx-auto h-7 w-7 text-primary" />
                <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                  <span className="font-medium">{file.name}</span>
                  <button
                    onClick={reset}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t('addTrades.common.close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('addTrades.upload.rowsDetected', { count: rows.length })}
                </p>
              </div>
            ) : (
              <div>
                <FileUp className="mx-auto h-7 w-7 text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {isDragActive ? t('addTrades.upload.dropActive') : t('addTrades.upload.dropHere')}
                </p>
                {parseError && <p className="mt-2 text-xs text-loss">{parseError}</p>}
                <button
                  onClick={open}
                  className="mt-4 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t('addTrades.upload.uploadButton')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: instructions */}
        <div className="md:border-l md:border-border md:pl-10">
          <div className="flex items-center gap-3">
            <BrokerIcon broker={broker} size="lg" />
            <h3 className="text-xl font-semibold">{broker.name}</h3>
          </div>

          <p className="mt-5 text-sm font-semibold">{t('addTrades.upload.supportedAssets')}</p>
          <div className="mt-2">
            <AssetTypeList assets={broker.assets} />
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold">{t('addTrades.upload.howTo', { broker: broker.name })}</p>
          </div>

          <ul className="mt-3 space-y-3">
            {(expanded ? [1, 2, 3, 4] : [1, 2, 3]).map((i) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                {t(`addTrades.upload.steps.${i}`)}
              </li>
            ))}
          </ul>

          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-4 flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {t('addTrades.upload.expand')}
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Column mapping */}
      {file && rows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold">{t('addTrades.upload.mapping.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('addTrades.upload.mapping.subtitle')}</p>

          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t('addTrades.upload.mode.label')}
            </span>
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              {(['trades', 'fills'] as ImportMode[]).map((mo) => (
                <button
                  key={mo}
                  type="button"
                  onClick={() => {
                    setMode(mo)
                    setModeTouched(true)
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    mode === mo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(mo === 'trades' ? 'addTrades.upload.mode.trades' : 'addTrades.upload.mode.fills')}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t(mode === 'fills' ? 'addTrades.upload.mode.fillsHint' : 'addTrades.upload.mode.tradesHint')}
            </p>
          </div>

          {/* Collapsed view: what we recognised, with a value from the file next
              to it. A wrong column is far easier to spot from its data than from
              its name, and it keeps the 13-dropdown wall out of the way. */}
          {!showAllFields && (
            <>
              <p className="mt-5 text-xs text-muted-foreground">
                {detectedFields.length === 0
                  ? t('addTrades.upload.mapping.noneDetected')
                  : t('addTrades.upload.mapping.detectedCount', {
                      count: detectedFields.length,
                      total: fields.length,
                    })}
              </p>

              {detectedFields.length > 0 && (
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">{t('addTrades.upload.mapping.colField')}</th>
                        <th className="px-3 py-2 font-medium">{t('addTrades.upload.mapping.colSource')}</th>
                        <th className="px-3 py-2 font-medium">{t('addTrades.upload.mapping.colSample')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detectedFields.map((field) => (
                        <tr key={field} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">
                            {t(`addTrades.upload.fields.${field}`)}
                            {requiredFields.includes(field) && <span className="ml-0.5 text-loss">*</span>}
                          </td>
                          <td className="px-3 py-2 font-medium">{colMap[field]}</td>
                          <td className="px-3 py-2">{sampleCell(field, sampleValue(colMap[field]))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {missingRequired.length > 0 && (
                <div className="mt-4 rounded-xl border border-loss/40 bg-loss/5 p-4">
                  <p className="text-sm font-medium">{t('addTrades.upload.mapping.needsAttention')}</p>
                  <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {missingRequired.map(renderFieldSelect)}
                  </div>
                </div>
              )}
            </>
          )}

          {showAllFields && (
            <>
              <p className="mt-5 text-xs text-muted-foreground">{t('addTrades.upload.mapping.combinedHint')}</p>
              <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{fields.map(renderFieldSelect)}</div>
              {missingRequired.length > 0 && (
                <p className="mt-4 text-xs text-amber-400">
                  {t('addTrades.upload.mapping.missing', {
                    cols: missingRequired.map((f) => t(`addTrades.upload.fields.${f}`)).join(', '),
                  })}
                </p>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setShowAllFields((s) => !s)}
            className="mt-4 flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t(showAllFields ? 'addTrades.upload.mapping.collapse' : 'addTrades.upload.mapping.adjust')}
          </button>

          {tooManyRows && (
            <p className="mt-4 text-xs text-loss">
              {t('addTrades.upload.tooManyRows', { count: rows.length, max: maxRows })}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <button
              onClick={doImport}
              disabled={importing || missingRequired.length > 0 || tooManyRows}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors',
                importing || missingRequired.length > 0 || tooManyRows
                  ? 'cursor-not-allowed bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {importing ? t('addTrades.upload.importing') : t('addTrades.upload.importButton', { count: rows.length })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
