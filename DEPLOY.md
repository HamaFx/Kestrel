# Kestrel Deployment Guide

Kestrel supports two deployment profiles. Both run the same image, the same
migrations, and the same BYOK key handling; they differ only in where the web
app, database, and background worker live.

| Profile                                        | Best for                                | Runtime shape                                                              |
| :--------------------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------- |
| **1. Docker Compose** (`docker compose up -d`) | Self-hosting on your own machine or VM  | `app` + `worker` + Postgres 16 (`pgvector`) + backup sidecar, one command  |
| **2. Vercel + Supabase**                       | A hosted, always-on personal deployment | Next.js on Vercel, Postgres on Supabase, `@kestrel/worker` on any small VM |

---

## Profile 1: Docker Compose (self-hosted)

### Quick start

```bash
git clone https://github.com/HamaFx/Kestrel.git kestrel
cd kestrel
./docker/init-secrets.sh          # writes .env with random secrets
docker compose up -d
```

Open <http://localhost:3000>. The first registered account becomes the
instance admin (`REGISTRATION_MODE=first_user` by default).

### What runs

| Service  | Purpose                                                                                                    |
| :------- | :--------------------------------------------------------------------------------------------------------- |
| `db`     | PostgreSQL 16 with `pgvector`. The app connects as the non-bypass `kestrel_app` role so RLS applies.       |
| `app`    | Next.js 16 web app. Runs migrations on boot, then serves the UI and `/api/*`.                              |
| `worker` | `@kestrel/worker`: the six core scheduled jobs, pg-boss backtest queues, and the plugin tick bus.          |
| `backup` | Daily compressed `pg_dump` into the `backup-data` volume; copy that volume off-host for disaster recovery. |

Optional Langfuse observability lives in `docker-compose.observability.yml`:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  --profile observability up -d
```

### Required secrets

`docker/init-secrets.sh` generates every value below. If you provision
manually, all of them are required:

| Name                      | Purpose                                                                                      |
| :------------------------ | :------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`       | Superuser password used by the database container and the backup job.                        |
| `POSTGRES_ADMIN_PASSWORD` | Password for the RLS-bypassing role (`hamafx_admin`) used by admin endpoints and migrations. |
| `POSTGRES_APP_PASSWORD`   | Password for the non-bypass runtime role (`kestrel_app`).                                    |
| `ENCRYPTION_SECRET`       | AES-256-GCM key for stored BYOK keys and Telegram bot tokens.                                |
| `AUTH_SECRET`             | NextAuth session signing key.                                                                |
| `CRON_SECRET`             | 16+ character secret for `/api/cron/*`; the worker and external schedulers present it.       |

Optional: `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` for shared
provider keys, `BIQUOTE_*` for gold/FX feeds, `FINNHUB_API_KEY` for news, and
`TELEGRAM_BOT_TOKEN` for the Telegram plugin. Users can also bring their own
keys from **Settings → Models**; those are encrypted with `ENCRYPTION_SECRET`
and never leave the database in plaintext.

Production deployments must set `ADMIN_DATABASE_URL` for any tooling that runs
outside the app container; admin endpoints fail closed with a 500 without an
admin connection.

---

## Profile 2: Vercel + Supabase

### 1. Database (Supabase)

Create a project on the free tier. Two connection strings are needed:

- **Pooled URL** (`:6543`) → `DATABASE_URL` for the web app.
- **Direct URL** (`:5432`) → `MIGRATION_DATABASE_URL` / `KESTREL_DIRECT_URL` for
  migrations and the post-deploy smoke check. `DIRECT_URL` and
  `POSTGRES_URL_NON_POOLING` are accepted aliases; point at least one at the
  direct connection or `predeploy-migrate` refuses to run.

`pgvector` is enabled by the migration set; no manual extension install is
needed.

### 2. Web app (Vercel)

1. Import the repository. The project Root Directory is `apps/web`.
2. Set the environment variables below (Production and Preview).
3. Deploy. `apps/web/vercel.json` skips builds for commits that cannot affect
   the web app, and the build runs `turbo run typecheck` before compiling.

| Variable                 | Required | Purpose                                                      |
| :----------------------- | :------- | :----------------------------------------------------------- |
| `DATABASE_URL`           | yes      | Pooled Postgres connection (runtime role, RLS enforced).     |
| `MIGRATION_DATABASE_URL` | yes      | Direct Postgres connection used to apply migrations.         |
| `ADMIN_DATABASE_URL`     | yes      | RLS-bypassing connection for admin routes and health alerts. |
| `ENCRYPTION_SECRET`      | yes      | AES-256-GCM key for stored BYOK keys.                        |
| `AUTH_SECRET`            | yes      | NextAuth session signing key.                                |
| `CRON_SECRET`            | yes      | 16+ character secret for `/api/cron/*`.                      |
| `NEXT_PUBLIC_APP_URL`    | yes      | Public URL used for OAuth callbacks and share links.         |
| `PRODUCTION_URL`         | no       | Target for `pnpm verify:production`.                         |

