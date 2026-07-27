# Contributing to Tradenza

First off — thank you for taking the time to contribute. Tradenza started as a solo project, and the whole point of open-sourcing it is so that other people can help shape it. Bug reports, feature ideas, documentation fixes, and pull requests are all genuinely welcome.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce, what you expected, and what happened. Screenshots and a minimal example help a lot.
- **Suggest a feature** — open an issue describing the problem you're trying to solve, not just the solution. Context about your trading workflow is valuable.
- **Improve the docs** — typos, unclear setup steps, missing details in the [README](README.md) or [UX/UI docs](docs/UX_UI.md).
- **Send a pull request** — fix a bug, add a feature, or improve the code. For anything non-trivial, open an issue first so we can agree on the approach before you invest time.

## Development setup

You'll need **Node.js 20+**, a **PostgreSQL** database (local, Docker or Neon), and a **Clerk** application. Full instructions are in the [README quick start](README.md#quick-start).

```bash
git clone https://github.com/HonzaPrikryl/tradenza.git
cd tradenza
npm install
cp .env.example .env.local   # fill in DATABASE_URL + Clerk keys
npm run db:migrate
npm run dev
```

No database at hand? Start one with the bundled compose file and point
`DATABASE_URL` at it:

```bash
POSTGRES_PASSWORD=devpassword docker compose up -d db
# DATABASE_URL=postgresql://tradenza:devpassword@localhost:5432/tradenza
```

The container publishes Postgres on `127.0.0.1:5432` (loopback only). To run the
whole stack in Docker instead, see [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md).

## Project conventions

- **Language & framework:** TypeScript, Next.js App Router, React Server Components + Server Actions. Prefer server actions in `src/lib/actions/` for data mutations rather than ad-hoc API routes.
- **Business logic is pure and tested.** Calculation logic (statistics, P&L, futures, breakeven, dates) lives in pure functions under `src/lib/*` with Vitest tests next to them (`*.test.ts`). If you touch this logic, add or update a test.
- **UI text goes through i18n.** User-facing strings live in `src/i18n/locales/en/*.json` and are read via the `t()` helper — please don't hardcode display strings in components.
- **Styling** uses Tailwind with the design tokens defined in `src/app/globals.css` (e.g. `bg-card`, `text-profit`, `text-loss`). Reuse the tokens instead of hardcoding colors so both dark and light themes keep working.
- **Database changes:** edit `src/lib/db/schema.ts`, then generate a migration with `npm run db:generate -- --name my_change`, review the SQL in `drizzle/`, and apply it with `npm run db:migrate`. Do **not** use `db:push`. See the [Database & migrations](README.md#database--migrations) section.
- **Multi-statement writes must use `runAtomic`.** The app supports two drivers and their atomicity APIs do not overlap: neon-http has `db.batch` but throws on `db.transaction`, node-postgres is the other way round. Never call either directly — use `runAtomic(...)` from `src/lib/db/atomic.ts`, which picks the right one. Code that calls `db.transaction` works locally on Postgres and fails in production on Neon.

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
- **Add a line to `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md)** if the change is user-visible — a new or changed feature, a bug fix people would notice, a new or renamed environment variable, a database migration, or anything that alters how the app is deployed. Skip it for refactors, formatting, tests and CI tweaks with no observable effect. Write it in the same PR, not later: a changelog assembled from memory at release time is how half a release goes missing.
- Use clear, present-tense commit messages (e.g. `Add max-drawdown widget`). [Conventional Commits](https://www.conventionalcommits.org) are welcome but not required.
- By submitting a contribution, you agree that it will be licensed under the project's [AGPL-3.0 license](LICENSE).

## Releasing

Maintainer notes — you don't need this to contribute.

**Versioning.** [Semantic Versioning](https://semver.org/spec/v2.0.0.html), pre-1.0: `0.x.0` for a new feature _or_ a breaking change (pre-1.0 allows breaking changes in a minor — they just have to be called out explicitly in the changelog), `0.0.x` for fixes and small improvements with no new surface. `1.0.0` waits until the database schema and the self-hosting path are stable enough to commit to. Release when there is something worth shipping, not on a calendar.

**The tag is the release.** [`.github/workflows/release.yml`](.github/workflows/release.yml) triggers on `v*` tags and nothing else. Pushing the tag publishes `ghcr.io/honzaprikryl/tradenza:<version>` (plus `:<major>.<minor>` and `:latest`) and then opens the GitHub release, using the matching `CHANGELOG.md` section as its notes. Without a tag there is no image and no release, and the install instructions in the README point at nothing.

**Release notes come from the changelog, not from you.** The workflow extracts everything between `## [<version>]` and the next heading. That is why the file has to keep the Keep a Changelog format — an ASCII hyphen in `## [0.3.0] - 2026-08-14`, not an en dash — and why a missing section fails the job instead of shipping empty notes.

### Cutting a release

1. **Write the changelog entry.** Move the accumulated `## [Unreleased]` items under a new heading, `## [0.3.0] - YYYY-MM-DD`, using today's date. Keep the section order Keep a Changelog defines: Added, Changed, Deprecated, Removed, Fixed, Security — omit the ones you don't need. Open with a sentence or two on what the release is _for_; that paragraph is the first thing anyone reads on the release page.

2. **Add an `**Upgrading.**` paragraph whenever a self-hoster has to do something** — a new required environment variable, a renamed setting, a manual step, a breaking change. Migrations apply themselves on container start, so they only need a mention if they are destructive, slow, or irreversible. If the upgrade really is a no-op, say that too: "existing deployments need no action" saves people a nervous evening.

3. **Update the link definitions** at the bottom of the changelog: point `[unreleased]` at `compare/v0.3.0...HEAD` and add a line for the new version.

4. **Bump, commit, tag, push.**

   ```bash
   npm version 0.3.0 --no-git-tag-version
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "chore(release): 0.3.0"
   git tag -a v0.3.0 -m "Example feature change message"
   git push --follow-tags        # pushes the commit and the tag together
   ```

5. **Watch the run finish** and check the [package page](https://github.com/HonzaPrikryl/tradenza/pkgs/container/tradenza) for the new image tag and the [releases page](https://github.com/HonzaPrikryl/tradenza/releases) for the notes. If the extraction step fails, the changelog heading doesn't match the tag — fix it, delete the tag locally and remotely, and push it again.

A manual `workflow_dispatch` run builds and publishes `:edge` and creates no release. Use it to check the image still builds without cutting a version.

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. Instead, report them privately to the maintainer (see the contact in the repo profile / GitHub Security Advisories). You'll get a response as quickly as possible.

## Code of conduct

Be respectful and constructive. We're all here to build a useful tool and learn from each other. Harassment or hostile behavior won't be tolerated.

---

Not sure where to start? Open an issue and say hi — happy to point you toward something.
