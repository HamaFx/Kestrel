# Configuration reference

This document describes the supported private self-hosting configuration contract for Kestrel. The canonical validation sources are:

- `packages/shared/src/env/index.ts` — web/server environment
- `apps/worker/src/env.ts` — worker environment
- `scripts/setup/secret-template.json` — generated Docker defaults
- `docker-compose.yml` — Docker service wiring

Use `pnpm setup` for normal installations. Do not copy production secrets into tracked files.

## Deployment profiles

| Profile             | Configuration source         | Database                 | Worker   |
| ------------------- | ---------------------------- | ------------------------ | -------- |
| Docker              | `.env` plus Compose defaults | PostgreSQL 16 + pgvector | Yes      |
| External PostgreSQL | Operator-managed environment | External PostgreSQL      | Optional |

Kestrel is a private self-hosted multi-user platform: every deployment uses PostgreSQL with row-level security (RLS) and requires an explicit `role='admin'` for administration.

## Required deployment environment

```dotenv
MULTI_USER_ENABLED=1
KESTREL_ENABLE_RLS=1
REGISTRATION_MODE=open        # or 'disabled' for invite-only
```

Tenant isolation is enforced via Postgres RLS on every user-data table with explicit admin roles.

## Secrets and database

| Variable                                   | Required        | Used by                 | Description                                                                     |
| ------------------------------------------ | --------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `AUTH_SECRET`                              | Production      | Web                     | Canonical Auth.js JWT signing secret; at least 32 characters                    |
| `CRON_SECRET`                              | Production      | Web/worker integrations | Bearer secret for cron endpoints; at least 16 characters                        |
| `ENCRYPTION_SECRET`                        | Production      | Web                     | Encryption key for BYOK and protected secrets; back it up securely              |
| `POSTGRES_PASSWORD`                        | Docker          | Compose                 | Password for the bundled PostgreSQL service                                     |
| `POSTGRES_ADMIN_PASSWORD`                  | Docker          | Compose/init script     | Password for the `hamafx_admin` role (`BYPASSRLS`)                              |
| `POSTGRES_APP_PASSWORD`                    | Docker          | Compose/init script     | Password for the `kestrel_app` role (`LOGIN`, `NOBYPASSRLS`); see below         |
| `DATABASE_URL` or `POSTGRES_URL`           | External DB/app | Web/worker              | Runtime database connection                                                     |
| `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` | Migrations      | Migration tooling       | Direct/session database connection; do not use a transaction pooler             |
| `DATABASE_URL_REPLICA`                     | Optional        | Web                     | Read-only replica for read-heavy queries                                        |
| `SUPABASE_CA_CERT`                         | Optional        | Web/worker/migrations   | CA certificate for managed PostgreSQL TLS                                       |
| `ADMIN_DATABASE_URL`                       | Required        | Web/worker              | Dedicated `BYPASSRLS` connection for tenant lookup, worker, and cron operations |

PostgreSQL is required in every environment; provide `DATABASE_URL` or `POSTGRES_URL`.

## Database roles and row-level security

Two database roles back a deployment:

| Role           | Attributes                          | Used by                                                         |
| -------------- | ----------------------------------- | --------------------------------------------------------------- |
| `kestrel_app`  | `LOGIN`, `NOBYPASSRLS`              | Web application and worker app traffic (`DATABASE_URL`)         |
| `hamafx_admin` | `LOGIN`, `BYPASSRLS`, `NOSUPERUSER` | Worker, cron, and administrative paths via `ADMIN_DATABASE_URL` |

Postgres row-level security only applies to a connection whose role cannot bypass it.
Migration `0094` creates `kestrel_app` deliberately `NOLOGIN` — credentials must never
live in migration history — and migration `0119` grants it privileges on all tables,
sequences, and future objects. Provisioning supplies the missing deployment half
(LOGIN plus password):

- **Fresh volumes** — `docker/postgres/init-admin-role.sh` creates `kestrel_app` and
  `hamafx_admin` from `POSTGRES_APP_PASSWORD` and `POSTGRES_ADMIN_PASSWORD` when the
  volume is first created. `./docker/init-secrets.sh` generates both.
