# Security Policy

## Supported versions

Tradenza is under active development and ships from `main`. Security fixes are
applied to the latest released version only; there is no back-porting to older
tags. Please make sure you are running the latest version before reporting an
issue.

| Version         | Supported |
| --------------- | :-------: |
| Latest (`main`) |    ✅     |
| Older releases  |    ❌     |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.** Public issues
disclose the vulnerability to everyone before a fix is available.

Report privately using either of the following:

1. **GitHub Security Advisories** (preferred) — go to the repository's
   **Security → Report a vulnerability** tab to open a private advisory. This
   keeps the report, discussion, and fix in one place.
2. **Email** — <tradenza.help@gmail.com>. Use the subject line `SECURITY` so it
   is triaged quickly. If you want to send encrypted details, say so and we will
   arrange a key.

To help us reproduce and fix the issue quickly, please include as much of the
following as you can:

- The type of issue (e.g. auth bypass, SQL injection, XSS, IDOR, secret
  exposure, SSRF).
- Affected URL, endpoint, or file/line in the source.
- Step-by-step instructions to reproduce, including any request payloads.
- Proof-of-concept or exploit code, if you have it.
- The impact — what an attacker could do with it.

## What to expect

- **Acknowledgement** within **72 hours** of your report.
- An initial assessment and severity triage within **7 days**.
- Regular updates on remediation progress, and credit in the release notes once
  the fix ships — unless you prefer to remain anonymous.

## Scope

In scope: the application code in this repository (the Next.js app, API routes,
database access, authentication and authorization logic).

Out of scope, please report directly to the relevant vendor instead:

- Vulnerabilities in third-party services we rely on — **Clerk** (auth),
  **Neon** (database), **Vercel** (hosting), **Cloudflare R2** (storage),
  **Upstash** (rate limiting), **Sentry** (monitoring).
- Reports generated solely by automated scanners with no demonstrated impact.
- Denial-of-service via volumetric traffic, social engineering, or physical
  attacks.

## Safe harbor

We will not pursue or support legal action against researchers who act in good
faith, avoid privacy violations and data destruction, do not degrade the service
for other users, and give us reasonable time to remediate before any public
disclosure. Thank you for helping keep Tradenza and its users safe.
