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

## [0.6.1] - 2026-08-05

A production fix and a small calendar addition. The dashboard could refuse to
load with a database error — it asked for too much at once — and the monthly
calendar now shows which days you actually wrote something about.

### Added

- **The calendar marks days that carry a note.** A small icon in the day cell
  when the day has a daily note, or any trade that day has one — including days
  with a note but no trades.

### Fixed

- **The dashboard could fail to load with a database connection error.** It
  fanned out to eleven queries at once, and the serverless driver opens a
  connection per query, so a single page view was a burst large enough for Neon
  to refuse — reported from production. The four getting-started checks are now
  one query and the template list is read once instead of twice, taking the page
  from eleven concurrent queries to three.

## [0.6.0] - 2026-08-05

Getting a trade journal out of Tradenza, and back in. The CSV export was a
one-way door: it flattened a trade for a spreadsheet and dropped everything
without a column — the fills, the risk plan, the tags, the screenshots — and
nothing read it back. This release adds a complete export that round-trips, and
teaches the spreadsheet export and importer to carry as much as a spreadsheet
can. Along the way, the trade detail page finally lets you close an open trade.

**Upgrading.** Migration `0022` drops four `trades` columns — `emotion_before`,
`emotion_after`, `mistakes`, `lessons`. No released version ever wrote to them,
so the migration cannot lose data; it applies itself on start. No new
environment variables. One thing to check: importing a backup uploads a file of
up to 10 MB, so a self-host behind a reverse proxy may need its own upload limit
raised (`client_max_body_size` on nginx). Vercel and the Docker image are
already fine.

### Added

- **Add executions from the trade detail page.** An open trade could not be
  closed — the editor only edited rows that already existed. The new button
  pre-fills the closing side and remaining quantity, and stays editable for
  scale-ins and partial take-profits.
- **Complete export (`.json`).** Carries every field a trade has: notes, rating,
  stop loss, take profit, planned R:R, risk amount, the tick-level risk plan and
  individual fills, checklist progress, tags with their groups, the strategy
  playbook, and images.
- **Import a complete export back.** Into another account or another Tradenza.
  Strategies and tags are matched by name and created when missing; trades
  already present are skipped, so importing twice changes nothing.
- **The import step accepts either file.** A Tradenza export is recognised by
  its contents and restored without a mapping step; broker CSVs work as before.
- Playbook criteria groups can be collapsed on the trade detail page.

### Changed

- **One Export action.** The choice is now made in the export dialog, described
  by where the file is going rather than by two similarly-named buttons.
- **The spreadsheet export carries more, and the importer reads it back.** Added
  status, asset class, exit quantity, multiplier, planned R:R and setup on the
  way out; on the way in it now also restores stop loss, take profit, planned
  R:R, risk amount, rating, setup, strategy and tags.
- **Every import ends on the same result card** — imported, already there,
  skipped, and an expandable list of what went wrong.

### Removed

- **The unused "emotion before/after", "mistakes" and "lessons" fields.** They
  existed in the database and in a validation schema, but no screen ever wrote
  or showed them — the actions that accepted them had no caller. What a trade
  needs saying about it goes in notes and tags, which the statistics can read;
  see migration `0022`.
- The **expiration date** column in manual entry. It was stored and never read:
  the chart identifies a futures contract from the symbol, or by matching the
  fill price against every listed expiry.
- Tags under the symbol in the trades list. They pushed rows to two or three
  lines; tags remain visible, filterable and editable on the trade detail page.

### Fixed

- **Importing a backup over ~1 MB failed with an unreadable error** — Next's
  default server-action body limit. The limit now matches what the app accepts,
  and the size check that can explain itself runs first.
- **A backup import wrote one trade at a time**, three round trips each, which
  no serverless request survives on a large journal. Writes are batched, with a
  row-by-row retry so one bad trade doesn't take the batch with it.
- **Importing between two of your own accounts duplicated every image** in
  object storage. Images already yours are referenced, not copied.
- Exporting more trades than a single file can hold now says so, instead of
  writing a backup the importer would later refuse.

## [0.5.0] - 2026-08-02

A pass over CSV import. Most of what follows is the same class of bug: the right
column was found, but the value in it was read wrong — an afternoon stored as a
morning, a European decimal comma multiplied by ten, a date a year out. None of
it failed loudly, so the import looked like it had worked.

