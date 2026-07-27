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
  `ghcr.io/honzaprikryl/tradenza` (GitHub Actions → GHCR). Prebuilt images are
  compiled with a placeholder Clerk publishable key that the entrypoint swaps
  for the real one at startup.
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

[unreleased]: https://github.com/HonzaPrikryl/tradenza/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/HonzaPrikryl/tradenza/releases/tag/v0.2.0
[0.1.0]: https://github.com/HonzaPrikryl/tradenza/commits/main
