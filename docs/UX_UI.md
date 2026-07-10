# Tradenza — UX/UI Documentation

This document describes Tradenza from a product, design, and interaction standpoint: the design system, the navigation model, the core user flows, and the purpose of each screen. It is meant for designers, contributors, and anyone who wants to understand _why_ the app is shaped the way it is — not just how it is built. For the technical/architecture view, see the [README](../README.md).

---

## 1. Design philosophy

Tradenza is built for traders reviewing their performance, often at the end of a session when focus is low and emotions may be high. Three principles guide the design:

1. **Data over decoration.** Every screen leads with numbers that change behavior — P&L, win rate, expectancy, drawdown. Visual flourish never competes with the figure a trader is there to read.
2. **Calm, dark-first surface.** Trading screens are already loud. The default theme is a deep, low-contrast dark palette so that the only saturated colors on screen are _meaningful_ ones: green for profit, red for loss, blue for breakeven.
3. **Honesty.** The journal exists to confront a trader with reality. Losing days are shown as plainly as winning ones; discipline rules track what you actually did, not what you intended.

---

## 2. Design system

### Color tokens

Colors are defined as HSL CSS custom properties in [`src/app/globals.css`](../src/app/globals.css) and exposed to Tailwind in [`tailwind.config.js`](../tailwind.config.js). Components reference semantic tokens (`bg-card`, `text-muted-foreground`, `text-profit`) rather than raw colors, so both themes — and any future re-theming — stay consistent.

| Token                            | Dark value                       | Role                                      |
| -------------------------------- | -------------------------------- | ----------------------------------------- |
| `background`                     | very dark navy `#0e1117`         | App canvas                                |
| `card` / `popover`               | `#161c24`                        | Raised surfaces, panels, dialogs          |
| `primary`                        | emerald `#34d399`                | Primary actions, focus ring, brand accent |
| `secondary` / `muted` / `accent` | dark grays                       | Subtle surfaces, secondary text           |
| `border` / `input`               | `#272d38`                        | Hairlines, field outlines                 |
| `destructive`                    | red                              | Delete / dangerous actions                |
| **`profit`**                     | emerald                          | Positive P&L, winning days                |
| **`loss`**                       | red                              | Negative P&L, losing days                 |
| **`breakeven`**                  | blue                             | Scratch / breakeven outcomes              |
| `sidebar`                        | slightly lighter than background | Left navigation rail                      |

The trading-semantic colors (`profit` / `loss` / `breakeven`) are the heart of the system. They are applied consistently across every number, chart series, calendar cell, and badge so a trader learns to read the screen at a glance.

### Theming

A **dark theme** is the default. A **light theme** is available and toggled via the `ThemeProvider` adding a `.light` class to `<html>`; every token has a tuned light-mode counterpart (notably a darker, more legible primary green on white). The toggle lives in the UI as `ThemeToggle`.

### Typography

- **DM Sans** for all UI text — a clean, slightly geometric sans that stays legible at small sizes.
- **DM Mono** for monospaced contexts.
- **Tabular numerals** (`.tabular`, `font-variant-numeric: tabular-nums`) are used wherever figures align in columns or update in place, so digits never shift horizontally as values change.

### Shape, motion, and feedback

- **Radius:** a single `--radius` (0.5rem) base with `sm`/`md`/`lg` derivatives keeps corners consistent.
- **Motion:** restrained — `fade-in` (8px rise + opacity) for entering content, `slide-in` for the sidebar/sheet, and a `shimmer` for skeleton loaders. Nothing bounces or distracts.
- **Loading states:** nearly every route ships a dedicated `loading.tsx` skeleton (e.g. stat-card skeletons, skeleton tables) so navigation feels instant and layout never jumps when data arrives.
- **Toasts:** transient feedback (save, import result, errors) is delivered via Sonner, top-of-stack and auto-dismissing.
- **Confirmation:** destructive actions route through a shared `ConfirmProvider` dialog rather than native `confirm()`.

### Component layers

The UI is assembled from three layers:

1. **Primitives** (`src/components/ui/`) — Radix-based building blocks (Dialog, Select, Tooltip, Popover, Tabs, Switch) plus app-specific inputs (DateRangePicker, MultiSelect, ComboCreate, RichTextEditor, Pagination, ActionMenu).
2. **MUI** — used where its mature components add value, primarily date/time pickers, themed via `mui-theme.ts` to match the token palette.
3. **Feature components** — composed per domain: `dashboard/`, `trades/`, `stats/`, `progress/`, `strategies/`, `settings/`, `accounts/`, `trade-import/`.

---

## 3. Navigation model

### Structure

The app uses three route groups that map to three distinct contexts:

- **`(auth)`** — sign-in / sign-up. Minimal, centered, no app chrome.
- **`(app)`** — the authenticated product. Persistent left sidebar + global header.
- **`(wizard)`** — the focused, full-screen trade-import flow with its own minimal chrome (`WizardChrome`) so the user isn't distracted while mapping data.

### The persistent shell

Inside `(app)`, every screen shares:

