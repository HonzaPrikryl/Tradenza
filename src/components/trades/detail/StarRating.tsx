'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'

export default function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <span className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const full = i + 1
        const half = i + 0.5
        const fill = shown >= full ? 1 : shown >= half ? 0.5 : 0
        return (
          <span key={i} className="relative h-5 w-5">
            <Star className="absolute inset-0 h-5 w-5 fill-muted/40 text-muted-foreground/70" />
            {fill > 0 && (
              <span className="absolute left-0 top-0 h-full overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              </span>
            )}
            <button
              type="button"
              onMouseEnter={() => setHover(half)}
              onClick={() => onChange(half)}
              aria-label={`${half}/5`}
              className="absolute left-0 top-0 z-10 h-full w-1/2"
            />
            <button
              type="button"
              onMouseEnter={() => setHover(full)}
              onClick={() => onChange(full)}
              aria-label={`${full}/5`}
              className="absolute right-0 top-0 z-10 h-full w-1/2"
            />
          </span>
        )
      })}
    </span>
  )
}
