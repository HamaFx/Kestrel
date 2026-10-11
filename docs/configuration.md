# Configuration reference

This document describes the supported private self-hosting configuration contract for Kestrel. The canonical validation sources are:

- `packages/shared/src/env.ts` — web/server environment
- `apps/worker/src/env.ts` — worker environment
- `scripts/setup/secret-template.json` — generated Docker defaults
- `docker-compose.yml` — Docker service wiring

Use `pnpm setup` for normal installations. Do not copy production secrets into tracked files.

## Deployment profiles

| Profile             | Configuration source             | Database                 | Worker   |
| ------------------- | -------------------------------- | ------------------------ | -------- |
| Docker              | `.env` plus Compose defaults     | PostgreSQL 16 + pgvector | Yes      |
| External PostgreSQL | Operator-managed environment     | External PostgreSQL      | Optional |

Kestrel is a private self-hosted multi-user platform: every deployment uses PostgreSQL with row-level security (RLS) and requires an explicit `role='admin'` for administration.

## Required deployment environment

```dotenv
MULTI_USER_ENABLED=1
KESTREL_ENABLE_RLS=1
REGISTRATION_MODE=open        # or 'disabled' for invite-only
```

Tenant isolation is enforced via Postgres RLS on every user-data table with explicit admin roles.

## Secrets and database

| Variable                                   | Required        | Used by                 | Description                                                           |
| ------------------------------------------ | --------------- | ----------------------- | --------------------------------------------------------------------- |
| `AUTH_SECRET`                              | Production      | Web                     | Canonical Auth.js JWT signing secret; at least 32 characters          |
| `CRON_SECRET`                              | Production      | Web/worker integrations | Bearer secret for cron endpoints; at least 16 characters              |
| `ENCRYPTION_SECRET`                        | Production      | Web                     | Encryption key for BYOK and protected secrets; back it up securely    |
| `POSTGRES_PASSWORD`                        | Docker          | Compose                 | Password for the bundled PostgreSQL service                           |
| `DATABASE_URL` or `POSTGRES_URL`           | External DB/app | Web/worker              | Runtime database connection                                           |
| `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` | Migrations      | Migration tooling       | Direct/session database connection; do not use a transaction pooler   |
| `DATABASE_URL_REPLICA`                     | Optional        | Web                     | Read-only replica for read-heavy queries                              |
| `SUPABASE_CA_CERT`                         | Optional        | Web/worker/migrations   | CA certificate for managed PostgreSQL TLS                             |
| `ADMIN_DATABASE_URL`                       | Required        | Web/worker             | Dedicated `BYPASSRLS` connection for tenant lookup, worker, and cron operations |

PostgreSQL is required in every environment; provide `DATABASE_URL` or `POSTGRES_URL`.

## Application and runtime

| Variable                      | Default                   | Description                                                  |
| ----------------------------- | ------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                    | `development`             | `development`, `test`, or `production`                       |
| `NEXT_PUBLIC_APP_URL`         | `http://localhost:3000`   | Browser-visible application URL                              |
| `NEXTAUTH_URL`                | Setup-generated/local URL | Auth callback and cookie URL                                 |
| `MAX_DAILY_USD`               | `5`                       | Admin reporting ceiling — spend is ledgered, never blocking   |
| `ENFORCE_BUDGET`              | `0`                       | Q4: ledger-only budget by default; `1` restores the hard cap (429) |
| `MAX_TOOL_ITERATIONS`         | `6`                       | Maximum tool-loop iterations per chat turn                   |
| `AI_SEMANTIC_ROUTING_ENABLED` | `0`                       | Enables semantic routing before keyword fallback             |
| `KESTREL_OFFLINE_MODE`        | `0`                       | Enables deterministic synthetic market-data mode             |
| `LOG_PROMPTS`                 | `0`                       | Prompt logging; keep disabled unless intentionally debugging |
| `ALERT_WINDOW_HOURS`          | `1`                       | Health-alert evaluation window                               |
| `PHASE2_PACKET_CACHE`         | `1`                       | 30s fresh-only research packet cache (§2.1)                  |
| `PHASE3_MODEL_DIVERSITY`      | `0`                       | Per-committee-agent models from user overrides (§3.1)        |
| `ENABLE_COMMITTEE_CRITIQUE`   | `1`                       | Cross-critique round for Full mode (Q6; `0` disables)        |
| `PHASE3_STRUCTURED_FUSION`    | `0`                       | Structured fusion output for Full mode (§3.3)                |
| `REDIS_URL`                   | *(unset)*                 | Optional shared Redis for the packet cache (§2.1)            |
| `MASTRA_COMMITTEE_MODELS`     | *(unset)*                 | Optional JSON of per-specialist model picks (§3.1, top-tier only) |
| `MASTRA_XAUUSD_MODEL`         | *(unset)*                 | Pin the XAUUSD verified-report model (`provider:model`)      |