- **Existing volumes** — the init script never re-runs. Provision once with a direct
  connection whose role can create and alter roles:

  ```bash
  POSTGRES_APP_PASSWORD=<16+ character secret> \
    DIRECT_URL=postgres://hamafx:...@db:5432/hamafx \
    pnpm --filter @kestrel/db provision:app-role
  ```

  The script prefers `DIRECT_URL`, then `POSTGRES_URL_NON_POOLING`,
  `ADMIN_DATABASE_URL`, and `DATABASE_URL`. It creates the role when absent and
  otherwise re-applies the exact same attributes, grants, and default privileges, so
  it is safe to re-run. It never prints the password and refuses a password shorter
  than 16 characters. Add the same value to `.env` so Compose keeps passing it.

> **Compose selects the app role automatically when the credential exists.**
> `DATABASE_URL` is
> `postgres://${POSTGRES_APP_PASSWORD:+kestrel_app:}${POSTGRES_APP_PASSWORD:-hamafx:${POSTGRES_PASSWORD}}@db:5432/hamafx`,
> so a fresh install (where `./docker/init-secrets.sh` generated
> `POSTGRES_APP_PASSWORD`) connects as `kestrel_app` and RLS is enforced. An existing
> volume that has not run the provisioning step above has no such credential and
> therefore still connects as `hamafx` — a Postgres superuser — which bypasses every
> policy even with `FORCE ROW LEVEL SECURITY`. Provision the role, add
> `POSTGRES_APP_PASSWORD` to `.env`, and restart to close that gap. To verify a running
> deployment, check that `current_user` is `kestrel_app` with `rolbypassrls = false`.

## Application and runtime

| Variable                      | Default                   | Description                                                       |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                    | `development`             | `development`, `test`, or `production`                            |
| `NEXT_PUBLIC_APP_URL`         | `http://localhost:3000`   | Browser-visible application URL                                   |
| `NEXTAUTH_URL`                | Setup-generated/local URL | Auth callback and cookie URL                                      |
| `MAX_DAILY_USD`               | `5`                       | Per-user daily ceiling — enforced when `ENFORCE_BUDGET=1`         |
| `ENFORCE_BUDGET`              | `1`                       | Daily cap is enforced (429); `0` = ledger-only observation        |
| `MAX_TOOL_ITERATIONS`         | `6`                       | Maximum tool-loop iterations per chat turn                        |
| `AI_SEMANTIC_ROUTING_ENABLED` | `0`                       | Enables semantic routing before keyword fallback                  |
| `KESTREL_OFFLINE_MODE`        | `0`                       | Enables deterministic synthetic market-data mode                  |
| `LOG_PROMPTS`                 | `0`                       | Prompt logging; keep disabled unless intentionally debugging      |
| `ALERT_WINDOW_HOURS`          | `1`                       | Health-alert evaluation window                                    |
| `PHASE2_PACKET_CACHE`         | `1`                       | 30s fresh-only research packet cache (§2.1)                       |
| `PHASE3_MODEL_DIVERSITY`      | `0`                       | Per-committee-agent models from user overrides (§3.1)             |
| `ENABLE_COMMITTEE_CRITIQUE`   | `1`                       | Cross-critique round for Full mode (Q6; `0` disables)             |
| `PHASE3_STRUCTURED_FUSION`    | `0`                       | Structured fusion output for Full mode (§3.3)                     |
| `ENABLE_GENERIC_MACRO`        | `1`                       | Generic macro packet for non-XAUUSD symbols (M-02; `0` rollback)  |
| `ENABLE_COMPARISON_RISK_DESK` | `1`                       | Technical + risk desks per symbol in comparisons (P1-04)          |
| `REDIS_URL`                   | _(unset)_                 | Optional shared Redis for the packet cache (§2.1)                 |
| `MASTRA_COMMITTEE_MODELS`     | _(unset)_                 | Optional JSON of per-specialist model picks (§3.1, top-tier only) |
| `MASTRA_XAUUSD_MODEL`         | _(unset)_                 | Pin the XAUUSD verified-report model (`provider:model`)           |

## AI configuration

Kestrel supports per-user BYOK through the application. Server-level AI credentials are optional in the self-hosting path.

| Variable                       | Description                              |
| ------------------------------ | ---------------------------------------- |
| `AI_GATEWAY_API_KEY`           | Optional AI Gateway credential           |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional direct Gemini API credential    |
| `AI_DEFAULT_MODEL`             | Default model, `google/gemini-2.5-flash` |
| `AI_TITLE_MODEL`               | Title/planner fallback model             |
| `AI_EMBEDDING_MODEL`           | Embedding model                          |

