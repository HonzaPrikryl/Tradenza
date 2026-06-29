import { enUS } from 'date-fns/locale'

// ─── Supported languages ──────────────────────────────────────────────────────
// Single source of truth for which languages the app ships. Today it is English
// only, but the app is structured so adding a language is a contained change:
//   1. add its code here,
//   2. add a dictionary folder under `locales/<code>/` and register it in
//      `i18n/index.ts`,
//   3. add a `localeFormats` entry below.
export const locales = ['en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

// The currently active UI language. Kept as a single constant for now; when
// per-user languages are introduced, wire this to a cookie / header / user
// setting and pass the resolved locale into the formatters below.
export const activeLocale: Locale = defaultLocale

// date-fns locale objects share this shape.
type DateFnsLocale = typeof enUS

export interface LocaleFormats {
  /** BCP-47 tag for Intl number / currency / date formatting. */
  numberLocale: string
  /** date-fns locale used by `format()`. */
  dateFnsLocale: DateFnsLocale
  /** Default date format (date-fns tokens). */
  dateFormat: string
  /** Default date-time format (date-fns tokens). */
  dateTimeFormat: string
}

export const localeFormats: Record<Locale, LocaleFormats> = {
  en: {
    numberLocale: 'en-US',
    dateFnsLocale: enUS,
    dateFormat: 'MM/dd/yyyy',
    dateTimeFormat: 'MM/dd/yyyy HH:mm',
  },
}

/** Formatting config for a locale (defaults to the active one). */
export function getFormats(locale: Locale = activeLocale): LocaleFormats {
  return localeFormats[locale]
}

/** BCP-47 tag for the active UI locale, for use with `Intl` / `toLocale*`. */
export function getUiLocale(locale: Locale = activeLocale): string {
  return localeFormats[locale].numberLocale
}