- **Left sidebar** (`Sidebar`) — primary navigation: Dashboard, Trades, Statistics, Discipline, Strategies, Accounts, Settings, plus the prominent **Add trade** action. It can collapse (state held in `SidebarContext`) and has a subtle primary "glow".
- **Global header** (`AppHeader`) — app-wide controls that filter _every_ data screen at once:
  - **Account selector** — scope all data to one trading account or view all.
  - **Date range** — with quick presets (today, this week, month, etc.).
  - **Unit toggle** — display P&L in **$** or in **R** (risk multiples).
  - **Filters** — additional cross-cutting filters.
- **Mobile** — the sidebar collapses into a `MobileSheet` triggered from the header, so the same navigation works on small screens.

This shell is the backbone of the UX: a trader sets account + date range + unit once in the header, and the dashboard, trades, stats, and progress views all respect it.

---

## 4. Core user flows

### 4.1 First run / onboarding

```
Landing page → Sign up (Clerk) → Dashboard
```

The landing page (`/`) is a focused marketing page: a hero ("Improve your trades with data, not feelings"), four feature cards (Import, Statistics, Journal, Dashboard), and clear "Start free" CTAs. Authenticated users see "Go to dashboard" instead. After sign-up, the user lands on the dashboard with a sensible default layout and is prompted toward adding or importing trades.

### 4.2 Importing trades (the primary onboarding path)

```
Add trade / Import → Method (CSV vs manual) → Account → Broker → Upload CSV → Confirm → Trades
```

This is a deliberately **multi-step wizard** in its own route group so the user can concentrate:

1. **Method** — import from a CSV export, or enter a trade manually.
2. **Account** — pick (or create) the trading account the trades belong to.
3. **Broker** — choose the source format from a large broker catalog (`lib/brokers.ts`), which drives column mapping.
4. **Upload** — drag-and-drop the CSV (react-dropzone); rows are parsed (PapaParse) and validated.
5. **Confirm** — duplicates (matched on an external ID per user) are detected and skipped automatically; the result is written to import history.

Every import is logged (`import_logs`) with totals, skipped/error counts, and the created trade IDs, so it can be reviewed — or deleted — later from **Settings → Import history**.

### 4.3 Reviewing a single trade

```
Trades list → Trade detail [id]
```

The trade detail screen is the journaling heart of the app:

- **Price chart** (`TradeChart`, lightweight-charts) with the entry/exit marked. Candles are fetched on demand via Databento and cached (`market_candles`); if no market-data key is configured, the chart degrades gracefully.
- **Executions / legs editor** — multi-fill and multi-leg trades are supported, with a **running P&L** chart as the position is built and reduced.
- **Stats panel** — per-trade metrics (R, hold time, fees, etc.).
- **Notes tabs** — structured journaling split into setup, emotions (before / after), mistakes, and lessons, with a rich-text editor and **autosave** (`useAutosave`).
- **Star rating** — a quick subjective grade of execution quality.
- **Tags panel** — assign color-coded tags/categories.
- **Strategy & playbook** — link the trade to one of your strategies, then tick off its **entry** and **exit** checklist items as you review. The trade records how faithfully you followed the plan, which rolls up into per-strategy adherence stats.

The structure nudges the trader past "did I win?" toward "did I execute well, and what do I repeat or avoid?".

### 4.4 Daily discipline review

```
Discipline (Progress) → Day [date]
```

Separate from P&L, the **Discipline** area tracks _process_:

- Define **rules** ("No revenge trading", "Wait for confirmation"). Rules can be reordered, paused, or archived — archived rules stop applying going forward but keep counting toward the days they were active, preserving history.
- Each day, check off the rules you followed and write a **daily note / review**.
- A **year heatmap**, **progress rings**, and **streaks** visualize consistency over time, turning discipline into a game you can see yourself winning.

### 4.5 Analyzing performance

```
Dashboard (glanceable) ↔ Statistics (deep dive)
```

- The **Dashboard** answers "how am I doing right now?" at a glance, and is fully customizable (see §5).
- The **Statistics** page answers "where exactly is my edge — and my leak?" with the full metric set: win rate by direction, profit factor, expectancy, planned vs realized R, hold-time analysis, consecutive streaks, day-level breakdowns, and fees. Both screens obey the global account/date/unit filters.

### 4.6 Building and following a strategy

```
Strategies → Strategy [id] ↔ Trade detail (assign + tick checklist)
```

Where Discipline tracks daily process, **Strategies** capture the specific setups a trader repeats — turning a loose "plan" into something measurable:

- Define a **strategy** with a name, a written description of its rules, a color, and up to a handful of **reference screenshots** of the ideal setup.
- Split the plan into the two decisions it actually governs: an **entry checklist** (what makes a valid entry) and an **exit checklist** (how and when to get out). Both are optional.
- Assign a strategy to each trade and, during review, tick off the checklist items you genuinely followed. Adherence is stored per trade, so the strategy page can show not just _how_ that setup performs (its own P&L, win rate, expectancy) but _how closely you actually traded it_ — separating a losing edge from poor execution of a good one.
- Retired setups can be **archived**: they leave the active list and their trades keep the (now-unlinked) history, so past statistics stay intact — the same non-destructive pattern used for accounts and discipline rules.

