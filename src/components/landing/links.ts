export const GITHUB_URL = 'https://github.com/HonzaPrikryl/tradenza'
export const SPONSOR_URL = 'https://github.com/sponsors/HonzaPrikryl'
export const COFFEE_URL = 'https://www.buymeacoffee.com/HonzaPrikryl'
export const DOCS_URL = 'https://github.com/HonzaPrikryl/tradenza/blob/main/docs/UX_UI.md'
export const LICENSE_URL = 'https://github.com/HonzaPrikryl/tradenza/blob/main/LICENSE'
export const CONTRIBUTE_URL = 'https://github.com/HonzaPrikryl/tradenza/blob/main/CONTRIBUTING.md'
// Landing page canonical URL — the marketing domain, not the app subdomain.
export const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://tradenza.dev'

// The app (post-login) lives on its own host. Auth and dashboard links from the
// landing page point there directly, so they work no matter which domain the
// landing page is served on (and skip an extra middleware redirect).
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.tradenza.dev'

/** Build an absolute URL to a path on the app domain. */
export const appUrl = (path: string) => `${APP_URL}${path}`
