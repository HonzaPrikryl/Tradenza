import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query and re-render when it changes.
 * Returns `false` on the server and during the first paint, then the real match.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