Users configure provider keys under **Settings → API Keys**. Never log or commit credentials.

## Market-data and research providers

| Variable                        | Description                                                 |
| ------------------------------- | ----------------------------------------------------------- |
| `BIQUOTE_BASE_URL`              | Optional BiQuote base URL; defaults to `https://biquote.io` |
| `FINNHUB_API_KEY`               | Optional Finnhub fallback key                               |
| `MARKETAUX_API_KEY`             | Optional news provider key                                  |
| `FRED_API_KEY`                  | Optional FRED macro-data key                                |
| `EXA_API_KEY`                   | Optional Exa web-search key                                 |
| `TAVILY_API_KEY`                | Optional Tavily web-search key                              |
| `BRAVE_SEARCH_API_KEY`          | Optional Brave Search key                                   |
| `WEB_SEARCH_ENABLED`            | Enables server-side web research; default `0`               |
| `WEB_SEARCH_PROVIDER`           | `exa`, `tavily`, or `brave`; default `exa`                  |
| `WEB_SEARCH_FALLBACK_PROVIDERS` | Comma-separated fallback providers                          |
| `WEB_SEARCH_MAX_RESULTS`        | Maximum results per call; default `6`                       |
| `WEB_SEARCH_MAX_CALLS_PER_TURN` | Maximum calls per turn; default `2`                         |
| `WEB_SEARCH_CACHE_TTL_SECONDS`  | Search cache TTL; default `600`                             |
| `WEB_SEARCH_TIMEOUT_MS`         | Search timeout; default `8000`                              |

Provider availability, cost, rate limits, licensing, and redistribution rights remain the operator’s responsibility.

## Notifications and storage

| Variable                       | Description                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`           | Telegram bot credential                                                                          |
| `TELEGRAM_CHAT_ID`             | Telegram destination                                                                             |
| `TELEGRAM_SECRET_TOKEN`        | Telegram webhook secret                                                                          |
| `TELEGRAM_PLUGIN_SECRET`       | Optional signing key for the Telegram plugin's link/webhook tokens (falls back to `AUTH_SECRET`) |
| `RESEND_API_KEY`               | Email provider credential                                                                        |
| `ALERT_FROM_EMAIL`             | Alert sender address                                                                             |
| `ALERT_TO_EMAIL`               | Alert recipient address                                                                          |
| `VAPID_PUBLIC_KEY`             | Server-side Web Push public key                                                                  |
| `VAPID_PRIVATE_KEY`            | Server-side Web Push private key                                                                 |
| `VAPID_SUBJECT`                | VAPID contact subject                                                                            |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser-readable matching public key                                                             |
| `SUPABASE_URL`                 | Optional Supabase Storage URL                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`    | Server-only Supabase service credential                                                          |

Keep service-role credentials server-only. The VAPID public keys must match exactly.

## Observability and retention

Langfuse is optional and should remain disabled unless deliberately configured. The bundled observability overlay is **not loaded by default**. To run it, generate the overlay secrets and combine both Compose files:

```bash
./docker/init-secrets.sh --with-observability
docker compose -f docker-compose.yml \
  -f docker-compose.observability.yml --profile observability up -d
```

The overlay starts ClickHouse, Redis, MinIO (S3), Langfuse, and its worker. The trace viewer is at `http://localhost:3001`. The setup wizard (`pnpm setup --with-observability`) records `LANGFUSE_BASE_URL=http://langfuse:3000` in `.env` (the internal Compose service URL; the host-facing viewer stays at port 3001). The project keys still have to be created in the Langfuse UI and added as `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`. Kestrel does not use Sentry.

| Variable                       | Default | Description                           |
| ------------------------------ | ------- | ------------------------------------- |
| `LANGFUSE_PUBLIC_KEY`          | unset   | Optional Langfuse key                 |
| `LANGFUSE_SECRET_KEY`          | unset   | Optional Langfuse secret              |
| `LANGFUSE_BASE_URL`            | unset   | Langfuse endpoint                     |
| `LANGFUSE_RELEASE`             | unset   | Release label                         |
| `LANGFUSE_TRACING_ENVIRONMENT` | unset   | Environment label                     |
| `LANGFUSE_RECORD_IO`           | `0`     | Explicit prompt/output capture opt-in |
| `TELEMETRY_RETENTION_DAYS`     | `90`    | Telemetry retention                   |
| `TRACE_RETENTION_DAYS`         | `30`    | Diagnostic trace retention            |
| `CRON_RUN_RETENTION_DAYS`      | `30`    | Cron history retention                |
| `CREDIT_LEDGER_RETENTION_DAYS` | `730`   | Billing ledger/audit retention        |

