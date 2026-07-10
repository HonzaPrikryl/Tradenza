'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

// Cover + thumbnail strip with a full-screen lightbox. The first image (per the
// user's saved order) is the cover; the rest sit beneath as thumbnails.
export default function StrategyImageGallery({ images }: { images: string[] }) {
  const [index, setIndex] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const open = index !== null
  const count = images.length

  useEffect(() => setMounted(true), [])

  const close = useCallback(() => setIndex(null), [])
  const step = useCallback((delta: number) => setIndex((i) => (i === null ? i : (i + delta + count) % count)), [count])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, step])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (count === 0) return null

  return (
    <>
      <button type="button" onClick={() => setIndex(0)} className="group block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[0]}
          alt=""
          className="max-h-80 w-full rounded-lg border border-border object-cover transition-opacity group-hover:opacity-90"
        />
      </button>

      {count > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.slice(1).map((url, i) => (
            <button
              type="button"
              key={url}
              onClick={() => setIndex(i + 1)}
              className="group overflow-hidden rounded-md border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-16 w-16 object-cover transition-opacity group-hover:opacity-90" />
            </button>
          ))}
        </div>
      )}

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/80 p-4 backdrop-blur-sm"
            onClick={close}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={close}
              aria-label={t('strategies.detail.galleryClose')}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>

            {count > 1 && (
              <>
                <GalleryNav side="left" label={t('strategies.detail.galleryPrev')} onClick={() => step(-1)} />
                <GalleryNav side="right" label={t('strategies.detail.galleryNext')} onClick={() => step(1)} />
              </>
            )}

            {/* Image area — flexes to fill, image centred and fully contained. */}
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[index]}
                alt=""
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>

            {/* Thumbnail strip + counter, pinned below the image. */}
            {count > 1 && (
              <div className="mt-3 flex shrink-0 flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="text-xs tabular-nums text-white/70">
                  {index + 1} / {count}
                </div>
                <div className="flex max-w-full gap-2 overflow-x-auto rounded-lg bg-black/40 p-2">
                  {images.map((url, i) => (
                    <button
                      type="button"
                      key={url}
                      onClick={() => setIndex(i)}
                      aria-current={i === index}
                      className={cn(
                        'h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition',
                        i === index ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-90',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

function GalleryNav({ side, label, onClick }: { side: 'left' | 'right'; label: string; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20',
        side === 'left' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  )
}
