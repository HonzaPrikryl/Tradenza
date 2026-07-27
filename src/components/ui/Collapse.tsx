'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Smooth mount/unmount for a block whose height nobody knows in advance.
//
// The usual `max-height` trick needs a magic number: too small and tall content is clipped,
// too large and the transition spends most of its duration animating empty space, which is
// what makes those collapses feel slack. This uses the `grid-template-rows: 0fr → 1fr`
// technique instead — the grid resolves the child's real height, so the animation lasts
// exactly as long as the content is tall, whatever that turns out to be.
//
// ── Spacing ──────────────────────────────────────────────────────────────────
// Put the gap on the CHILD (`className="mt-4"` on the card inside), not on the parent's
// `space-y-*`. The wrapper cancels its own outer margin, because that margin cannot
// animate: it would hold a gap open at 0 height, and the last frame of the collapse would
// still jump by one gap. A margin on the child sits inside the clipped area and shrinks
// along with everything else, so the whole thing moves as one.
//
// The wrapper is never removed from the tree, only emptied. Unmounting it looks tidier and
// is wrong: as the first child of a `space-y-*` parent it would hand its `> * + *` position
// to the next element, which then loses ITS margin — the page snaps by a gap at the exact
// moment the animation was supposed to end. A zero-height, zero-margin box contributes
// nothing to layout and keeps the sibling arithmetic still.
export default function Collapse({
  open,
  children,
  className,
  /** Milliseconds. Also drives how long the content stays mounted while closing. */
  duration = 250,
}: {
  open: boolean
  children: ReactNode
  className?: string
  duration?: number
}) {
  // `mounted` keeps the content in the tree across the closing transition; `shown` drives
  // the classes, one frame behind, so there is always a value to animate FROM.
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The last children seen while OPEN, replayed for the closing animation.
  //
  // Callers must guard content that reads data which disappears with the open state —
  // `blockers[0]` on a now-empty array throws while the element is merely being
  // constructed, and JSX children are constructed on every parent render regardless of
  // whether this component ends up showing them. Once guarded, they render `null` on the
  // way out, and without this the card would blank instantly and only an empty box would
  // animate. Holding the last real subtree keeps the exit showing what it is closing.
  const lastOpenChildren = useRef<ReactNode>(children)
  if (open) lastOpenChildren.current = children

  useEffect(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (open) {
      setMounted(true)
      // Double rAF: the first fires before the browser has painted the newly mounted
      // content at 0fr, so a single one can collapse into the same frame and skip the
      // transition entirely — the jump this component exists to remove.
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }
    setShown(false)
    // A timer rather than `onTransitionEnd`: that event never fires if the element is
    // hidden mid-transition (a tab switch, `display:none`), and the content would be
    // stranded in the tree, measurable and focusable, forever.
    closeTimer.current = setTimeout(() => setMounted(false), duration)
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [open, duration])

  return (
    <div
      // `inert` would be better, but React 18 doesn't pass it through; aria-hidden plus an
      // emptied subtree is enough to keep a closing card out of the reading order.
      aria-hidden={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none',
        // Cancels the parent's space-y margin in both directions — see the note above.
        '!my-0',
        shown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {/* The 0fr row only clips if this wrapper hides its own overflow. */}
      <div className="overflow-hidden">{mounted ? (open ? children : lastOpenChildren.current) : null}</div>
    </div>
  )
}
