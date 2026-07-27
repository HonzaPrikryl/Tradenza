# Self-hosting Tradenza

Tradenza runs anywhere Docker runs. The bundled `docker-compose.yml` starts the
app together with its own PostgreSQL — database migrations are applied
automatically on every container start, so upgrades are a rebuild away.

Auth is provided by [Clerk](https://clerk.com); a free-tier Clerk application is
the only external service you need. Everything else (screenshots, candle charts,
rate limiting, analytics, error monitoring) is optional and disabled unless
configured.

## Quick start (Docker Compose)

Prerequisites: Docker with the Compose plugin, and a Clerk application
(free tier). Building the image compiles Next.js and type-checks the project —
budget **~4 GB of RAM** for the build (it is the peak, not the steady state; the
running container needs far less). On a small VPS use the
[prebuilt image](#prebuilt-image-no-local-build) instead of building in place. In the Clerk dashboard grab the **publishable key** and **secret
key** — use a _Development_ instance (`pk_test_…`/`sk_test_…`) unless you have a
production domain configured in Clerk.

```bash
git clone https://github.com/HonzaPrikryl/tradenza.git
cd tradenza
cp .env.example .env
```

Edit `.env` and set at minimum:

```dotenv
# `openssl rand -hex 32` — keep it alphanumeric: the password is interpolated
# into the DATABASE_URL, so @ : / ? # [ ] % would break the connection string.
POSTGRES_PASSWORD=<any strong random string>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
CLERK_SECRET_KEY=sk_test_…
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
# leave DATABASE_URL empty → the bundled Postgres is used
DATABASE_URL=
```

Then:

```bash
docker compose up -d --build
```

Open <http://localhost:3000>, sign up, and you're in. The app container waits
for Postgres, applies any pending migrations, and only then starts serving.

> **Note on build args:** `NEXT_PUBLIC_*` values are inlined into the client
> bundle at build time. If you change any of them (e.g. the Clerk publishable
> key or `NEXT_PUBLIC_APP_URL`), rebuild: `docker compose up -d --build`.

## Prebuilt image (no local build)

Every release is published to GitHub Container Registry, so you can skip the
local build entirely. In `docker-compose.yml`, replace the whole `build:` block
of the `app` service with:

```yaml
image: ghcr.io/honzaprikryl/tradenza:latest # or a pinned version, e.g. :0.2.0
```

then `docker compose up -d` (add `docker compose pull` when upgrading).

How it works: `NEXT_PUBLIC_*` values are normally baked in at build time, so the
published image is compiled with a placeholder Clerk publishable key and the
container entrypoint substitutes your real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
from `.env` at startup. **Limitation:** the other optional `NEXT_PUBLIC_*`
integrations (Sentry DSN, PostHog, the split-domain setup) are not injected —
if you need those, build the image yourself (the default `build:` path).

## Using an external PostgreSQL

Point `DATABASE_URL` in `.env` at your database and (optionally) delete the
`db` service from `docker-compose.yml`:

```dotenv
DATABASE_URL=postgresql://user:password@your-host:5432/tradenza?sslmode=require
```

Any standard Postgres works (RDS, Supabase, a VM, …). Neon also works — its
serverless HTTP driver is picked automatically for `…neon.tech` hosts. To force
a driver explicitly, set `DATABASE_DRIVER=pg` or `DATABASE_DRIVER=neon`.

## Migrations

The container entrypoint runs the versioned migrations in `drizzle/` before the
server starts (`scripts/docker-migrate.mjs`, bundled into the image). This makes
container startup idempotent: a fresh database gets the full schema, an existing
one only the pending migrations.

- Adopting a **pre-existing, already-populated** database requires the one-time
  baseline seed described in [`drizzle/MIGRATIONS.md`](../drizzle/MIGRATIONS.md).
- Running **multiple app replicas**? Set `SKIP_MIGRATIONS=1` on the replicas and
  migrate from a single job/container instead, so two containers never race.

## Reverse proxy & HTTPS

Run the app behind any TLS-terminating proxy. Example with
[Caddy](https://caddyserver.com) (automatic HTTPS):

```caddyfile
tradenza.example.com {
    reverse_proxy localhost:3000
}
```

Set `NEXT_PUBLIC_APP_URL=https://tradenza.example.com` in `.env` and rebuild —
this allow-lists the host for Server Actions behind the proxy. Leave
`NEXT_PUBLIC_MARKETING_URL` empty unless you run the split-domain setup
(see [Environments](../README.md#environments)).

Remember to switch Clerk to a production instance (`pk_live_…`/`sk_live_…`)
locked to your domain, and configure the `user.deleted` webhook
(`CLERK_WEBHOOK_SIGNING_SECRET`) so account deletions purge data.

## Operations

- **Health check** — `GET /api/health` returns `200` when the app can reach the
  database, `503` otherwise. The image also ships a Docker `HEALTHCHECK` on the
  same endpoint (`docker ps` shows healthy/unhealthy).
- **Backups** — the database is the only irreplaceable state:

  ```bash
  docker compose exec db pg_dump -U tradenza -Fc tradenza > backup-$(date +%F).dump
  # restore:
  docker compose exec -T db pg_restore -U tradenza -d tradenza --clean < backup.dump
  ```

  See [`docs/BACKUPS.md`](BACKUPS.md) for the full strategy.

- **Upgrades** — read [`CHANGELOG.md`](../CHANGELOG.md) first: every release
  lists what changed and, when a version needs a manual step (a new required
  environment variable, a breaking change), says so under **Upgrading**. Then:

  ```bash
  git pull
  docker compose up -d --build   # migrations apply automatically on start
  ```

  On the prebuilt image, `docker compose pull && docker compose up -d`. Pin a
  version (`:0.2.0`) rather than `:latest` if you'd rather choose when to move.
  Take a backup before upgrading — see below.

- **Logs** — `docker compose logs -f app` (migration output included).

## Configuration reference

Everything from [`.env.example`](../.env.example) applies. Docker-specific
variables:

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `POSTGRES_PASSWORD` | Password for the bundled Postgres container (Compose only) |
| `APP_PORT`          | Host port to publish the app on (default `3000`)           |
| `DATABASE_DRIVER`   | Force `pg` or `neon` instead of host-based auto-detection  |
| `DATABASE_POOL_MAX` | node-postgres pool size (default `10`)                     |
| `SKIP_MIGRATIONS`   | Set `1` to skip auto-migrations on container start         |
| `POSTGRES_PORT`     | Loopback port the bundled Postgres is published on (5432)  |

## Alternative: run without Docker

The app is a standard Next.js 15 project — `npm ci && npm run build && npm start`
with the same environment variables works on any Node 20+ host. Apply migrations
with `npm run db:migrate` before starting. Docker is simply the recommended,
batteries-included path.