**Upgrading.** Forex trades are now valued at the standard-lot contract size in
every path, matching what manual entry and the trade editor already did. Trades
imported from CSV before this release were valued at ×1 and keep that value —
run `scripts/recalc-forex-multiplier.sql` to reprice them. It dry-runs first and
leaves broker-supplied P&L alone. Deployments with no forex trades need no
action. Migration `0021` adds `users.timezone` and applies itself on start.

### Added

- **The mapping step shows what each column will become.** Detected columns are
  listed with a sample value from the file and how the importer reads it —
  `1,5 → 1.5`, `6/16/2026 4:13 PM → 2026-06-16, 16:13:00` — so a misread value is
  visible before anything is saved. Only required fields that weren't detected
  are presented as dropdowns; the full grid is one click away.
- **Your timezone is detected once and remembered.** It lives on the account
  rather than in a cookie, so it survives a new device, and the picker now lists
  every zone instead of ten.
- **Failed imports are reported.** The import funnel records the column names a
  file used (headers only, never row values) and which fields had to be remapped
  by hand, so unrecognised broker formats can be fixed rather than guessed at.
- **More contracts are priced correctly out of the box** — short-term rates
  (SOFR, Fed Funds), yield futures, livestock, rough rice, aluminium, e-mini
  natural gas, the micro FX contracts (AUD, GBP, JPY, CHF) and CME's Solana and
  XRP futures. Every contract size and tick in the table was checked against the
  exchange's own instrument definitions.
- **`scripts/check-market-feeds.mjs`** smoke-tests every market-data provider
  against the live APIs, one instrument per asset class.

### Changed

- **Forex is valued the same way everywhere.** The multiplier was derived in four
  places that disagreed: one lot of EURUSD moving 50 pips was worth $500 entered
  by hand and $0.005 imported from a CSV. There is now one rule, and it covers
  forex. See **Upgrading** above.
- **Column names are matched loosely.** `entry_price`, `entryPrice` and
  `Entry Price (USD)` are all recognised, along with the names Bybit, Binance and
  MetaTrader actually export. A precise match always wins over a generic one, so
  `Exit Price` can't be claimed as the entry price.
- Deduplication queries only the rows the file contains instead of reading the
  whole account, and an import that dies halfway still leaves a history entry for
  the rows that landed.

### Fixed

- **Afternoon trades are no longer stored as mornings.** The timezone-abbreviation
  stripper was eating `PM` along with `EST`.
- **European exports are read with the right decimal separator.** `1,5` was
  becoming 15 and `-12,75` becoming -1275. The convention is now inferred from
  the whole file.
- **Day-first dates are read as dates, not rolled over.** `16/06/2026` was stored
  as 2027-04-06 and `31/12/2026` as 2028-07-12. Impossible dates are rejected
  instead of silently wrapping.
- **Times near a daylight-saving change land on the right hour.**
- **Fill logs with fractional sizes pair correctly.** Crypto and forex positions
  never summed back to exactly zero, so every fill for a symbol collapsed into
  one enormous trade.
- **A mismapped Side column is reported instead of turning the file into longs**,
  negative commissions no longer increase net P&L, and a zero quantity is a
  rejected row rather than a zero-P&L trade.
- **Re-importing a file says "already imported"** rather than "nothing was
  imported", which was indistinguishable from a mapping failure.
- **The generic template accepts every asset type.** It was declared three times
  across the wizard with three different asset lists, so picking "my broker isn't
  listed" offered only futures — or nothing at all.
- A trade whose partials are still open stays open, and two positions opened on
  the same symbol in the same second stay two trades.

- **Futures charts plot the contract you actually traded.** A bare root like
  `NQ` was always charted against the provider's continuous front month, which
  around a roll is no longer where the volume is — a trade executed in the new
  expiry was drawn against the old one, leaving the entry and exit lines
  hundreds of points off candles whose timestamps still matched perfectly. The
  fill price now settles it: a single daily-bar request across every listed
  expiry finds the contract that traded there, however far from the front month
  it sits. A symbol that names its expiry (`NQU6`) is charted directly, with no
  guessing at all.
- **Four tick sizes and one that mattered twice.** Palladium moves in half
  dollars, not dimes; the 2-year note trades in quarter-32nds; and the
  Australian, Swiss and New Zealand dollar contracts tick in half pips. Each was
  wrong in the built-in table, so tick-based risk figures for those instruments
  were off by a factor of two to five.