## AI configuration

Kestrel supports per-user BYOK through the application. Server-level AI credentials are optional in the self-hosting path.

| Variable                       | Description                               |
| ------------------------------ | ----------------------------------------- |
| `AI_GATEWAY_API_KEY`           | Optional AI Gateway credential            |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional direct Gemini API credential     |
| `AI_DEFAULT_MODEL`             | Default model, `google/gemini-2.5-flash`  |
| `AI_TITLE_MODEL`               | Title/planner fallback model              |
| `AI_EMBEDDING_MODEL`           | Embedding model                           |

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

| Variable                       | Description                             |
| ------------------------------ | --------------------------------------- |
| `TELEGRAM_BOT_TOKEN`           | Telegram bot credential                 |
| `TELEGRAM_CHAT_ID`             | Telegram destination                    |
| `TELEGRAM_SECRET_TOKEN`        | Telegram webhook secret                 |
| `RESEND_API_KEY`               | Email provider credential               |
| `ALERT_FROM_EMAIL`             | Alert sender address                    |
| `ALERT_TO_EMAIL`               | Alert recipient address                 |
| `VAPID_PUBLIC_KEY`             | Server-side Web Push public key         |
| `VAPID_PRIVATE_KEY`            | Server-side Web Push private key        |
| `VAPID_SUBJECT`                | VAPID contact subject                   |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser-readable matching public key    |
| `SUPABASE_URL`                 | Optional Supabase Storage URL           |
| `SUPABASE_SERVICE_ROLE_KEY`    | Server-only Supabase service credential |
| `CHAT_IMAGES_BUCKET`           | Storage bucket used for chat images     |

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
| `AI_EVALUATION_RETENTION_DAYS` | `90`    | AI evaluation retention               |

Review privacy, retention, and provider terms before enabling telemetry or prompt/output capture.

## Billing

Billing is disabled unless `BILLING_ENABLED=1` — it is a self-host opt-in and is not part of the normal path.

| Variable                 | Default     | Description                   |
| ------------------------ | ----------- | ----------------------------- |
| `BILLING_ENABLED`        | `0`         | Explicit billing feature flag |
| `NOWPAYMENTS_API_KEY`    | unset       | NOWPayments API credential    |
| `NOWPAYMENTS_IPN_SECRET` | unset       | Webhook signature secret      |
| `NOWPAYMENTS_API_BASE`   | Sandbox URL | NOWPayments API endpoint      |

Never enable billing without reviewing webhook safety, legal terms, idempotency, and operator responsibilities.

## Worker configuration

| Variable                 | Default/required                         | Description                                                           |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------- |
| `WORKER_MODE`            | `systemd`                                | `systemd` uses external scheduling; `docker` uses internal scheduling |
| `WORKER_HEALTH_TOKEN`    | Required in production; optional locally | Bearer token for worker health endpoints                              |
| `BIQUOTE_HUB_URL`        | BiQuote SignalR URL                      | Live market feed endpoint                                             |
| `BIQUOTE_PROXY_TOKEN`    | Required in production; optional locally | Bearer token for the worker’s BiQuote proxy                           |
| `BINANCE_CRYPTO_SYMBOLS` | Catalog default                          | Comma-separated crypto symbols                                        |
| `BINANCE_WS_URL`         | Optional                                 | Binance WebSocket base URL                                            |
| `WORKER_DB_POOL_MAX`     | Code default                             | Worker PostgreSQL pool size                                           |
| `DATASETS_DIR`           | Worker default                           | Dataset export directory                                              |
| `EVAL_REPORTS_DIR`       | Derived default                          | Evaluation report directory                                           |
| `DEPLOYED_SHA`           | `unknown`                                | Deployment revision label                                             |

The worker exposes `/health/live` and `/health/ready` on port `8081`, and the optional `/biquote` proxy on port `8082`. Both bind privately by default; if either must be reachable by an orchestrator, use a private network or loopback binding and pass the matching bearer token. Production worker startup fails without both `WORKER_HEALTH_TOKEN` and `BIQUOTE_PROXY_TOKEN`. Never expose either port directly to the public internet.

## Docker-only settings

The setup wizard generates these values in `.env`:

- `POSTGRES_PASSWORD`
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