### 3. Worker

Serverless functions cannot own cron timers or pg-boss workers, so run
`@kestrel/worker` on any small always-on host (a 1 GB VM is enough):

```bash
docker build -f Dockerfile.worker -t kestrel-worker .
docker run -d --env-file .env --name kestrel-worker kestrel-worker
```

The worker needs `DATABASE_URL`, `ENCRYPTION_SECRET`, `CRON_SECRET`, and the
same provider keys as the web app. Its health endpoint is
`$WORKER_HEALTH_PORT/health` and is private by default.

The web app keeps `/api/cron/*` fallbacks for the same jobs so a Vercel-only
deployment can drive them from Vercel Cron or any external scheduler by
sending `Authorization: Bearer $CRON_SECRET`.

---

## Scheduled jobs

The worker runs exactly the jobs that power trading research and maintenance:

| Job                  | Schedule                 | Purpose                                                                                                       |
| :------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------ |
| `alerts`             | every minute             | Price, candle, and indicator alerts via Telegram / Web Push / Email.                                          |
| `briefings`          | every 5 minutes          | Pre/post high-impact macro briefings from `economic_events`.                                                  |
| `cot`                | Fridays 22:00 UTC        | Weekly CFTC Commitment of Traders ingestion.                                                                  |
| `fred-actuals`       | daily 01:30 UTC          | Backfills realized FRED prints into `economic_events`.                                                        |
| `resonance-sync`     | daily 23:00 UTC          | Real yields, breakeven inflation, DXY, and gold divergence.                                                   |
| `retention`          | daily 03:15 UTC          | Purges stale telemetry/traces/quota rows, releases abandoned AI budget reservations, and prunes `candles_1m`. |
| `embedding-backfill` | every 6 hours (optional) | Embeds `news_articles` missing vectors when RAG over news is enabled.                                         |

Snapshot refresh and the weekly review remain available as manual
`/api/cron/snapshots` and `/api/cron/weekly-review` routes for deployments
that want them without the worker.

---

## BYOK and spend budgets

No payment gateway or subscription is required. Users provide their own model
keys from **Settings → Models**; spend is tracked locally in USD.

- `MAX_DAILY_USD` sets the default per-user daily ceiling.
- Budget enforcement is on by default: over-cap turns are rejected with HTTP 429. Set `ENFORCE_BUDGET=0` only for ledger-only metering in local research.
- `ai_budget_reservations` and `daily_ai_spend` are swept by the retention job;
  no billing cron or webhook is needed.

---

## Post-deploy verification

`scripts/verify-production.mjs` runs read-only checks against a live
deployment: public web health (`/api/health/public`), the worker `/health` and
SLO alert contract when configured, and migration status when a direct
database URL is available. It never applies migrations.

- **Vercel:** the `post-deploy-smoke` workflow runs after each production
  deployment event and daily at 06:41 UTC.
- **Manual:** `gh workflow run post-deploy-smoke`, or locally
  `PRODUCTION_URL=https://… pnpm verify:production`.

One-time GitHub setup — **Settings → Secrets and variables → Actions**:

| Name                          | Kind     | Purpose                                                        |
| :---------------------------- | :------- | :------------------------------------------------------------- |
| `KESTREL_PRODUCTION_URL`      | Variable | Public URL; falls back to the Vercel event URL.                |
| `KESTREL_WORKER_HEALTH_URL`   | Variable | Only if the worker health port is reachable from runners.      |
| `KESTREL_WORKER_HEALTH_TOKEN` | Secret   | Bearer token for the worker health check.                      |
| `KESTREL_CRON_SECRET`         | Secret   | Enables the `/api/health/alerts` SLO contract check.           |
| `KESTREL_DIRECT_URL`          | Secret   | Direct (non-pooler) connection for the migration-status check. |

Until a production URL is configured, the workflow exits with a notice instead
of failing.

## Where typechecking runs

`pnpm turbo run typecheck` (the Rust `tsrs` compiler) is the type gate: CI runs
it on every PR. Production builds skip Next.js's duplicate built-in typecheck:
Vercel builds set `NEXT_BUILD_SKIP_TYPECHECK=1` (the merge gate already
typechecked the exact commit), and the Docker builder runs the same
`turbo run typecheck` gate explicitly before compiling.

## Applying environment-variable changes on Vercel

Vercel snapshots environment variables into each deployment, so an env change
needs a new deployment. The project's Root Directory is `apps/web`:

- **Dashboard:** Deployments → Redeploy → uncheck "Use project's Ignore Build
  Step".
- **Git:** push a commit that touches `apps/web/` or a root manifest
  (`turbo.json` treats the lockfile and migration scripts as global
  dependencies).
- **CLI:** deploy a repo-root snapshot:

  ```bash
  git archive HEAD | tar -x -C /tmp/kestrel-deploy
  cd /tmp/kestrel-deploy
  vercel link --yes --project <your-project> --scope <your-scope>
  vercel --prod --yes
  ```
