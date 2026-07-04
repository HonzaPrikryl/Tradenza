export const GITHUB_URL = 'https://github.com/HonzaPrikryl/tradenza'
export const SPONSOR_URL = 'https://github.com/sponsors/HonzaPrikryl'
export const COFFEE_URL = 'https://www.buymeacoffee.com/HonzaPrikryl'
export const DOCS_URL = 'https://github.com/HonzaPrikryl/tradenza/blob/main/docs/UX_UI.md'
export const LICENSE_URL = 'https://github.com/HonzaPrikryl/tradenza/blob/main/LICENSE'
export const CONTRIBUTE_URL = 'https://github.com/HonzaPrikryl/tradenza/blob/main/CONTRIBUTING.md'
// Landing page canonical URL — the marketing domain, not the app subdomain.
export const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://tradenza.dev'

// The app (post-login) lives on its own host in production. Auth and dashboard
// links from the landing page point there directly so they work regardless of
// which domain serves the landing page (and skip an extra middleware redirect).
//
// When unset (local dev, single-host), this is empty so the links stay relative
// and resolve against the current origin (localhost) instead of jumping to prod.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

/** Absolute app-domain URL in production; relative same-origin path locally. */
export const appUrl = (path: string) => `${APP_URL}${path}`
