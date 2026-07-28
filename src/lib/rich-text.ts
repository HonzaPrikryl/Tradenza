// Sanitizer for RichTextEditor content.
//
// Two jobs, both needed on every path that stores or renders editor HTML:
//
//  1. Theme safety — pasted content (Word, Notion, web pages) and old
//     `document.execCommand` output carry hard-coded inline colors such as
//     `color: rgb(0, 0, 0)`. Those survive a theme switch, so the note renders
//     black-on-black in dark mode. Every color / background / font declaration
//     is stripped so text always inherits `--foreground`; only layout-related
//     CSS (image sizing, float, alignment) is kept.
//
//  2. XSS safety — the description/notes HTML is written back into the page
//     with `dangerouslySetInnerHTML`, so scripts, event handlers and
//     `javascript:` URLs must never make it through.
//
// Implemented without a DOM so it can run in a React Server Component, in the
// browser and in tests alike.

/** Tags kept as-is. Anything else is unwrapped — its text content survives. */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'mark',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'img',
  'hr',
  'code',
  'pre',
  'sub',
  'sup',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
])

/** Tags dropped together with everything they contain. */
const DROPPED_WITH_CONTENT = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'template',
  'svg',
  'math',
  'head',
  'title',
  'link',
  'meta',
  'form',
  'input',
  'button',
  'select',
  'textarea',
]

const VOID_TAGS = new Set(['br', 'hr', 'img'])

/** Per-tag attribute allowlist; `*` applies to every allowed tag. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  '*': ['style'],
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
}

/**
 * CSS properties that survive sanitising. Deliberately layout-only: `color`,
 * `background*`, `font*` and friends are excluded so the theme always wins.
 */
const ALLOWED_CSS = new Set([
  'width',
  'height',
  'max-width',
  'min-width',
  'float',
  'display',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-left',
  'text-align',
  'vertical-align',
  'border-radius',
  'object-fit',
])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  tab: '\t',
  newline: '\n',
  colon: ':',
}

/** Decode entities so `&#106;avascript:` can't smuggle a scheme past the check. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);?/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named ?? match
  })
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** `null` → drop the attribute entirely. */
function safeUrl(raw: string, allowInlineImage: boolean): string | null {
  const decoded = decodeEntities(raw).trim()
  // Control chars and whitespace hide the scheme from naive checks
  // (`java\0script:`, `java\nscript:`) — strip them before testing.
  // eslint-disable-next-line no-control-regex
  const probe = decoded.replace(/[\u0000-\u0020\u007f]/g, '')
  if (!probe) return null
  if (/^(https?:|mailto:|tel:)/i.test(probe)) return decoded
  if (allowInlineImage && /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(probe)) {
    return decoded
  }
  // Any other explicit scheme (javascript:, vbscript:, data:text/html, ...) is out.
  if (/^[a-z][a-z0-9+.-]*:/i.test(probe)) return null
  // Relative URLs, absolute paths and fragments are fine.
  return decoded
}

function sanitizeStyle(raw: string): string {
  const kept: string[] = []
  for (const declaration of decodeEntities(raw).split(';')) {
    const idx = declaration.indexOf(':')
    if (idx < 0) continue
    const prop = declaration.slice(0, idx).trim().toLowerCase()
    const value = declaration.slice(idx + 1).trim()
    if (!ALLOWED_CSS.has(prop) || !value) continue
    // No url()/expression() payloads, no markup breakouts.
    if (/url\s*\(|expression\s*\(|[<>"']/i.test(value)) continue
    kept.push(`${prop}: ${value}`)
  }
  return kept.join('; ')
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g

function sanitizeAttrs(tag: string, rawAttrs: string, allowInlineImage: boolean): string {
  const allowed = new Set([...(ALLOWED_ATTRS['*'] ?? []), ...(ALLOWED_ATTRS[tag] ?? [])])
  const out: string[] = []
  for (const match of rawAttrs.matchAll(ATTR_RE)) {
    const name = match[1].toLowerCase()
    if (!allowed.has(name)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (name === 'style') {
      const style = sanitizeStyle(value)
      if (style) out.push(`style="${escapeAttr(style)}"`)
      continue
    }
    if (name === 'href' || name === 'src') {
      const url = safeUrl(value, allowInlineImage && name === 'src')
      if (url) out.push(`${name}="${escapeAttr(url)}"`)
      continue
    }
    // Decode first, then re-escape — otherwise already-encoded entities such as
    // `&quot;` would get double-escaped into visible `&amp;quot;`.
    out.push(`${name}="${escapeAttr(decodeEntities(value))}"`)
  }
  // Links are user-supplied and open off-site — never hand over the opener.
  if (tag === 'a' && out.some((a) => a.startsWith('href='))) {
    out.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
  }
  return out.length ? ` ${out.join(' ')}` : ''
}

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g

export interface SanitizeOptions {
  /** Keep `data:image/...;base64` sources (the editor's fallback when object storage is off). */
  allowInlineImages?: boolean
}

/**
 * Return `html` with unsafe markup removed and all colour/font styling stripped,
 * so the result always renders in the current theme's text colour.
 */
/**
 * `zod().transform()` helper that passes `null` / `undefined` / `''` through.
 *
 * Exists as a named function so `'use server'` modules don't need an inline
 * arrow in their schemas — Next's Server Actions compiler rejects any
 * non-async function expression it finds inside an exported action.
 */
export function sanitizeRichTextValue<T extends string | null | undefined>(html: T): T {
  return (html ? sanitizeRichText(html) : html) as T
}

export function sanitizeRichText(html: string, options: SanitizeOptions = {}): string {
  if (!html) return ''
  const allowInlineImage = options.allowInlineImages ?? true

  let out = html.replace(/<!--[\s\S]*?-->/g, '')
  for (const tag of DROPPED_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '')
    out = out.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '')
  }

  return out.replace(TAG_RE, (match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase()
    // Unknown tag → unwrap it (drop the markup, keep the children).
    if (!ALLOWED_TAGS.has(tag)) return ''
    if (match.startsWith('</')) return VOID_TAGS.has(tag) ? '' : `</${tag}>`
    const attrs = sanitizeAttrs(tag, rawAttrs, allowInlineImage)
    return VOID_TAGS.has(tag) ? `<${tag}${attrs} />` : `<${tag}${attrs}>`
  })
}
