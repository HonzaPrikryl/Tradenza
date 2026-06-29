'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void
  style?: React.CSSProperties
}

interface Meta {
  tops: number[]
  heights: number[]
  gap: number
  fromIndex: number
}

export default function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
}: {
  items: T[]
  getId: (item: T) => string
  onReorder: (orderedIds: string[]) => void
  renderItem: (item: T, ctx: { handleProps: DragHandleProps; dragging: boolean }) => React.ReactNode
  className?: string
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const meta = useRef<Meta | null>(null)
  const dragRef = useRef<{ fromIndex: number; targetIndex: number } | null>(null)
  const [state, setState] = useState<{ fromIndex: number; delta: number; targetIndex: number } | null>(null)
  const [noAnim, setNoAnim] = useState(false)

  const start = (index: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()

    const rects = refs.current.map((r) => r?.getBoundingClientRect() ?? null)
    const tops = rects.map((r) => r?.top ?? 0)
    const heights = rects.map((r) => r?.height ?? 0)
    const gap = rects.length > 1 && rects[0] && rects[1] ? Math.max(0, tops[1] - tops[0] - heights[0]) : 8
    meta.current = { tops, heights, gap, fromIndex: index }
    dragRef.current = { fromIndex: index, targetIndex: index }
    setState({ fromIndex: index, delta: 0, targetIndex: index })

    const startY = e.clientY
    const centers = tops.map((tp, i) => tp + heights[i] / 2)

    const move = (ev: PointerEvent) => {
      const delta = ev.clientY - startY
      const draggedCenter = centers[index] + delta
      let target = index
      if (delta > 0) {
        for (let i = index + 1; i < items.length; i++) if (draggedCenter >= centers[i]) target = i
      } else {
        for (let i = index - 1; i >= 0; i--) if (draggedCenter <= centers[i]) target = i
      }
      if (dragRef.current) dragRef.current.targetIndex = target
      setState((s) => (s ? { ...s, delta, targetIndex: target } : s))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const d = dragRef.current
      dragRef.current = null
      meta.current = null
      document.body.style.userSelect = ''
      setNoAnim(true)
      setState(null)
      if (d && d.targetIndex !== d.fromIndex) {
        const ids = items.map(getId)
        const [moved] = ids.splice(d.fromIndex, 1)
        ids.splice(d.targetIndex, 0, moved)
        onReorder(ids)
      }
      requestAnimationFrame(() => setNoAnim(false))
    }

    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const slot = meta.current ? (meta.current.heights[meta.current.fromIndex] ?? 0) + meta.current.gap : 0

  return (
    <div className={className}>
      {items.map((item, i) => {
        const dragging = state?.fromIndex === i
        let translate = 0
        if (state) {
          if (dragging) translate = state.delta
          else if (state.targetIndex > state.fromIndex && i > state.fromIndex && i <= state.targetIndex)
            translate = -slot
          else if (state.targetIndex < state.fromIndex && i < state.fromIndex && i >= state.targetIndex)
            translate = slot
        }
        return (
          <div
            key={getId(item)}
            ref={(el) => {
              refs.current[i] = el
            }}
            style={{
              transform: translate ? `translateY(${translate}px)` : undefined,
              transition: dragging || noAnim ? 'none' : 'transform 180ms cubic-bezier(0.2,0,0,1)',
              zIndex: dragging ? 30 : undefined,
              position: 'relative',
            }}
            className={cn(dragging && 'rounded-lg bg-card shadow-2xl')}
          >
            {renderItem(item, {
              handleProps: { onPointerDown: start(i), style: { touchAction: 'none' } },
              dragging,
            })}
          </div>
        )
      })}
    </div>
  )
}