- **Futures that don't trade on Globex can be charted at all.** The ICE softs
  (cotton, sugar, coffee, cocoa, orange juice) and Cboe's VIX contracts are
  instruments the app already knows how to value, but their candles were always
  requested from CME Globex, which returns nothing for them. Each root now goes
  to the venue that carries it.
- **A venue publishing the same minute twice no longer flattens the chart.** ICE
  reports off-book activity as a separate, priceless bar for a minute that
  already has a session bar; whichever arrived last used to win, so a zero-priced
  bar could drag the whole price axis to zero.

## [0.4.1] - 2026-08-01

A chart that once failed for a trade kept failing forever. The shared candle
cache tracked one covered time range per instrument and trusted it blindly, so
any hole inside it — a provider response silently capped at its row limit, an
outage, an empty answer — was remembered as "already fetched" and became a
permanent _No market data available for this trade_.

**Upgrading.** No action, no new environment variable. The migration drops the
old `market_candles` table on container start; it held nothing but cached market
data, so the cache simply rebuilds as charts are opened again.

### Fixed

- **Charts no longer disappear permanently for a trade.** Market data is cached
  in fixed time chunks, each holding exactly what the provider returned for its
  span, so the cache can't claim coverage it doesn't have. Empty or still-forming
  chunks expire and are re-fetched — a weekend, an unlisted contract or a one-off
  provider failure now heals itself.
- **Provider responses are read to the end.** Every source caps the bars one
  response may carry, and a truncated answer looks just like a short one.
  Requests are now paged through the whole range they asked for.
- **A failed fetch says what went wrong** — rate limit, entitlement, transport —
  instead of blaming the instrument for missing data.

### Changed

- Positions held past three months chart on daily bars, so a long-dated trade no
  longer asks for tens of thousands of them.

## [0.4.0] - 2026-08-01

Notes learn to hold pictures, and deletion learns to finish the job. Images can
now be dragged, dropped and pasted into any note — and with that came the
uncomfortable discovery that the app was good at creating data and bad at
removing it. Deleting a trading account kept its trades. Nothing ever removed an
uploaded image. This release fixes both, audits every other deletion path in the
codebase, and gives the admin area a way to erase a user completely.

**Upgrading.** Existing deployments need no action — there is no schema change,
no migration and no new environment variable. Two behaviours change on the way
in, both intentionally: deleting a trading account now really does delete its
trades (use _Transfer data_ first to keep them), and images that nothing
references any more are removed from object storage when the rows that showed
them are deleted or edited. Instances with no bucket configured are unaffected.

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
- **Admins can delete a user and all their data** — a row action in the admin
  users table erases every trade, account, note and upload belonging to one
  user, then removes their login. Because it is irreversible and aimed at
  someone else's account, it asks the admin to type the target's e-mail, and it
  refuses two cases outright: your own account (account settings does that) and
  anyone on the `ADMIN_EMAILS` allow-list, so one admin session can never lock
  the others out. To remove an admin, take their address out of the variable
  first.

### Changed

- **Deleting a trading account now says how many trades go with it**, instead of
  a generic "and all associated trades".
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

- **Deleting a trading account no longer leaves its trades behind.** The delete
  confirmation had always promised to remove the account's trades, but only the
  account was deleted — the trades survived with no account attached, and the
  next visit to the accounts page quietly adopted them into a _different_
  account, where they went on counting toward that account's P&L. The trades are
  now deleted with the account, as one operation. **If you want to keep them,
  use _Transfer data_ to move them to another account first.**
- **Uploaded images are cleaned up when nothing shows them any more.** Deleting
  a trade, an account, an import — or simply removing a picture from a note —
  left the file in object storage forever, so a bucket only ever grew. Images
  are now removed once nothing references them; one still used somewhere else
  (the same picture pasted into a second note, a strategy, a daily note) is kept.
- **Undoing an import can no longer half-finish.** The imported trades and the
  import record were deleted separately, so an interruption between them could
  leave an import listing trades that no longer existed, or trades that no
  import could undo.
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

[unreleased]: https://github.com/HonzaPrikryl/tradenza/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.6.1
[0.6.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.6.0
[0.5.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.5.0
[0.4.1]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.4.1
[0.4.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.4.0
[0.3.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.3.0
[0.2.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.2.0
[0.1.0]: https://github.com/HonzaPrikryl/tradenza/commits/main
