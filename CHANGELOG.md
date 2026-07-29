# Changelog

All notable changes to Tradenza are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) —
pre-1.0, minor versions may contain breaking changes (called out explicitly
when they happen).

Each released version is tagged `vX.Y.Z`, which is also what publishes the
matching `ghcr.io/honzaprikryl/tradenza` image. See
[CONTRIBUTING.md → Releasing](CONTRIBUTING.md#releasing) for the process.

## [Unreleased]

### Added

- **Images get into a note the way you'd expect** — drag a picture in from your
  desktop, drop several at once, or paste one straight from the clipboard. Each
  upload says so while it runs. With object storage configured the image is
  uploaded and the note stores a URL; without it the image is embedded inline,
  so a self-hosted instance with no bucket behaves the same, only heavier.
  Dragging an image that is already in the note moves it to wherever you drop
  it, rather than duplicating it at the end.
- **Links can be edited after you write them** — clicking an existing link
  offers _Edit_, _Update_ and _Remove_ instead of making you delete the text and
  write it again.
- **A way past a floated image** — an image with text wrapping around it used to
  swallow the caret, with no way to start the line beside or after it. The image
  overlay now offers _Write next to the image_, and a note that ends on an image
  always keeps an empty line under it.
- **Habits are managed in two sections, not one list** — the Daily side of
  _Manage_ now separates **Avoidance** from **Building** exactly the way trading
  splits **Constraint** from **Task**: same colours, same two-tier shape, each
  with its own empty state. One combined list could only ever say "no habits
  yet", never "nothing you're trying to stop yet".
- **The Daily tab explains itself when it's empty** — the first-run state now
  describes the two kinds of habit and what tracking them buys you, mirroring
  the trading empty state instead of showing a single flat sentence.

### Changed

- **The landing page is keyboard- and screen-reader-legible.** Every link and
  button shows a visible focus ring, footer column headings sit at the right
  level in the document outline, the decorative dashboard mock-up is hidden from
  assistive tech, and the scroll-reveal animations respect
  `prefers-reduced-motion` and no longer delay content that is already on screen
  when the page loads. The footer also gained a direct _Sign in_ link.
- The Discipline page's widgets were tightened up — a shorter by-weekday chart
  and a shorter consistency list — so the year heatmap, the day panel and the
  breakdown fit on one screen more often.

### Fixed

- **Pasted text no longer disappears in the other theme.** Content pasted from
  Word, Notion or a web page carries hard-coded colours (`color: rgb(0, 0, 0)`),
  which survived a theme switch and left notes rendering black on black. Colour,
  background and font declarations are now stripped on the way in and ignored on
  the way out, so note text always inherits the theme. Layout-related styling —
  image size, float, alignment — is kept.
- **A daily note no longer resets while you're writing it.** A background
  refresh could replay the last saved value over unsaved edits.
- **The unlogged-days prompt appears once.** The stats view renders in three
  places on the Discipline page and the "these days broke your streak" card was
  being built in each of them.
- Day-performance cards no longer overflow their row on narrow screens.

### Security

- **Rich-text content is sanitized on both sides of storage.** Daily notes,
  trade notes and strategy descriptions strip `<script>`, event-handler
  attributes and `javascript:` URLs when saved, and the strategy description —
  the one place the HTML is written back into the page with
  `dangerouslySetInnerHTML` — is sanitized again at render time. Content already
  in the database is therefore covered without a migration or any manual
  cleanup.

## [0.3.0] - 2026-07-28

Discipline grows a second half. Alongside your trading rules there is now a
**Daily** tab for the habits that decide how you show up — sleep, gym, screens,
reading — scored on the same model but with its own tolerance for a slip. Both
sides gain days you can mark as _not counted_, an honest `Not logged` state for
days you never filled in, and one rule that now holds everywhere: **a change to
a rule applies from today and never re-scores a day you already lived through.**

**Upgrading.** Existing deployments need no action beyond pulling the new image
— the container entrypoint applies migrations `0015`–`0018` on start, and all
four are additive (one new table, two new columns, one new enum; no data is
rewritten or dropped). Your rules keep their schedule and every past day keeps
its score. Two visible changes worth knowing about: the Discipline page's tabs
are now **Trading · Daily · Manage** (was _Overview · Rules_), and a rule's
**mode is fixed once the rule exists** — it decides how every already-logged day
is read back, so switching it mid-life would rewrite history. To change a mode,
delete the rule (its past days keep their score) and add a new one.

### Added

- **Daily habits** — a second Discipline domain, tracked separately from
  trading and never affecting your trading day colour. Own year heatmap,
  streaks, 30-day completion, per-habit consistency, by-weekday breakdown, and
  a _"Do your habits pay off?"_ widget splitting your trading days by whether
  you kept each habit.
- **Rule modes** — every rule is now either a **task** you tick off (_building_)
  or a **constraint** you must not break, and constraints come in two
  tolerances: **strict** for trading (one breach reddens the day — a risk limit
  has no warning tier) and **avoidance** for habits (_never miss twice_: one
  slip is a warning, two scheduled days running turns the day red). Constraints
  are satisfied by default, are breached by logging them, and never count
  toward a day's `x/y` counter or completion rate — a day nobody touched can no
  longer read as "2/5 done".
- **Days that don't count** — mark a holiday, an illness or any day you're away
  and it drops out of every average with your streak carrying straight over it.
  Pick what it covers (whole day, trading only, daily only), or mark a whole
  stretch at once, up to 31 days. A day you nonetheless traded on, or kept your
  habits through, counts anyway — the excuse removes the obligation, never the
  record.
- **`Not logged` as its own day state** — a scheduled day you never filled in is
  no longer scored as a bad day. It is excluded from every rate, trend point and
  payoff bucket ("which weekday do I slip?" stopped quietly answering "which
  weekday do I forget to log?"), while still costing what silence should: it
  scores zero in the headline 30-day figure and breaks the clean streak. When it
  does break one, the page says which days did it and offers to fill them in or
  excuse them in a click. Back-filling any past day has no deadline.
- **Keyboard-navigable heatmaps** — the year grid is reachable with the arrow
  keys and every cell carries an accessible name saying exactly what its tooltip
  says (date, verdict, tallies), instead of 365 unlabelled buttons whose meaning
  existed only on hover.
- **Manage tab** — one place to create, edit, reorder, pause and delete both
  lists, with the trading and daily sets switchable rather than duplicated.

### Changed

- **Discipline tabs** are now _Trading · Daily · Manage_.
- **A rule's mode is immutable after creation.** It defines how every logged row
  is interpreted, so flipping it would reinterpret history — a green year could
  turn red on one click. The dialog shows the chosen mode and points at the way
  out (delete + recreate).
- **A scheduled day you never logged now scores zero in the 30-day figure.**
  Excluding it made silence the cheapest option: log a day you fell short and
  the number drops, forget the same day and it doesn't. The coverage line
  underneath (`x of y days logged`) says how much of the figure is real
  recording. Diagnostics (per-rule, weekday, payoff) still ignore unlogged days
  on purpose.
- **Starter trading rules now land on Mon–Fri** instead of every day, so a fresh
  account doesn't paint every weekend as a missed process day.
- **Deleting a rule is a soft delete.** It stops applying from today and keeps
  counting toward the days it governed, so past scores stay intact.

### Fixed

- **Changing a rule's schedule no longer rewrites your history.** `active_days`
  was a single column read back over every day a rule had ever governed, so
  moving a habit from Mon–Fri to every day re-scored a year of Saturdays as
  missed process days, and narrowing a schedule deleted verdicts that had been
  earned — the heatmap, the streaks and the by-weekday breakdown all changed
  shape retroactively. Superseded schedules are now kept as closed segments (new
  `progress_rule_schedules` table) and every scorer reads the schedule that was
  in force on the day it is scoring. Rules that were never edited need no
  migration and read exactly as before.
- **Pausing a rule now holds.** A paused rule was excluded only while the day was
  still today, so paused days silently counted as misses once they slid into the
  past. A pause is recorded as a stretch with nothing scheduled and stays
  excluded. Rules paused before this release keep the old behaviour — there is
  no honest pause date to read for them.
- **An archived rule can no longer be edited by a stale client.** `updateRule`
  matched on id and user only, so a client holding a deleted rule could rewrite
  its schedule and re-score the days it had governed.
- **Adding the starter set twice no longer stacks duplicates.** The check and the
  insert were two round-trips with a window between them; the guard is now part
  of the write (`INSERT … SELECT … WHERE NOT EXISTS`), so a double-click or a
  second tab inserts nothing.

## [0.2.0] - 2026-07-27

True self-hosting: Tradenza now runs against any standard PostgreSQL and ships
a batteries-included Docker setup.

**Upgrading.** Existing Vercel + Neon deployments need no action — the Neon
driver is still selected automatically for `…neon.tech` hosts and no schema
changed in this release. New self-hosters: copy `.env.example` to `.env` and
set `POSTGRES_PASSWORD` plus the Clerk keys before the first
`docker compose up`. Full guide in [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md).

### Added

- **PostgreSQL driver auto-detection** — `…neon.tech` hosts keep the Neon
  serverless HTTP driver; any other host uses node-postgres with a connection
  pool. Override with `DATABASE_DRIVER=pg|neon`, tune with `DATABASE_POOL_MAX`.
- **Docker self-hosting** — multi-stage `Dockerfile` (standalone output,
  non-root, health check) and `docker-compose.yml` with bundled Postgres 16.
  Database migrations run automatically on container start
  (`SKIP_MIGRATIONS=1` to opt out for multi-replica setups).
- **Published images** — every `v*` tag builds and pushes
  `ghcr.io/honzaprikryl/tradenza` (GitHub Actions → GHCR), then opens the
  matching GitHub release with this file's entry as its notes. Prebuilt images
  are compiled with a placeholder Clerk publishable key that the entrypoint
  swaps for the real one at startup.
- **`runAtomic` helper** (`src/lib/db/atomic.ts`) — driver-agnostic atomic
  multi-statement writes: `batch` on neon-http, a real transaction on
  node-postgres. New project convention: never call `db.transaction` /
  `db.batch` directly.
- **Self-hosting guide** — [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md)
  (prebuilt images, external databases, reverse proxy + HTTPS, backups,
  upgrades, multi-replica migrations).
- **CI production build** — the standalone `next build` now runs on pushes to
  `main` and on every pull request, so packaging regressions surface before a
  release instead of during one.
- **New environment variables** — `DATABASE_DRIVER`, `DATABASE_POOL_MAX`,
  `POSTGRES_PASSWORD`, `APP_PORT`, `POSTGRES_PORT`, `SKIP_MIGRATIONS`. All are
  optional for the hosted setup; see [`.env.example`](.env.example).

### Changed

- Environment validation runs at server boot instead of during `next build`,
  so images can be built without runtime secrets.
- Documentation now speaks generic PostgreSQL first; Neon remains documented
  as the provider behind the hosted instance (tradenza.dev).
- The bundled Postgres container publishes on `127.0.0.1:5432`, so local
  development can run against the Docker database without exposing it to the
  network.
- Unexpected server-action failures append the underlying cause to the error
  message on `NODE_ENV=development`. Every other environment keeps the
  sanitized message, so nothing leaks to users.
- `@types/papaparse` moved from `dependencies` to `devDependencies`.

### Fixed

- **Renaming or recoloring a tag category no longer fails on Neon** —
  `updateTagGroup` used `db.transaction`, which the neon-http driver does not
  support; it now goes through `runAtomic`.
- Account data purge is atomic on both drivers (it previously relied on the
  Neon-only `db.batch`).

## [0.1.0] - 2026-06-29

Initial public baseline: trade journal with CSV import, customizable widget
dashboard, statistics, strategies & playbooks, discipline tracking, tags,
prop-firm trading accounts, candle charts, PWA — running on Next.js 15,
Drizzle ORM, PostgreSQL (Neon) and Clerk.

[unreleased]: https://github.com/HonzaPrikryl/tradenza/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.3.0
[0.2.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.2.0
[0.1.0]: https://github.com/HonzaPrikryl/tradenza/commits/main
