# Troubleshooting

Start by identifying the deployment profile: Simple/PGlite, Docker Compose, or external PostgreSQL. Do not paste secrets, API keys, cookies, database URLs, or unredacted logs into issues.

## First diagnostics

```bash
node --version
pnpm --version
pnpm verify:local
pnpm check:env-contract
```

For Docker:

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 worker
docker compose logs --tail=100 db
curl -fsS http://localhost:3000/api/health/public
```

For the worker, use `/health/live` for process liveness and `/health/ready` for feed/database readiness. Production health requests may require `WORKER_HEALTH_TOKEN`.

## Setup wizard problems

### `pnpm setup` cannot start

Confirm Node.js is at least 22.13 and pnpm is installed:

```bash
node --version
corepack enable
pnpm --version
```

Preview changes without writing files:

```bash
pnpm setup --dry-run
```

Use `--no-launch` if browser opening or process attachment causes problems.

### Existing configuration is unexpected

The wizard preserves existing files and creates backups before changes. Review `.env.local`, `.env`, and `.kestrel/` locally. Never publish them.

To inspect generated Docker configuration without starting it:

```bash
docker compose config
```

### Port 3000 is already in use

Find the process using the port, stop it, or place Kestrel behind a reverse proxy with an appropriate host-port override. Do not expose the database or worker health port publicly just to solve an application port conflict.

For Docker database host-port conflicts, set a local `POSTGRES_PUBLISHED_PORT`, for example:

```dotenv
POSTGRES_PUBLISHED_PORT=127.0.0.1:5433
```

The application still reaches the database through the internal Compose network.

## Simple/PGlite issues

### PGlite fails to initialize

- Confirm the process can write to `.kestrel/`.
- Stop duplicate development processes.
- Check filesystem permissions and available disk space.
- Do not delete `.kestrel/data` unless you accept losing the local database.
- Existing legacy `.hamafx/` data may be migrated/selected by compatibility code; back it up before cleanup.

Simple mode does not provide pgvector or PostgreSQL RLS. Vector features use the supported fallback and PostgreSQL-only isolation tests cannot run against PGlite.

## Docker issues

### `POSTGRES_PASSWORD` is missing

Generate the Docker environment file:

```bash
./docker/init-secrets.sh
```

Then validate and start:

```bash
docker compose config
docker compose up -d --build
```

### Database is unhealthy

```bash
docker compose ps db
docker compose logs --tail=200 db
docker compose exec db pg_isready -U hamafx -d hamafx
```

Do not remove the database volume as a first response. That destroys local data. Investigate disk space, permissions, container logs, and password/volume consistency first.

### App or worker repeatedly restarts

```bash
docker compose logs --tail=200 app
docker compose logs --tail=200 worker
docker compose ps
```

Common causes include missing production secrets, invalid database URLs, unsupported OSS flags, failed migrations, and missing provider configuration. Fix the underlying configuration; do not disable authentication, TLS, or migration checks.

### Docker build fails

Confirm the lockfile is current and the pinned toolchain is available:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

Review the first failing build stage. Do not add secrets to a Dockerfile or build context.

## Database and migration issues

### Migration fails

Check that you are using a direct/session database URL:

```text
DIRECT_URL or POSTGRES_URL_NON_POOLING
```

Do not use a transaction pooler, commonly port 6543, for DDL. Check migration state and logs before retrying. Never edit an applied migration and never use `drizzle-kit push` against production.

For local Docker, the runtime migrator uses the internal database URL. For external PostgreSQL, confirm TLS, CA configuration, credentials, network access, and database permissions.

### Migration says the schema is already changed

Do not manually delete migration records or edit migration files. Inspect `drizzle.__drizzle_migrations`, compare the deployed source revision, and use the project’s migration reconciliation tooling or create a new corrective migration after review.

### Connection or TLS errors

- Confirm the URL is valid and points to the intended database.
- Confirm production TLS verification is enabled.
- Use `SUPABASE_CA_CERT` only when the managed provider requires a custom CA.
- Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` in production.
- Local bundled Docker PostgreSQL intentionally uses `DB_DISABLE_SSL=true` through Compose; do not copy that setting to external production databases.

