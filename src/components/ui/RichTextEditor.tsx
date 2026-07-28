'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link2,
  Unlink,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Pilcrow,
  Check,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  TextCursor,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { uploadNoteImage } from '@/lib/actions/uploads'
import { isEmptyHtml } from '@/lib/html'
import { sanitizeRichText } from '@/lib/rich-text'

// Downscale + recompress an image client-side, returning both a Blob (for
// upload to object storage) and a data URL (used as an inline fallback when R2
// isn't configured, e.g. local dev / self-host without storage).
function processImage(file: File, maxW = 1280, quality = 0.82): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ blob: file, dataUrl: reader.result as string })
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const useJpeg = file.size > 200_000 || file.type === 'image/jpeg'
        const type = useJpeg ? 'image/jpeg' : 'image/png'
        const dataUrl = canvas.toDataURL(type, quality)
        canvas.toBlob((blob) => resolve({ blob: blob ?? file, dataUrl }), type, quality)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** Block-level tags the editor can produce — used to detect the caret's block. */
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'li', 'div'])

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint === 'function') return doc.caretRangeFromPoint(x, y)
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (!pos) return null
  const range = document.createRange()
  range.setStart(pos.offsetNode, pos.offset)
  range.collapse(true)
  return range
}

function selectRange(range: Range) {
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const imageFilesOf = (list: FileList | null | undefined): File[] =>
  Array.from(list ?? []).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))

const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })

