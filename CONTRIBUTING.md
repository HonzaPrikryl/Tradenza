# Contributing to Tradenza

First off — thank you for taking the time to contribute. Tradenza started as a solo project, and the whole point of open-sourcing it is so that other people can help shape it. Bug reports, feature ideas, documentation fixes, and pull requests are all genuinely welcome.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce, what you expected, and what happened. Screenshots and a minimal example help a lot.
- **Suggest a feature** — open an issue describing the problem you're trying to solve, not just the solution. Context about your trading workflow is valuable.
- **Improve the docs** — typos, unclear setup steps, missing details in the [README](README.md) or [UX/UI docs](docs/UX_UI.md).
- **Send a pull request** — fix a bug, add a feature, or improve the code. For anything non-trivial, open an issue first so we can agree on the approach before you invest time.

## Development setup

You'll need **Node.js 20+**, a **PostgreSQL/Neon** database, and a **Clerk** application. Full instructions are in the [README quick start](README.md#quick-start).

```bash
git clone https://github.com/HonzaPrikryl/tradenza.git
cd tradenza
npm install
cp .env.example .env.local   # fill in DATABASE_URL + Clerk keys
npm run db:push
npm run dev
```

## Project conventions

- **Language & framework:** TypeScript, Next.js App Router, React Server Components + Server Actions. Prefer server actions in `src/lib/actions/` for data mutations rather than ad-hoc API routes.
- **Business logic is pure and tested.** Calculation logic (statistics, P&L, futures, breakeven, dates) lives in pure functions under `src/lib/*` with Vitest tests next to them (`*.test.ts`). If you touch this logic, add or update a test.
- **UI text goes through i18n.** User-facing strings live in `src/i18n/locales/en/*.json` and are read via the `t()` helper — please don't hardcode display strings in components.
- **Styling** uses Tailwind with the design tokens defined in `src/app/globals.css` (e.g. `bg-card`, `text-profit`, `text-loss`). Reuse the tokens instead of hardcoding colors so both dark and light themes keep working.
- **Database changes:** edit `src/lib/db/schema.ts`, then either run `npm run db:push` or add an idempotent SQL file under `drizzle/`. See the [Database & migrations](README.md#database--migrations) section.

## Before you open a pull request

Please make sure the same checks CI runs pass locally:

```bash
npm run format       # Prettier
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test:run     # Vitest
```

Git hooks (Husky + lint-staged) will auto-format and lint staged files on commit, and the GitHub Actions CI re-runs all of the above on every push and pull request.

## Pull request guidelines

- Keep PRs focused — one logical change per PR is much easier to review.
- Write a clear description: what changed, why, and how to test it.
- Update the README / docs if you change behavior, config, or setup.
- Use clear, present-tense commit messages (e.g. `Add max-drawdown widget`). [Conventional Commits](https://www.conventionalcommits.org) are welcome but not required.
- By submitting a contribution, you agree that it will be licensed under the project's [AGPL-3.0 license](LICENSE).

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. Instead, report them privately to the maintainer (see the contact in the repo profile / GitHub Security Advisories). You'll get a response as quickly as possible.

## Code of conduct

Be respectful and constructive. We're all here to build a useful tool and learn from each other. Harassment or hostile behavior won't be tolerated.

---

Not sure where to start? Open an issue and say hi — happy to point you toward something.
