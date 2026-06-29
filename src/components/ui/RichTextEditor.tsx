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
  Image as ImageIcon,
  Heading1,
  Heading2,
  Check,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { uploadNoteImage } from '@/lib/actions/uploads'

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
  const [, force] = useState(0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the image overlay glued to the picture while scrolling / resizing, and
  // deselect when clicking away from the editor.
  useEffect(() => {
    if (!selImg) return
    const reposition = () => force((n) => n + 1)
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setSelImg(null)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDocDown)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', onDocDown)
    }
  }, [selImg])

  const emit = () => onChange(ref.current?.innerHTML ?? '')

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

  const onResizeStart = (e: React.PointerEvent) => {
    if (!selImg) return
    e.preventDefault()
    const img = selImg
    const startX = e.clientX
    const startW = img.getBoundingClientRect().width
    // Width of the editor's text column (excludes padding), so the image can't
    // be dragged wider than the content. Store as % → stays responsive and never
    // overflows on narrower views (mobile, the read-only detail).
    const editor = ref.current
    const cs = editor ? getComputedStyle(editor) : null
    const pad = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0
    const contentW = Math.max(1, (editor?.clientWidth ?? 1000) - pad)
    const onMove = (ev: PointerEvent) => {
      const wPx = Math.max(48, Math.min(startW + (ev.clientX - startX), contentW))
      const pct = Math.round((wPx / contentW) * 1000) / 10
      img.style.width = `${pct}%`
      img.style.height = 'auto'
      force((n) => n + 1)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      emit()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
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
  const blockIs = (tag: string) => {
    try {
      return document.queryCommandValue('formatBlock').toLowerCase() === tag
    } catch {
      return false
    }
  }
  const toggleBlock = (tag: string) => exec('formatBlock', blockIs(tag) ? 'P' : tag)

  const openLinkDialog = () => {
    const sel = window.getSelection()
    savedRange.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    setLinkUrl('')
    setLinkOpen(true)
  }

  const applyLink = () => {
    const raw = linkUrl.trim()
    setLinkOpen(false)
    if (!raw) return
    const url = /^(https?:|mailto:)/i.test(raw) ? raw : `https://${raw}`
    ref.current?.focus()
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    if (savedRange.current && savedRange.current.collapsed) {
      document.execCommand('insertHTML', false, `<a href="${url}">${raw}</a>`)
    } else {
      document.execCommand('createLink', false, url)
    }
    emit()
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { blob, dataUrl } = await processImage(file)
      // Prefer uploading to object storage and inserting a URL; fall back to an
      // inline data URL if storage isn't configured or the upload fails.
      let src = dataUrl
      try {
        const ext = blob.type === 'image/png' ? 'png' : 'jpg'
        const fd = new FormData()
        fd.append('file', new File([blob], `image.${ext}`, { type: blob.type || 'image/jpeg' }))
        const res = await uploadNoteImage(fd)
        if (res.status === 'ok') {
          src = res.url
        } else if (res.status === 'error') {
          // Upload reached the server but failed — surface it instead of silently
          // embedding a huge base64 blob, so misconfig is obvious.
          console.warn('[RichTextEditor] image upload failed:', res.message)
          toast.error(res.message ? `Image upload failed: ${res.message}` : 'Image upload failed — stored inline')
        }
        // status 'notConfigured' → expected without R2; keep inline fallback quietly.
      } catch (err) {
        console.warn('[RichTextEditor] image upload error', err)
      }
      ref.current?.focus()
      document.execCommand('insertImage', false, src)
      emit()
    } catch {
      /* noop */
    }
  }

  const groups: ToolButton[][] = [
    [
      { key: 'h1', icon: Heading1, label: t('editor.h1'), run: () => toggleBlock('H1'), active: blockIs('h1') },
      { key: 'h2', icon: Heading2, label: t('editor.h2'), run: () => toggleBlock('H2'), active: blockIs('h2') },
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
        active: blockIs('blockquote'),
      },
    ],
    [
      { key: 'link', icon: Link2, label: t('editor.link'), run: openLinkDialog, active: linkOpen },
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
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
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
            aria-label={t('editor.linkApply')}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-4 w-4" />
          </button>
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
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={() => {
          emit()
          if (selImg) setSelImg(null)
        }}
        onBlur={onBlur}
        onClick={(e) => {
          const tgt = e.target as HTMLElement
          setSelImg(tgt.tagName === 'IMG' ? (tgt as HTMLImageElement) : null)
        }}
        onMouseUp={() => force((n) => n + 1)}
        onKeyUp={() => force((n) => n + 1)}
        className="rte px-5 py-4"
        style={{ minHeight }}
      />

      {/* Image manipulation overlay */}
      {selImg &&
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
          return (
            <>
              {/* Selection ring */}
              <div
                className="pointer-events-none absolute z-20 rounded-sm ring-2 ring-primary ring-offset-1 ring-offset-background"
                style={{ top, left, width: ir.width, height: ir.height }}
              />
              {/* Resize handle (bottom-right) */}
              <div
                role="button"
                aria-label={t('editor.imgResize')}
                title={t('editor.imgResize')}
                onPointerDown={onResizeStart}
                className="absolute z-30 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow"
                style={{ top: top + ir.height, left: left + ir.width }}
              />
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
                    onClick={() => setImgWidth(s.width)}
                    className="rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                    onClick={() => alignImg(a.key)}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <a.icon className="h-4 w-4" />
                  </button>
                ))}
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