interface ToolButton {
  key: string
  icon: LucideIcon
  label: string
  run: () => void
  active?: boolean
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  minHeight = 200,
}: {
  value: string
  onChange: (html: string) => void
  onBlur?: () => void
  placeholder?: string
  minHeight?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedRange = useRef<Range | null>(null)
  const emitted = useRef<string | null>(null)
  const dragging = useRef<{ kind: 'image'; node: HTMLImageElement } | { kind: 'text' } | null>(null)
  const [, force] = useState(0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkEditing, setLinkEditing] = useState(false)
  const [empty, setEmpty] = useState(() => isEmptyHtml(value ?? ''))
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null)
  const [uploads, setUploads] = useState(0)
  const [dropActive, setDropActive] = useState(false)

  useEffect(() => {
    try {
      document.execCommand('styleWithCSS', false, 'false')
    } catch {
      /* not supported — the sanitizer still strips any colour that slips in */
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (emitted.current !== null && value === emitted.current) return
    const clean = sanitizeRichText(value ?? '')
    if (el.innerHTML === clean || sanitizeRichText(el.innerHTML) === clean) {
      emitted.current = value ?? ''
      setEmpty(isEmptyHtml(el.innerHTML))
      return
    }
    if (el.contains(document.activeElement)) {
      emit()
      return
    }
    el.innerHTML = clean
    ensureTrailingBlock()
    setSelImg(null)
    emitted.current = value ?? ''
    setEmpty(isEmptyHtml(clean))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Keep the image overlay glued to the picture while scrolling / resizing, and
  // deselect when clicking away from the editor.
  useEffect(() => {
    if (!selImg) return
    const reposition = () => force((n) => n + 1)
    const onDocDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setSelImg(null)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('pointerdown', onDocDown)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('pointerdown', onDocDown)
    }
  }, [selImg])

  const emit = () => {
    const html = ref.current?.innerHTML ?? ''
    emitted.current = html
    setEmpty(isEmptyHtml(html))
    onChange(html)
  }

  const ensureTrailingBlock = (): boolean => {
    const el = ref.current
    const last = el?.lastElementChild
    if (!el || !last) return false
    const isImage = last.tagName === 'IMG'
    const wrapsOnlyImage = Boolean(last.querySelector('img')) && !last.textContent?.trim()
    if (!isImage && !wrapsOnlyImage) return false
    const p = document.createElement('p')
    p.appendChild(document.createElement('br'))
    el.appendChild(p)
    return true
  }

  const caretBeside = (node: Node, side: 'before' | 'after') => {
    const range = document.createRange()
    if (side === 'before') range.setStartBefore(node)
    else range.setStartAfter(node)
    range.collapse(true)
    ref.current?.focus()
    selectRange(range)
    setSelImg(null)
  }

  const insertHtml = (html: string, at?: Range | null) => {
    const el = ref.current
    if (!el) return
    el.focus()
    if (at && el.contains(at.commonAncestorContainer)) selectRange(at)
    document.execCommand('insertHTML', false, html)
    emit()
  }

  // ─── Image ingestion ──────────────────────────────────────────────────────
  const uploadImage = async (file: File): Promise<string> => {
    const passthrough = file.type === 'image/gif' && file.size <= MAX_UPLOAD_BYTES
    const { blob, dataUrl } = passthrough
      ? { blob: file as Blob, dataUrl: await readDataUrl(file) }
      : await processImage(file)
    try {
      const ext = blob.type === 'image/gif' ? 'gif' : blob.type === 'image/png' ? 'png' : 'jpg'
      const fd = new FormData()
      fd.append('file', new File([blob], `image.${ext}`, { type: blob.type || 'image/jpeg' }))
      const res = await uploadNoteImage(fd)
      // Rate-limited → show the countdown and keep the inline (data-URL) fallback.
      if (!handleRateLimit(res)) {
        if (res.status === 'ok') return res.url
        if (res.status === 'error') {
          // Upload reached the server but failed — surface it instead of silently
          // embedding a huge base64 blob, so misconfig is obvious.
          console.warn('[RichTextEditor] image upload failed:', res.message)
          toast.error(res.message ? `Image upload failed: ${res.message}` : 'Image upload failed — stored inline')
        }
        // status 'notConfigured' → expected without R2; keep inline fallback quietly.
      }
    } catch (err) {
      console.warn('[RichTextEditor] image upload error', err)
    }
    return dataUrl
  }

  const insertImages = async (files: File[], at?: Range | null) => {
    if (files.length === 0) return
    if (at) selectRange(at)
    const anchor = (() => {
      const sel = window.getSelection()
      return sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    })()

    setUploads((n) => n + files.length)
    try {
      const sources = await Promise.all(files.map((f) => uploadImage(f)))
      if (!ref.current) return
      const html = files
        .map((f, i) => {
          const alt = escapeText(f.name.replace(/\.[a-z0-9]+$/i, ''))
          return `<img src="${escapeText(sources[i])}" alt="${alt}" />`
        })
        .join('')
      insertHtml(sanitizeRichText(html), anchor)
      if (ensureTrailingBlock()) emit()
    } catch (err) {
      console.warn('[RichTextEditor] image insert failed', err)
      toast.error(t('editor.imageFailed'))
    } finally {
      setUploads((n) => Math.max(0, n - files.length))
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const images = imageFilesOf(e.clipboardData.files)
    if (images.length > 0) {
      e.preventDefault()
      void insertImages(images)
      return
    }
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    if (!html && !text) return
    e.preventDefault()
    insertHtml(html ? sanitizeRichText(html) : escapeText(text).replace(/\r?\n/g, '<br>'))
  }

  // ─── Drag & drop ──────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent) => {
    const tgt = e.target as HTMLElement
    if (tgt.tagName === 'IMG' && ref.current?.contains(tgt)) {
      dragging.current = { kind: 'image', node: tgt as HTMLImageElement }
      e.dataTransfer.effectAllowed = 'move'
      setSelImg(null)
    } else {
      dragging.current = { kind: 'text' }
    }
  }

  const onDragEnd = () => {
    dragging.current = null
    setDropActive(false)
  }

  const onDragOver = (e: React.DragEvent) => {
    const hasFiles = e.dataTransfer.types.includes('Files')
    if (dragging.current?.kind === 'text' && !hasFiles) return
    e.preventDefault()
    e.dataTransfer.dropEffect = dragging.current?.kind === 'image' ? 'move' : 'copy'
    if (hasFiles && !dropActive) setDropActive(true)
    const caret = caretRangeFromPoint(e.clientX, e.clientY)
    if (caret && ref.current?.contains(caret.commonAncestorContainer)) selectRange(caret)
  }

  const onDragLeave = (e: React.DragEvent) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setDropActive(false)
  }

  const onDrop = (e: React.DragEvent) => {
    const source = dragging.current
    const images = imageFilesOf(e.dataTransfer.files)
    const hasFiles = e.dataTransfer.types.includes('Files')
    if (source?.kind === 'text' && !hasFiles) return
    e.preventDefault()
    setDropActive(false)
    dragging.current = null

    const caret = caretRangeFromPoint(e.clientX, e.clientY)
    const target = caret && ref.current?.contains(caret.commonAncestorContainer) ? caret : null

    if (source?.kind === 'image') {
      const img = source.node
      if (!target || !img.isConnected) return
      target.collapse(true)
      target.insertNode(img)
      const after = document.createRange()
      after.setStartAfter(img)
      after.collapse(true)
      selectRange(after)
      setSelImg(img)
      ensureTrailingBlock()
      emit()
      return
    }

    if (hasFiles) {
      if (images.length > 0) void insertImages(images, target)
      else if (e.dataTransfer.files.length > 0) toast.error(t('editor.dropNotImage'))
      return
    }

    const html = e.dataTransfer.getData('text/html')
    const text = e.dataTransfer.getData('text/plain')
    if (!html && !text) return
    insertHtml(html ? sanitizeRichText(html) : escapeText(text).replace(/\r?\n/g, '<br>'), target)
  }

  // ─── Image manipulation ───────────────────────────────────────────────────
  const styleImg = (apply: (img: HTMLImageElement) => void) => {
    if (!selImg) return
    apply(selImg)
    emit()
    force((n) => n + 1)
  }

  const setImgWidth = (width: string) =>
    styleImg((img) => {
      img.style.width = width
      img.style.height = 'auto'
    })

  const alignImg = (mode: 'left' | 'center' | 'right') =>
    styleImg((img) => {
      img.style.float = mode === 'center' ? 'none' : mode
      img.style.display = mode === 'center' ? 'block' : 'inline'
      img.style.margin =
        mode === 'center' ? '0.75rem auto' : mode === 'left' ? '0.25rem 1rem 0.5rem 0' : '0.25rem 0 0.5rem 1rem'
    })

  const deleteImg = () => {
    if (!selImg) return
    selImg.remove()
    setSelImg(null)
    emit()
  }

  type Corner = 'nw' | 'ne' | 'sw' | 'se'

  const onResizeStart = (e: React.PointerEvent, corner: Corner) => {
    if (!selImg) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const img = selImg
    const startX = e.clientX
    const startW = img.getBoundingClientRect().width
    // Left-edge corners grow the image as the pointer moves left; right-edge
    // corners as it moves right. Height stays auto, so the aspect ratio holds.
    const dir = corner === 'ne' || corner === 'se' ? 1 : -1
    // Width of the editor's text column (excludes padding), so the image can't
    // be dragged wider than the content. Store as % → stays responsive and never
    // overflows on narrower views (mobile, the read-only detail).
    const editor = ref.current
    const cs = editor ? getComputedStyle(editor) : null
    const pad = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0
    const contentW = Math.max(1, (editor?.clientWidth ?? 1000) - pad)
    const onMove = (ev: PointerEvent) => {
      const wPx = Math.max(48, Math.min(startW + dir * (ev.clientX - startX), contentW))
      const pct = Math.round((wPx / contentW) * 1000) / 10
      img.style.width = `${pct}%`
      img.style.height = 'auto'
      force((n) => n + 1)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      emit()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const exec = (command: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
    force((n) => n + 1)
  }

  const isActive = (command: string) => {
    try {
      return document.queryCommandState(command)
    } catch {
      return false
    }
  }

  const blockTag = (): string => {
    try {
      const reported = document.queryCommandValue('formatBlock').toLowerCase()
      if (reported) return reported
    } catch {
      /* fall through to the DOM walk */
    }
    const root = ref.current
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (!root || !sel || sel.rangeCount === 0) return ''
    let node: Node | null = sel.getRangeAt(0).startContainer
    if (!root.contains(node)) return ''
    while (node && node !== root) {
      if (node.nodeType === 1) {
        const tag = (node as HTMLElement).tagName.toLowerCase()
        if (BLOCK_TAGS.has(tag)) return tag
      }
      node = node.parentNode
    }
    return ''
  }

  // Case-insensitive: the toolbar passes tags like 'H1', the browser reports 'h1'.
  const blockIs = (tag: string) => blockTag() === tag.toLowerCase()

  /** Back to ordinary body text — the way out of any heading or quote. */
  const setParagraph = () => {
    ref.current?.focus()
    // Chrome's `formatBlock` cannot unwrap a <blockquote>; `outdent` can.
    let guard = 0
    while (blockTag() === 'blockquote' && guard++ < 5) {
      document.execCommand('outdent')
    }
    // Angle-bracket form — required by Firefox, accepted everywhere else.
    document.execCommand('formatBlock', false, '<p>')
    emit()
    force((n) => n + 1)
  }

  const toggleBlock = (tag: string) => {
    if (blockIs(tag)) {
      setParagraph()
      return
    }
    ref.current?.focus()
    // Leave a quote before applying a heading, otherwise the heading ends up
    // nested inside the blockquote instead of replacing it.
    if (tag !== 'BLOCKQUOTE') {
      let guard = 0
      while (blockTag() === 'blockquote' && guard++ < 5) {
        document.execCommand('outdent')
      }
    }
    exec('formatBlock', `<${tag.toLowerCase()}>`)
  }

  const linkAt = (): HTMLAnchorElement | null => {
    const root = ref.current
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (!root || !sel || sel.rangeCount === 0) return null
    let node: Node | null = sel.getRangeAt(0).startContainer
    if (!root.contains(node)) return null
    while (node && node !== root) {
      if (node.nodeType === 1 && (node as HTMLElement).tagName === 'A') return node as HTMLAnchorElement
      node = node.parentNode
    }
    return null
  }

  const openLinkDialog = () => {
    const existing = linkAt()
    const sel = window.getSelection()
    if (existing && sel) {
      const range = document.createRange()
      range.selectNodeContents(existing)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    savedRange.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    setLinkUrl(existing?.getAttribute('href') ?? '')
    setLinkEditing(Boolean(existing))
    setLinkOpen(true)
  }

  const removeLink = () => {
    setLinkOpen(false)
    setLinkEditing(false)
    ref.current?.focus()
    if (savedRange.current) selectRange(savedRange.current)
    document.execCommand('unlink')
    emit()
    force((n) => n + 1)
  }

  const applyLink = () => {
    const raw = linkUrl.trim()
    setLinkOpen(false)
    setLinkEditing(false)
    if (!raw) return
    const url = /^(https?:|mailto:)/i.test(raw) ? raw : `https://${raw}`
    ref.current?.focus()
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    if (savedRange.current && savedRange.current.collapsed) {
      const label = escapeText(raw)
      document.execCommand('insertHTML', false, sanitizeRichText(`<a href="${escapeText(url)}">${label}</a>`))
    } else {
      document.execCommand('createLink', false, url)
    }
    emit()
  }

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = imageFilesOf(e.target.files)
    e.target.value = ''
    void insertImages(files)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (selImg && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      deleteImg()
      return
    }
    if (e.key === 'Escape' && selImg) {
      e.preventDefault()
      setSelImg(null)
      return
    }
    if (selImg && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault()
      caretBeside(selImg, e.key === 'ArrowLeft' ? 'before' : 'after')
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      openLinkDialog()
      return
    }
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey && blockTag() === 'li') {
      e.preventDefault()
      document.execCommand(e.shiftKey ? 'outdent' : 'indent')
      emit()
      force((n) => n + 1)
    }
  }

  const current = blockTag()
  const inLink = Boolean(linkAt())
  const groups: ToolButton[][] = [
    [
      {
        key: 'p',
        icon: Pilcrow,
        label: t('editor.paragraph'),
        run: setParagraph,
        active: current === 'p' || current === 'div',
      },
      { key: 'h1', icon: Heading1, label: t('editor.h1'), run: () => toggleBlock('H1'), active: current === 'h1' },
      { key: 'h2', icon: Heading2, label: t('editor.h2'), run: () => toggleBlock('H2'), active: current === 'h2' },
    ],
    [
      { key: 'bold', icon: Bold, label: t('editor.bold'), run: () => exec('bold'), active: isActive('bold') },
      { key: 'italic', icon: Italic, label: t('editor.italic'), run: () => exec('italic'), active: isActive('italic') },
      {
        key: 'underline',
        icon: Underline,
        label: t('editor.underline'),
        run: () => exec('underline'),
        active: isActive('underline'),
      },
      {
        key: 'strike',
        icon: Strikethrough,
        label: t('editor.strike'),
        run: () => exec('strikeThrough'),
        active: isActive('strikeThrough'),
      },
    ],
    [
      {
        key: 'ul',
        icon: List,
        label: t('editor.bulletList'),
        run: () => exec('insertUnorderedList'),
        active: isActive('insertUnorderedList'),
      },
      {
        key: 'ol',
        icon: ListOrdered,
        label: t('editor.numberedList'),
        run: () => exec('insertOrderedList'),
        active: isActive('insertOrderedList'),
      },
      {
        key: 'quote',
        icon: Quote,
        label: t('editor.quote'),
        run: () => toggleBlock('BLOCKQUOTE'),
        active: current === 'blockquote',
      },
    ],
    [
      {
        key: 'link',
        icon: Link2,
        label: inLink ? t('editor.linkEdit') : t('editor.link'),
        run: openLinkDialog,
        active: linkOpen || inLink,
      },
      { key: 'image', icon: ImageIcon, label: t('editor.image'), run: () => fileRef.current?.click() },
    ],
  ]

  return (
    <div ref={wrapRef} className="relative">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-2">
        {groups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <span className="mx-1 h-5 w-px bg-border" />}
            {group.map((b) => (
              <button
                key={b.key}
                type="button"
                title={b.label}
                aria-label={b.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={b.run}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  b.active && 'bg-accent text-foreground',
                )}
              >
                <b.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        ))}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={onPickImage}
        />
      </div>

      {/* Link popover */}
      {linkOpen && (
        <div className="absolute left-3 top-12 z-30 flex items-center gap-1.5 rounded-lg border border-border bg-popover p-1.5 shadow-2xl">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              }
              if (e.key === 'Escape') setLinkOpen(false)
            }}
            placeholder={t('editor.linkPrompt')}
            className="w-56 rounded-md border border-border bg-input/40 px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={applyLink}
            title={linkEditing ? t('editor.linkUpdate') : t('editor.linkApply')}
            aria-label={linkEditing ? t('editor.linkUpdate') : t('editor.linkApply')}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-4 w-4" />
          </button>
          {linkEditing && (
            <button
              type="button"
              onClick={removeLink}
              title={t('editor.linkRemove')}
              aria-label={t('editor.linkRemove')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Unlink className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            aria-label={t('editor.cancel')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="relative">
        {empty && placeholder && (
          <div
            aria-hidden
            className="rte pointer-events-none absolute inset-x-0 top-0 select-none px-5 py-4 text-muted-foreground"
          >
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder || t('editor.ariaLabel')}
          onInput={() => {
            emit()
            if (selImg) setSelImg(null)
          }}
          onPaste={onPaste}
          onBlur={onBlur}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={(e) => {
            const tgt = e.target as HTMLElement
            setSelImg(tgt.tagName === 'IMG' ? (tgt as HTMLImageElement) : null)
          }}
          onKeyDown={onKeyDown}
          onMouseUp={() => force((n) => n + 1)}
          onKeyUp={() => force((n) => n + 1)}
          className={cn('rte px-5 py-4', dropActive && 'rounded-b-xl ring-2 ring-inset ring-primary/60')}
          style={{ minHeight }}
        />
        {uploads > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-muted-foreground shadow-lg"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('editor.imageUploading')}
          </div>
        )}
      </div>

      {/* Image manipulation overlay */}
      {selImg &&
        selImg.isConnected &&
        wrapRef.current &&
        (() => {
          const ir = selImg.getBoundingClientRect()
          const wr = wrapRef.current.getBoundingClientRect()
          const top = ir.top - wr.top
          const left = ir.left - wr.left
          const sizes: { key: string; label: string; width: string }[] = [
            { key: 's', label: t('editor.imgSmall'), width: '25%' },
            { key: 'm', label: t('editor.imgMedium'), width: '50%' },
            { key: 'l', label: t('editor.imgLarge'), width: '75%' },
            { key: 'full', label: t('editor.imgFull'), width: '100%' },
          ]
          const aligns: { key: 'left' | 'center' | 'right'; label: string; icon: LucideIcon }[] = [
            { key: 'left', label: t('editor.alignLeft'), icon: AlignLeft },
            { key: 'center', label: t('editor.alignCenter'), icon: AlignCenter },
            { key: 'right', label: t('editor.alignRight'), icon: AlignRight },
          ]
          const align: 'left' | 'center' | 'right' | null =
            selImg.style.float === 'left'
              ? 'left'
              : selImg.style.float === 'right'
                ? 'right'
                : selImg.style.display === 'block'
                  ? 'center'
                  : null
          const width = selImg.style.width
          // A drag handle on every corner — resize the image from whichever
          // corner feels natural. Diagonal cursors mirror the corner direction.
          const handles: { key: Corner; top: number; left: number; cursor: string }[] = [
            { key: 'nw', top, left, cursor: 'cursor-nwse-resize' },
            { key: 'ne', top, left: left + ir.width, cursor: 'cursor-nesw-resize' },
            { key: 'sw', top: top + ir.height, left, cursor: 'cursor-nesw-resize' },
            { key: 'se', top: top + ir.height, left: left + ir.width, cursor: 'cursor-nwse-resize' },
          ]
          return (
            <>
              {/* Selection ring */}
              <div
                className="pointer-events-none absolute z-20 rounded-sm ring-2 ring-primary ring-offset-1 ring-offset-background"
                style={{ top, left, width: ir.width, height: ir.height }}
              />
              {/* Resize handles (all four corners) */}
              {handles.map((h) => (
                <div
                  key={h.key}
                  role="button"
                  aria-label={t('editor.imgResize')}
                  title={t('editor.imgResize')}
                  onPointerDown={(e) => onResizeStart(e, h.key)}
                  className={cn(
                    'absolute z-30 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow',
                    h.cursor,
                  )}
                  style={{ top: h.top, left: h.left }}
                />
              ))}
              {/* Floating toolbar */}
              <div
                onMouseDown={(e) => e.preventDefault()}
                className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-2xl"
                style={{ top: Math.max(0, top - 42), left }}
              >
                {sizes.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    title={s.label}
                    aria-pressed={width === s.width}
                    onClick={() => setImgWidth(s.width)}
                    className={cn(
                      'rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                      width === s.width && 'bg-accent text-foreground',
                    )}
                  >
                    {s.label[0]}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-border" />
                {aligns.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    title={a.label}
                    aria-label={a.label}
                    aria-pressed={align === a.key}
                    onClick={() => alignImg(a.key)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                      align === a.key && 'bg-accent text-foreground',
                    )}
                  >
                    <a.icon className="h-4 w-4" />
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-border" />
                <button
                  type="button"
                  title={t('editor.imgWriteBeside')}
                  aria-label={t('editor.imgWriteBeside')}
                  onClick={() => {
                    if (ensureTrailingBlock()) emit()
                    caretBeside(selImg, 'after')
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <TextCursor className="h-4 w-4" />
                </button>
                <span className="mx-1 h-5 w-px bg-border" />
                <button
                  type="button"
                  title={t('editor.imgDelete')}
                  aria-label={t('editor.imgDelete')}
                  onClick={deleteImg}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </>
          )
        })()}
    </div>
  )
}
