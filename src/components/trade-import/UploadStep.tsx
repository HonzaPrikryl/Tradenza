'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { FileUp, Info, ChevronDown, FileText, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import Select from '@/components/ui/Select'
import { AssetTypeList, BrokerIcon } from './shared'
import type { Broker } from '@/lib/brokers'
import {
  buildImportMapping,
  buildFillMapping,
  extractTable,
  looksLikeFills,
  IMPORT_FIELDS,
  IMPORT_REQUIRED,
  FILL_FIELDS,
  FILL_REQUIRED,
} from '@/lib/csv-columns'
import { importTradesCsv, importFillsCsv, type WizardImportResult } from '@/lib/actions/wizard'
import { setAccountsFilter } from '@/lib/global-filters'

const NONE = '__none__'
type ImportMode = 'trades' | 'fills'

const TIMEZONES = [
  'UTC',
  'Europe/Prague',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

function gmtLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(
      new Date(),
    )
    const off = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    return off === 'GMT' ? 'GMT+00:00' : off
  } catch {
    return 'GMT'
  }
}

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
  const [tz, setTz] = useState(defaultTimezone || TIMEZONES[0])
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<WizardImportResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [colMap, setColMap] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<ImportMode>('trades')
  const [modeTouched, setModeTouched] = useState(false)

  const headers = useMemo(() => (rows.length > 0 ? Object.keys(rows[0]) : []), [rows])

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
  const missingRequired = requiredFields.filter((f) => !colMap[f])
  const setField = (field: string, header: string) =>
    setColMap((prev) => {
      const next = { ...prev }
      if (header === NONE) delete next[field]
      else next[field] = header
      return next
    })

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    setResult(null)
    setParseError(null)
    Papa.parse<string[]>(f, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const matrix = (res.data as string[][]).map((r) => r.map((c) => (c ?? '').toString()))
        const { rows: data } = extractTable(matrix)
        if (data.length === 0) {
          setParseError(t('addTrades.upload.emptyFile'))
          setFile(null)
          setRows([])
          return
        }
        setFile(f)
        setRows(data)
      },
      error: () => {
        setParseError(t('addTrades.upload.parseError'))
        setFile(null)
        setRows([])
      },
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    noClick: true,
  })

  const doImport = async () => {
    if (!file || rows.length === 0 || importing || missingRequired.length > 0) return
    setImporting(true)
    try {
      const res =
        mode === 'fills'
          ? await importFillsCsv({ accountId, filename: file.name, timezone: tz, mapping: colMap, rows })
          : await importTradesCsv({
              accountId,
              filename: file.name,
              timezone: tz,
              assetClass: broker.assets.includes('futures') ? 'futures' : 'stocks',
              mapping: colMap,
              rows,
            })
      setResult(res)
      if (res.imported > 0) {
        toast.success(t('addTrades.upload.importedToast', { count: res.imported }))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('addTrades.upload.importError'))
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setFile(null)
    setRows([])
    setResult(null)
    setParseError(null)
    setModeTouched(false)
  }

  if (result) {
    const ok = result.imported > 0
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
        {ok ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-profit" />
        ) : (
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
        )}
        <h2 className="mt-4 text-xl font-semibold">
          {ok ? t('addTrades.upload.resultTitle', { count: result.imported }) : t('addTrades.upload.resultTitleNone')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('addTrades.upload.resultDetail', {
            total: result.total,
            imported: result.imported,
            skipped: result.skipped,
          })}
        </p>

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
              <Select
                value={tz}
                onValueChange={setTz}
                options={(TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES]).map((z) => ({
                  value: z,
                  label: `(${gmtLabel(z)}) ${z}`,
                }))}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t('addTrades.upload.timeZoneHint')}</p>
          </div>

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

          <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.map((field) => {
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
                </div>
              )
            })}
          </div>

          {missingRequired.length > 0 && (
            <p className="mt-4 text-xs text-amber-400">
              {t('addTrades.upload.mapping.missing', {
                cols: missingRequired.map((f) => t(`addTrades.upload.fields.${f}`)).join(', '),
              })}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <button
              onClick={doImport}
              disabled={importing || missingRequired.length > 0}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors',
                importing || missingRequired.length > 0
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