## Authentication and access

### Cannot register

The public default is `REGISTRATION_MODE=owner-first`: the first account becomes the owner and later open registration is disabled. Confirm the instance has not already been initialized.

Do not set `REGISTRATION_MODE=open` unless complete multi-user/RLS isolation is approved and enabled; that mode is unsupported by the public OSS release.

### Login or session problems

Confirm production has `AUTH_SECRET` or `NEXTAUTH_SECRET`, `CRON_SECRET`, and `ENCRYPTION_SECRET`. Check that the configured public URL and reverse proxy scheme/host are correct. Clear only the browser’s Kestrel cookies if the deployment was intentionally re-keyed; changing auth secrets invalidates sessions.

### CSRF errors

State-changing browser requests require the CSRF cookie/header pair. Use the application UI or existing client helpers. Do not disable CSRF in production.

### Admin access is missing

In a single-user deployment, the sole authenticated user may be treated as admin when there are no explicitly assigned admin users. Otherwise verify the user role through the application’s supported admin flow.

## AI and provider issues

### Chat says no AI key is configured

Add a provider key under **Settings → API Keys**. Server-level provider keys are optional in the OSS BYOK path. Confirm the selected model/provider combination is supported and that the provider account has quota.

### AI request fails or times out

Check provider status, model identifier, account quota, rate limits, network access, and the Kestrel daily budget. Do not increase tool-loop limits or remove budget guards as a first response.

### Market data is missing

Providers are optional and subject to availability and licensing. Check provider configuration and logs. Kestrel uses health-aware failover where available; an empty or stale result should be treated as uncertain, not as current truth.

For deterministic local development without market-data network requests:

```bash
KESTREL_OFFLINE_MODE=1 pnpm dev:local
```

Offline mode does not provide a substitute AI model for normal chat.

### Web search is unavailable

Web search requires `WEB_SEARCH_ENABLED=1` plus a configured supported provider key. External content is untrusted and may be blocked by SSRF and safety checks.

## Worker and health issues

### `/health/live` works but `/health/ready` fails

This means the worker process is running but its feed or readiness dependency is not healthy. Check worker logs, market-feed URL, network access, database connectivity, recent tick activity, and configured symbols.

### Worker has no live ticks

Check:

- `BIQUOTE_HUB_URL`
- Network/firewall egress
- Symbol configuration
- Provider availability
- Worker mode and container logs
- Whether the provider requires a proxy or is blocked in the deployment region

Do not expose the worker port publicly to debug it; inspect logs or use a private network.

### Jobs run twice

Check scheduler ownership. Docker mode uses the internal scheduler; systemd/VM or external cron should not independently run the same heavy jobs. Job locks and idempotency should prevent duplicate effects, but overlapping schedulers still create load and confusing logs.

## Backups and restore

### Backup service is unhealthy

```bash
docker compose logs --tail=200 backup
docker compose run --rm --no-deps backup /usr/local/bin/backup-healthcheck.sh
```

Confirm the database is healthy, `POSTGRES_PASSWORD` matches, the backup volume is writable, and retention values are positive integers.

### Restore a local Docker backup

Restoration replaces the current database and stops application writers. It requires explicit confirmation:

```bash
KESTREL_RESTORE_CONFIRM=YES ./docker/restore-db.sh latest
```

Back up the current database first if it is still recoverable. Always preserve `ENCRYPTION_SECRET`; a database backup without the matching encryption secret cannot restore BYOK usability.

Local Docker backup volumes do not protect against host loss. Copy archives off-host and periodically rehearse restoration on disposable infrastructure.

## Observability

Sentry and Langfuse are optional. If enabled, inspect provider configuration, network access, and retention settings. Keep `LANGFUSE_RECORD_IO=0` unless prompt/output capture has been deliberately approved.

## When opening an issue

Include:

- Kestrel commit/release version
- OS and architecture
- Node.js and pnpm versions
- Docker version and Compose version, if applicable
- Deployment profile
- Relevant sanitized command output
- Exact reproduction steps
- Whether the problem is reproducible with a fresh non-production instance

Remove secrets, URLs containing credentials, cookies, authorization headers, private user data, and unredacted prompts before posting.