Review privacy, retention, and provider terms before enabling telemetry or prompt/output capture.

## BYOK and local spend budgets

Kestrel has no subscriptions, credit wallets, or payment gateways. Users bring
their own provider keys (BYOK), and spend is tracked locally in USD.

| Variable                            | Default | Description                                                        |
| ----------------------------------- | ------- | ------------------------------------------------------------------ |
| `MAX_DAILY_USD`                     | `5`     | Default per-user daily AI ceiling (USD)                            |
| `ENFORCE_BUDGET`                    | `false` | `true` blocks over-cap turns with HTTP 429; default is ledger-only |
| `BUDGET_RESERVATION_RETENTION_DAYS` | `90`    | Retention for terminal `ai_budget_reservations` rows               |

- `packages/ai/src/budget.ts` is the only admission path; it writes
  `daily_ai_spend` and `ai_budget_reservations` atomically.
- `packages/ai/src/budget/cost.ts` is the only model price source.
- BYOK keys are encrypted at rest by `@kestrel/shared`; `/settings/models`
  manages them. There is no remote billing dependency and no webhook surface.

## Worker configuration

| Variable                    | Default/required                                              | Description                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKER_MODE`               | `docker`                                                      | `docker` runs the internal node-cron scheduler (the profile this repo ships); `systemd` expects operator-provided job units, and with none installed no job runs |
| `WORKER_ENABLE_TICK_STREAM` | `0` (default on-demand REST mode)                             | `0` disables 24/7 SignalR/Binance DB tick streaming; `1` enables legacy stream                                                                                   |
| `WORKER_HEALTH_TOKEN`       | Required in production; optional locally                      | Bearer token for worker health endpoints                                                                                                                         |
| `BIQUOTE_HUB_URL`           | BiQuote SignalR URL                                           | Live market feed endpoint (used when `WORKER_ENABLE_TICK_STREAM=1`)                                                                                              |
| `BIQUOTE_PROXY_TOKEN`       | Optional in on-demand mode; required when tick stream enabled | Bearer token for the worker’s optional `:8082` BiQuote proxy                                                                                                     |
| `BINANCE_CRYPTO_SYMBOLS`    | Catalog default                                               | Comma-separated crypto symbols                                                                                                                                   |
| `BINANCE_WS_URL`            | Optional                                                      | Binance WebSocket base URL                                                                                                                                       |
| `WORKER_DB_POOL_MAX`        | Code default                                                  | Worker PostgreSQL pool size                                                                                                                                      |
| `DATASETS_DIR`              | Worker default                                                | Dataset export directory                                                                                                                                         |
| `EVAL_REPORTS_DIR`          | Derived default                                               | Evaluation report directory                                                                                                                                      |
| `DEPLOYED_SHA`              | `unknown`                                                     | Deployment revision label                                                                                                                                        |

The worker exposes `/health/live` and `/health/ready` on port `8081`, and the optional `/biquote` proxy on port `8082` (when `BIQUOTE_PROXY_TOKEN` is set). Both bind privately by default; if either must be reachable by an orchestrator, use a private network or loopback binding and pass the matching bearer token. Production worker startup requires `WORKER_HEALTH_TOKEN` (and `BIQUOTE_PROXY_TOKEN` when `WORKER_ENABLE_TICK_STREAM=1`). Never expose either port directly to the public internet.

Every registered scheduler job has a healthchecks.io signal. Set the matching `HC_JOB_*_UUID` to turn a ping on; an unset UUID is a no-op, so a job can stop running silently until it is configured. The vars are `HC_JOB_ALERTS_UUID`, `HC_JOB_BRIEFINGS_UUID`, `HC_JOB_SNAPSHOTS_UUID`, `HC_JOB_COT_UUID`, `HC_JOB_FRED_ACTUALS_UUID`, `HC_JOB_WEEKLY_REVIEW_UUID`, `HC_JOB_RESONANCE_SYNC_UUID`, `HC_JOB_EMBEDDING_BACKFILL_UUID`, `HC_JOB_OPINION_CALIBRATION_UUID`, `HC_JOB_BUDGET_RECOVERY_UUID`, `HC_JOB_PERSISTENCE_RECOVERY_UUID`, `HC_JOB_RETENTION_UUID`, `HC_JOB_METRICS_FLUSH_UUID`, `HC_JOB_DATASET_EXPORT_UUID`, and `HC_JOB_MULTI_AGENT_ANALYSIS_UUID`.

Three job-oriented endpoints sit alongside them:

- `/health/jobs` (200/503) reports `stuckJobs` (a scheduled job past its budget plus a five-minute grace — the in-flight guard would otherwise skip it forever), `runningJobs` (in-flight and inside budget, so a long backtest or committee run is **busy**, not wedged), and a sampled `queueHealth` block with per-queue counts plus the newest dead letters.
- `/health/idle` (200/503) is the restart gate: 200 only when no scheduled job and no queue job is in flight. The VM self-update script waits on it before recreating the worker container and defers the update when the worker stays busy.
- `/health/dependencies` reports the redacted capability report.

A pg-boss job that exhausts its retries is copied to a dead-letter queue (`backtest-run-dlq`, `backtest-sweep-dlq`, `candle-flush-dlq`) and kept for 30 days instead of being deleted silently. It appears in `queueHealth` and is logged once as `background job dead-lettered`; redrive it with pg-boss `redrive()` when the cause is fixed. A long backtest or sweep job is heartbeated every 60s while a worker holds it, so a dead worker's claim is retried in about two minutes; the hard per-attempt ceiling stays 600s for a single run and 7,200s for a sweep (the engine's worst case is 200 combinations x 2 sandbox slices x 5s, plus fetch and simulator time).

## Custom Agents and MCP

The Custom Agents plugin can connect a user-authored agent to a remote Model
Context Protocol server. URLs are user input, so the bridge is an SSRF
boundary:

| Variable                  | Default | Description                                                                                                         |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `MCP_ALLOW_PRIVATE_HOSTS` | `0`     | Allow loopback/private/link-local/CGNAT MCP hosts (including `http://localhost`). Enable only on a trusted network. |
| `MCP_ALLOW_INSECURE_URLS` | `0`     | Allow plain `http://` for non-loopback hosts. HTTPS is required otherwise.                                          |