This closes the loop with the journal: the strategy defines the plan, the trade detail records the execution, and the stats reveal the gap between the two.

---

## 5. Screen reference

| Screen                 | Route                                  | Purpose                                                                            |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| **Landing**            | `/`                                    | Marketing + entry point; CTAs to sign up / dashboard.                              |
| **Sign in / Sign up**  | `/sign-in`, `/sign-up`                 | Clerk-hosted auth, themed to match the app.                                        |
| **Dashboard**          | `/dashboard`                           | Customizable widget grid; glanceable performance overview.                         |
| **Trades**             | `/trades`                              | Filterable, sortable, paginated trade table with summary stat cards; bulk actions. |
| **Trade detail**       | `/trades/[id]`                         | Chart, executions, running P&L, structured notes, rating, tags.                    |
| **Add trade**          | `/add-trade`, `/add-trade/[accountId]` | Quick single-trade entry.                                                          |
| **Trade import**       | `/trade-import/*`                      | Guided multi-step CSV/manual import wizard.                                        |
| **Statistics**         | `/stats`                               | Full statistical breakdown of the filtered trade set.                              |
| **Discipline**         | `/progress`, `/progress/[date]`        | Rules, daily check-ins/reviews, streaks, year heatmap.                             |
| **Strategies**         | `/strategies`, `/strategies/[id]`      | Strategy playbooks (entry/exit checklists, reference images) + per-strategy stats. |
| **Accounts**           | `/accounts`                            | List and manage trading accounts (prop-firm model).                                |
| **Settings**           | `/settings/*`                          | Accounts, tags & categories, trade settings, global settings, import history.      |
| **Admin** _(internal)_ | `/admin`, `/admin/feedback`            | Maintainer-only user & feedback overview.                                          |

### The customizable dashboard (in depth)

The dashboard is the most interactive surface in the app:

- **Two zones** — a top row of compact **KPI tiles** and a main area of larger **widgets**.
- **KPI widgets:** net P&L, trade win rate, profit factor, day win rate, average win/loss, total trades, average R:R, max drawdown, expectancy, current streak.
- **Main widgets:** Zella-style score, cumulative P&L curve, net daily P&L, P&L calendar, performance breakdown, top symbols.
- **Edit mode** — drag-and-drop reordering (dnd-kit), add/remove widgets from a **palette**, and resize/arrange via a sortable grid.
- **Templates** — save multiple named layouts (`dashboard_templates`), mark a default, and switch between them. Useful for, e.g., a "scalping" view vs a "swing" view.
- **Calendar drill-down** — clicking a day in the calendar opens a day-detail dialog with that day's trades and result.

This lets each trader build the cockpit that matches how _they_ think, instead of a one-size-fits-all dashboard.

---

## 6. Interaction patterns & conventions

- **Filters are global and sticky.** The header account/date/unit selection is the single source of truth; individual screens don't re-ask for it.
- **$ vs R everywhere.** Because risk-normalized performance (R) matters as much as dollars, the unit toggle re-expresses figures across the whole app, not just one chart.
- **Color = outcome.** Green/red/blue always mean profit/loss/breakeven, on every number and surface. Color is never used decoratively in a way that could be confused with an outcome.
- **Autosave for journaling.** Notes save automatically so reflection is never lost to a forgotten "Save" click; transient toasts confirm.
- **Non-destructive history.** Archiving (accounts, discipline rules) is preferred over deletion so past statistics stay intact; true deletes are explicit and confirmed.
- **Graceful degradation.** Optional integrations (market-data candles, screenshots, error monitoring) are additive — the app is fully usable without them.
- **Skeletons, not spinners.** Routes render their layout immediately with shimmering placeholders, keeping perceived performance high.

---

## 7. Accessibility & responsiveness

- **Responsive layout** — the sidebar collapses to a mobile sheet; tables and grids reflow for narrow viewports.
- **Radix primitives** provide accessible focus management, keyboard navigation, and ARIA semantics for dialogs, menus, selects, and tabs out of the box.
- **Focus visibility** — the `ring` token gives a consistent, high-contrast focus indicator.
- **PWA** — a web app manifest and icons allow installing Tradenza to the home screen / dock for an app-like experience.

> **Roadmap note:** full keyboard-only coverage of custom widgets and a formal contrast audit of both themes are good first contributions — see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## 8. Glossary

| Term                    | Meaning                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| **R / R-multiple**      | Profit or loss expressed as a multiple of the amount risked on the trade. |
| **Expectancy**          | Average expected P&L per trade given your win rate and average win/loss.  |
| **Profit factor**       | Gross profit ÷ gross loss; > 1 is profitable.                             |
| **Drawdown**            | Peak-to-trough decline in cumulative P&L.                                 |
| **Scratch / breakeven** | A trade closed at (approximately) no gain or loss.                        |
| **Phase (account)**     | Stage of a prop-firm account, e.g. _Step 1_, _Funded_.                    |
| **Trade score**         | A composite 0–100 health score blending several performance metrics.      |
