<div align="center">

# Tradenza

**A professional, self-hostable trading journal for serious traders.**

Import your trades, analyze your edge with data, and build discipline — all in one place.

[![CI](https://github.com/HonzaPrikryl/tradenza/actions/workflows/ci.yml/badge.svg)](https://github.com/HonzaPrikryl/tradenza/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-34d399.svg)](CONTRIBUTING.md)

</div>

---

## About

Tradenza is an open-source trading journal I originally built for my own trading. After living in it for a while, I decided to release it to the community — free to use, free to self-host, and open to contributions.

It is designed for traders who want to improve through data rather than feelings: log every trade, review the chart and your execution, track the statistics that actually matter, and hold yourself accountable to your own trading rules.

> **Status:** Active development by a solo maintainer. The app is feature-rich and used daily, but it is pre-1.0 — expect rough edges and breaking changes. Issues and pull requests are very welcome.

## Highlights

- **Customizable dashboard** — drag-and-drop widget grid (powered by dnd-kit) with savable layout templates. KPI tiles (net P&L, win rate, profit factor, expectancy, average R:R, max drawdown, current streak…) plus larger widgets: a Zella-style score, cumulative P&L curve, net daily P&L, a P&L calendar, top symbols, and a performance breakdown.
- **Rich trade journal** — per-trade detail with an interactive price chart, multi-execution / multi-leg editor, running P&L, star rating, and structured notes (setup, emotions before/after, mistakes, lessons).
- **Strategies & playbooks** — define each setup you trade as a reusable strategy with its own entry and exit checklists, reference screenshots, and color. Assign a strategy to a trade, tick off the checklist you actually followed, and review per-strategy statistics alongside how closely your executions matched the plan. Retired setups can be archived without losing their trade history.
- **Deep statistics** — win rate (overall, longs, shorts), profit factor, expectancy, planned vs. realized R-multiples, hold-time analysis, consecutive win/loss streaks, day-level stats, fees/commissions breakdown, and more.
- **Discipline tracking** — define your trading rules, check them off each day, write daily reviews, and watch your streaks on a year-long heatmap. Rules can be paused or archived without losing history.
- **Trading accounts** — built around the prop-firm workflow (firm, phase, account size, starting balance, currency). Assign trades to accounts and filter everything by account.
- **Flexible import** — guided import wizard for CSV exports (large catalog of broker formats), with automatic de-duplication and a full import history.
- **Tags & categories** — color-coded tags grouped into categories (e.g. _Setup type_, _Mistake_), assignable to trades and usable as filters.
- **Futures-aware P&L** — built-in contract multipliers for common futures (ES, NQ, GC, CL, …) so P&L and R are computed correctly per instrument.
- **Global filters** — app-wide header to switch accounts, pick a date range (with presets), toggle the unit between **$** and **R**, and apply filters across every page.
- **Polished UX** — dark-first design with a light theme, responsive layout with a mobile navigation sheet, installable as a PWA, and consistent skeleton loading states throughout.

See [`docs/UX_UI.md`](docs/UX_UI.md) for a full UX/UI walkthrough of the screens, flows, and design system.

## Tech stack

| Area                          | Technology                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Framework                     | [Next.js 15](https://nextjs.org) (App Router, Server Actions) + React 19                                                         |
| Language                      | TypeScript                                                                                                                       |
| Styling                       | Tailwind CSS with custom HSL design tokens; MUI + Radix UI primitives; Emotion                                                   |
| Database                      | [PostgreSQL](https://www.postgresql.org) via [Neon](https://neon.tech) (serverless)                                              |
| ORM                           | [Drizzle ORM](https://orm.drizzle.team) + drizzle-kit                                                                            |
| Auth                          | [Clerk](https://clerk.com)                                                                                                       |
| Charts                        | [Recharts](https://recharts.org) (analytics) + [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) (candles) |
| Forms & validation            | Type-safe Server Actions with schema validation via [Zod](https://zod.dev)                                                       |
| CSV                           | [PapaParse](https://www.papaparse.com)                                                                                           |
| Drag & drop                   | [dnd-kit](https://dndkit.com)                                                                                                    |
| Notifications                 | [Sonner](https://sonner.emilkowal.ski)                                                                                           |
| Market data _(optional)_      | [Databento](https://databento.com) for historical OHLC candles                                                                   |
| Screenshots _(optional)_      | Cloudflare R2                                                                                                                    |
| Error monitoring _(optional)_ | [Sentry](https://sentry.io)                                                                                                      |
| Rate limiting _(optional)_    | [Upstash Redis](https://upstash.com) via `@upstash/ratelimit`                                                                    |
| Analytics _(optional)_        | [PostHog](https://posthog.com)                                                                                                   |
| Quality                       | Vitest, ESLint, Prettier, Husky + lint-staged, GitHub Actions CI                                                                 |

## Quick start

### Prerequisites

- **Node.js 20+** and npm
- A **Neon** (or any PostgreSQL) database — free tier is plenty
- A **Clerk** application for authentication — free tier is plenty

### 1. Clone & install

```bash
git clone https://github.com/HonzaPrikryl/tradenza.git
cd tradenza
npm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

The only **required** variables are the database URL and the Clerk keys; everything else is optional and unlocks extra features (see [Environment variables](#environment-variables)).

For local development use your **Clerk _Development_ instance** keys (`pk_test_…` / `sk_test_…`) — production (live) keys are locked to the production domain and error on `localhost`. See [Environments](#environments) for the full local/preview/production split.

### 3. Set up the database

Apply the versioned migrations to your database:

```bash
npm run db:migrate   # apply migrations in drizzle/ → DB
npm run db:studio    # (optional) open Drizzle Studio to inspect data
```

On a **fresh, empty** database this runs `drizzle/0000_baseline.sql` and builds the full schema. On an **existing** database (already populated) do the one-time baseline adoption first — see [Database & migrations](#database--migrations).

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, and you're in.

## Environment variables

| Variable                                                  | Required | Purpose                                                                                      |
| --------------------------------------------------------- | :------: | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                            |    ✅    | Neon / PostgreSQL connection string                                                          |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`                       |    ✅    | Clerk publishable key                                                                        |
| `CLERK_SECRET_KEY`                                        |    ✅    | Clerk secret key                                                                             |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `..._SIGN_UP_URL`       |    ✅    | Auth route paths (`/sign-in`, `/sign-up`)                                                    |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `..._SIGN_UP_URL` |    ✅    | Post-auth redirect (`/dashboard`)                                                            |
| `CLERK_WEBHOOK_SIGNING_SECRET`                            |    ▫️    | Verifies the Clerk `user.deleted` webhook that erases a deleted user's data (see below)      |
| `NEXT_PUBLIC_APP_URL`                                     |    ▫️    | Production app host (post-login). Enables host-based routing + Server Actions behind a proxy |
| `NEXT_PUBLIC_MARKETING_URL`                               |    ▫️    | Production marketing/landing host. Pairs with `NEXT_PUBLIC_APP_URL` for the domain split     |
| `DATABENTO_API_KEY`                                       |    ▫️    | Enables historical candle charts on the trade detail page                                    |
| `R2_*`                                                    |    ▫️    | Cloudflare R2 credentials for trade screenshots                                              |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_*`                      |    ▫️    | Error monitoring & source maps                                                               |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`     |    ▫️    | Per-user rate limiting (both required together; omit to disable — see below)                 |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`    |    ▫️    | Privacy-respecting analytics (PostHog EU, cookieless). Omit the key to disable analytics     |
| `ADMIN_EMAILS`                                            |    ▫️    | Comma-separated e-mails allowed into the internal `/admin` overview. Omit to disable admin   |
| `RESEND_API_KEY` / `FEEDBACK_*`                           |    ▫️    | Feedback e-mail notifications (Resend). Omit to disable.                                     |

✅ required · ▫️ optional. See [`.env.example`](.env.example) for the full annotated list.

## Rate limiting

Per-user rate limiting is **optional**, via [Upstash Redis](https://upstash.com). When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are unset it is disabled and the app behaves normally. To enable it, create a database in the [Upstash console](https://console.upstash.com) and add its REST URL + token to your environment (Upstash's free tier is more than enough).

Only write actions are limited; browsing and reading are never throttled. If someone goes too fast, the action is held back and a friendly countdown tells them when to try again. If Redis is ever unreachable, requests are allowed through rather than blocked.

| Action                   | Limit (per user)     |
| ------------------------ | -------------------- |
| Candle charts            | 10 / min · 100 / day |
| CSV / manual import      | 5 / min              |
| Create / update / delete | 60 / min             |

## Analytics

Product analytics is **optional** and privacy-respecting, via [PostHog](https://posthog.com) on its **EU** cloud. When `NEXT_PUBLIC_POSTHOG_KEY` is unset it is disabled and nothing is loaded. To enable it, create a project in the PostHog EU region and set `NEXT_PUBLIC_POSTHOG_KEY` (host defaults to `https://eu.i.posthog.com`).

It is deliberately minimal and cookieless: `persistence: 'memory'` (no cookies → no consent banner), autocapture and session recording are **off** (we never capture DOM text/inputs, which for a trading app could be financial data), and only a small set of meaningful product events is sent.

## Account & data deletion

Users can permanently delete their account and all associated data from **Settings → Global settings → Delete account** (trades, journal, tags, accounts, discipline history, and uploaded images).

## Environments

The app runs in three isolated environments. Each service provides its own separation, so local testing never touches production data or users.

| Layer          | Loaded from                                                          | Clerk                              | Database (Neon)           | Domain split                                             |
| -------------- | -------------------------------------------------------------------- | ---------------------------------- | ------------------------- | -------------------------------------------------------- |
| **Local**      | `.env.development` (committed) + `.env.local` (secrets, git-ignored) | Development instance (`pk_test_…`) | `dev` branch              | Off — everything on `http://localhost:3000`              |
| **Preview**    | Host dashboard → Preview env                                         | Development instance               | `dev` (or preview) branch | Off / per-branch URL                                     |
| **Production** | Host dashboard → Production env                                      | Production instance (`pk_live_…`)  | main branch               | On — `tradenza.dev` (landing) + `app.tradenza.dev` (app) |

How the separation works:

- **Auth (Clerk)** — Clerk ships two instances. The **Development** instance works on `localhost`; the **Production** instance is locked to the production domain. Use the matching key pair per environment.
- **Database (Neon)** — create a **branch** (`Neon → Branches → dev`) and use its connection string in `.env.local`, so local writes go to the dev branch and production keeps its own data.
- **Domain routing** — `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_MARKETING_URL` drive the host split in `middleware.ts`. They are **empty locally** (single host, no redirects) and set to the real domains only in the Production environment.

Local secrets live in `.env.local` (never committed). Production and preview values are set in your host's dashboard (e.g. Vercel → Settings → Environment Variables), scoped to the matching environment. The committed `.env.development` only pins non-secret defaults (the domain split stays off locally).

## Project structure

```
src/
├── app/
│   ├── (auth)/                 # Clerk sign-in / sign-up
│   ├── (app)/                  # Authenticated app (requires login)
│   │   ├── dashboard/          # Customizable widget dashboard
│   │   ├── trades/             # Trade list + detail [id]
│   │   ├── add-trade/          # Quick add entry
│   │   ├── stats/              # Detailed statistics
│   │   ├── progress/           # Discipline tracking + daily reviews
│   │   ├── strategies/         # Strategy playbooks + per-strategy stats [id]
│   │   ├── accounts/           # Trading accounts
│   │   ├── admin/              # Internal user & feedback overview
│   │   └── settings/           # Accounts, tags, trade & global settings, import history
│   ├── (wizard)/trade-import/  # Guided import flow (method → account → upload / manual)
│   ├── layout.tsx              # Root layout (Clerk, fonts, providers)
│   ├── page.tsx                # Landing page
│   ├── manifest.ts             # PWA manifest
│   └── globals.css             # Design tokens + Tailwind layers
├── components/                 # Feature + UI components (dashboard, trades, stats, progress, settings, ui…)
├── lib/
│   ├── db/                     # Drizzle schema + Neon client
│   ├── actions/                # Server Actions (trades, stats, import, accounts, tags, progress, dashboard, candles, strategies, wizard, admin, feedback)
│   ├── dashboard/              # Widget compute + default templates
│   ├── stats-compute.ts        # Pure statistics engine (unit-tested)
│   ├── progress-compute.ts     # Streak / discipline math
│   ├── futures.ts              # Futures contract multipliers
│   ├── trade-pnl.ts            # P&L calculations
│   └── ...                     # csv-columns, brokers, global-filters, date-tz, utils…
├── i18n/                       # Locale dictionaries (English; structured for more languages)
├── hooks/                      # Reusable React hooks
└── middleware.ts               # Clerk auth middleware

drizzle/      # Versioned migrations (generate + migrate) + MIGRATIONS.md
scripts/      # Maintenance utilities (cache clear, git-hook setup)
.github/      # CI workflow + funding config
```

## Database & migrations

The project uses **versioned migrations** (`drizzle-kit generate` + `migrate`). `db:push` is **not** used — on this database it errors with `42P16` because push tries to regenerate a primary key on a full-schema diff.

Everyday workflow:

```bash
# 1) edit src/lib/db/schema.ts
npm run db:generate -- --name my_change   # writes drizzle/000X_my_change.sql + meta snapshot
# 2) review & commit the generated SQL, then:
npm run db:migrate                         # applies pending migrations, records them in drizzle.__drizzle_migrations
```

Migrations are applied per environment by running `db:migrate` with that environment's `DATABASE_URL` (local dev DB, then production — see [Deployment](#deployment)).

Adopting migrations on an **existing** database (already has the tables but no migration journal) needs a **one-time baseline seed** so `migrate` doesn't try to recreate existing tables. The full procedure — including the production step — is documented in [`drizzle/MIGRATIONS.md`](drizzle/MIGRATIONS.md).

### Schema overview

| Table                                                    | Purpose                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `users`                                                  | User records synced from Clerk (email, name) — used by admin & data purge            |
| `accounts`                                               | Trading accounts (prop-firm model: firm, phase, size, currency)                      |
| `trades`                                                 | Core trade records (entry/exit, P&L, risk, journaling fields)                        |
| `strategies`                                             | Reusable playbooks: entry/exit checklists, reference images, color; linked to trades |
| `tag_groups` / `tags` / `trade_tags`                     | Color-coded tags grouped into categories, linked to trades                           |
| `screenshots`                                            | Trade screenshots (R2 URLs)                                                          |
| `market_candles`                                         | Cached OHLC data for the trade detail chart                                          |
| `import_logs`                                            | One row per import — counts, errors, created trade IDs                               |
| `dashboard_templates`                                    | Saved dashboard layouts per user                                                     |
| `progress_rules` / `rule_completions` / `daily_checkins` | Discipline rules, daily completions, and daily review notes                          |
| `feedback`                                               | In-app user feedback submissions (surfaced in the admin panel)                       |

## Importing trades

1. Export a CSV from your broker.
2. In Tradenza go to **Import / Export** (or **Add trade → Import**).
3. Follow the wizard: pick the method, choose the target account and broker, then drop the CSV.
4. Confirm — duplicates are detected and skipped automatically, and the result is recorded in your import history.

Manual single-trade entry is also available for trades you don't import.

## Deployment

### Vercel (recommended)

```bash
npx vercel
```

Add the environment variables in the Vercel dashboard, then apply migrations to your production database with `db:migrate` pointed at the production `DATABASE_URL` (`vercel env pull`, then `dotenv -e .env.production.local -- npm run db:migrate`). Adopting an already-populated production DB requires the one-time baseline seed in [`drizzle/MIGRATIONS.md`](drizzle/MIGRATIONS.md) first. The app is a standard Next.js project and will run on any platform that supports Next.js 15 (Vercel, Netlify, Fly.io, a Docker container, …).

A strict, nonce-based **Content-Security-Policy** is enforced per request in `src/middleware.ts` (production drops `unsafe-inline`/`unsafe-eval` in favour of a per-request nonce + `strict-dynamic`). If you add a third-party script or origin, extend the allow-list in `src/lib/csp.ts`.

### Backups & monitoring

The production database is the only irreplaceable state. Set up both a Neon point-in-time-recovery window and off-Neon logical dumps — the scheduled `DB Backup` workflow (`.github/workflows/db-backup.yml`) and full recovery steps are documented in [`docs/BACKUPS.md`](docs/BACKUPS.md).

A public **health check** lives at `/api/health` (returns `200` with `"status":"ok"` when the app can reach its database, `503` otherwise). Point an uptime monitor (UptimeRobot, Better Stack, …) at it, or use the bundled `Uptime` workflow (`.github/workflows/uptime.yml`). To report a security issue, see [`SECURITY.md`](SECURITY.md).

## Development

```bash
npm run dev            # start the dev server
npm run build          # production build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run test           # Vitest (watch)
npm run test:run       # Vitest (CI)
npm run test:coverage  # coverage report
npm run format         # Prettier --write
```

Git hooks (Husky + lint-staged) format and lint staged files on commit, and CI re-runs Prettier, ESLint, TypeScript, and the unit tests on every push and pull request. The statistics, P&L, futures, breakeven, and date/timezone logic are covered by Vitest unit tests in `src/lib`.

## Contributing

Contributions are welcome — whether it's a bug report, a feature idea, docs, or a pull request. Even though this started as a one-person project, the goal is for other developers to be able to jump in and improve it. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR.

## Support the project

Tradenza is free and always will be. If it helps your trading and you'd like to say thanks, a voluntary tip keeps the lights on and funds new features — entirely optional, never required.

- ☕ **[Buy Me a Coffee](https://www.buymeacoffee.com/HonzaPrikryl)**
- 💚 **[GitHub Sponsors](https://github.com/sponsors/HonzaPrikryl)**

## License

Tradenza is licensed under the **GNU Affero General Public License v3.0** — see [`LICENSE`](LICENSE).

In short: you are free to use, study, modify, and self-host it. If you run a modified version as a network service, you must make your modified source available to its users under the same license. This keeps the project and its derivatives open.

## Disclaimer

Tradenza is a journaling and analytics tool. It does **not** place trades, connect to live brokerage accounts, or provide financial advice. Nothing in this software is a recommendation to buy or sell any instrument. Trading involves risk; you are solely responsible for your decisions.