TLS is always required for public endpoints. Credentials embedded in a URL are
rejected; use the encrypted authorization field instead. MCP tool discovery has
a 15-second timeout and fails open (the agent keeps its other tools).

## Docker-only settings

The setup wizard generates these values in `.env`:

- `POSTGRES_PASSWORD`
- `POSTGRES_ADMIN_PASSWORD`
- `POSTGRES_APP_PASSWORD`
- `POSTGRES_VOLUME_NAME`
- `BACKUP_VOLUME_NAME`
- `BACKUP_INTERVAL_SECONDS`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_MAX_AGE_SECONDS`
  The optional observability overlay uses `LANGFUSE_NEXTAUTH_SECRET`, `LANGFUSE_SALT`, `LANGFUSE_ENCRYPTION_KEY`, `LANGFUSE_CLICKHOUSE_PASSWORD`, `LANGFUSE_REDIS_PASSWORD`, `LANGFUSE_S3_ACCESS_KEY_ID`, and `LANGFUSE_S3_SECRET_ACCESS_KEY`. Run `./docker/init-secrets.sh --with-observability` to add only those values when enabling the overlay. The default generator leaves them out. Existing `.env` files are preserved.

## Deprecated and compatibility variables

Use the canonical `KESTREL_*` and `AUTH_SECRET` names for all deployments. All legacy aliases (`NEXTAUTH_SECRET`, `HAMAFX_*`) have been removed as of 0.3.0. Canonical environment variables are enforced strictly.

State-changing JSON API routes use the bounded `parseJsonBody` helper, which enforces a size limit and body-read timeout; new routes must use it instead of calling `req.json()` directly.

## Configuration changes

When adding an environment variable:

1. Add it to the appropriate canonical schema.
2. Add it to `.env.example` or the setup template when public operators need it.
3. Update Compose or worker wiring if applicable.
4. Add validation/tests.
5. Update this document and release notes.
6. Check that the variable cannot expose secrets to the browser or logs.
