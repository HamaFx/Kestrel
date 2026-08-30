# Configuration reference

This document describes the public configuration contract for Kestrel. The canonical validation sources are:

- `packages/shared/src/env.ts` — web/server environment
- `apps/worker/src/env.ts` — worker environment
- `scripts/setup/secret-template.json` — generated Docker defaults
- `docker-compose.yml` — Docker service wiring

Use `pnpm setup` for normal installations. Do not copy production secrets into tracked files.

## Deployment profiles

| Profile | Configuration source | Database | Worker |
| --- | --- | --- | --- |
| Simple | `.env.local` plus generated local secrets | Embedded PGlite | No |
| Docker | `.env` plus Compose defaults | PostgreSQL 16 + pgvector | Yes |
| External PostgreSQL | Operator-managed environment | External PostgreSQL | Optional |
| Maintainer | Private deployment configuration | Managed PostgreSQL | Yes |

The public release is single-user only. Shared multi-user/RLS mode is unsupported.

## Required OSS boundary

```dotenv
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
BYOK_ENABLED=1
```

Do not change these values for a shared public instance. Enabling flags does not complete tenant isolation.

## Secrets and database

| Variable | Required | Used by | Description |
| --- | --- | --- | --- |
| `AUTH_SECRET` or `NEXTAUTH_SECRET` | Production | Web | Auth.js JWT signing secret; at least 32 characters |
| `CRON_SECRET` | Production | Web/worker integrations | Bearer secret for cron endpoints; at least 16 characters |
| `ENCRYPTION_SECRET` | Production | Web | Encryption key for BYOK and protected secrets; back it up securely |
| `POSTGRES_PASSWORD` | Docker | Compose | Password for the bundled PostgreSQL service |
| `DATABASE_URL` or `POSTGRES_URL` | External DB/app | Web/worker | Runtime database connection |
| `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` | Migrations | Migration tooling | Direct/session database connection; do not use a transaction pooler |
| `DATABASE_URL_REPLICA` | Optional | Web | Read-only replica for read-heavy queries |
| `SUPABASE_CA_CERT` | Optional | Web/worker/migrations | CA certificate for managed PostgreSQL TLS |
| `ADMIN_DATABASE_URL` | Experimental | Worker/admin paths | Separate privileged database connection; not part of normal OSS setup |

Simple development can omit database URLs and use PGlite. Production Docker and external PostgreSQL deployments require a database URL.

## Application and runtime

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Browser-visible application URL |
| `NEXTAUTH_URL` | Setup-generated/local URL | Auth callback and cookie URL |
| `MAX_DAILY_USD` | `5` | Daily AI budget ceiling |
| `MAX_TOOL_ITERATIONS` | `6` | Maximum tool-loop iterations per chat turn |
| `AI_SEMANTIC_ROUTING_ENABLED` | `0` | Enables semantic routing before keyword fallback |
| `KESTREL_OFFLINE_MODE` | `0` | Enables deterministic synthetic market-data mode |
| `LOG_PROMPTS` | `0` | Prompt logging; keep disabled unless intentionally debugging |
| `ALERT_WINDOW_HOURS` | `1` | Health-alert evaluation window |

## AI configuration

Kestrel supports per-user BYOK through the application. Server-level AI credentials are optional in the OSS path.

| Variable | Description |
| --- | --- |
| `AI_GATEWAY_API_KEY` | Optional Vercel AI Gateway credential |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional direct Gemini API credential |
| `GOOGLE_VERTEX_PROJECT` | Google Cloud project for Vertex AI |
| `GOOGLE_VERTEX_LOCATION` | Vertex AI region |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Service-account JSON supplied as a value |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service-account credentials |
| `AI_DEFAULT_MODEL` | Default model, `google-vertex/gemini-2.5-flash` |
| `AI_TITLE_MODEL` | Title/planner fallback model |
| `AI_EMBEDDING_MODEL` | Embedding model |

Users configure provider keys under **Settings → API Keys**. Never log or commit credentials.

## Market-data and research providers

| Variable | Description |
| --- | --- |
| `BIQUOTE_BASE_URL` | Optional BiQuote base URL; defaults to `https://biquote.io` |
| `FINNHUB_API_KEY` | Optional Finnhub fallback key |
| `MARKETAUX_API_KEY` | Optional news provider key |
| `FRED_API_KEY` | Optional FRED macro-data key |
| `EXA_API_KEY` | Optional Exa web-search key |
| `TAVILY_API_KEY` | Optional Tavily web-search key |
| `BRAVE_SEARCH_API_KEY` | Optional Brave Search key |
| `WEB_SEARCH_ENABLED` | Enables server-side web research; default `0` |
| `WEB_SEARCH_PROVIDER` | `exa`, `tavily`, or `brave`; default `exa` |
| `WEB_SEARCH_FALLBACK_PROVIDERS` | Comma-separated fallback providers |
| `WEB_SEARCH_MAX_RESULTS` | Maximum results per call; default `6` |
| `WEB_SEARCH_MAX_CALLS_PER_TURN` | Maximum calls per turn; default `2` |
| `WEB_SEARCH_CACHE_TTL_SECONDS` | Search cache TTL; default `600` |
| `WEB_SEARCH_TIMEOUT_MS` | Search timeout; default `8000` |

Provider availability, cost, rate limits, licensing, and redistribution rights remain the operator’s responsibility.

## Notifications and storage

| Variable | Description |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram bot credential |
| `TELEGRAM_CHAT_ID` | Telegram destination |
| `TELEGRAM_SECRET_TOKEN` | Telegram webhook secret |
| `RESEND_API_KEY` | Email provider credential |
| `ALERT_FROM_EMAIL` | Alert sender address |
| `ALERT_TO_EMAIL` | Alert recipient address |
| `VAPID_PUBLIC_KEY` | Server-side Web Push public key |
| `VAPID_PRIVATE_KEY` | Server-side Web Push private key |
| `VAPID_SUBJECT` | VAPID contact subject |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser-readable matching public key |
| `SUPABASE_URL` | Optional Supabase Storage URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service credential |
| `CHAT_IMAGES_BUCKET` | Storage bucket used for chat images |

Keep service-role credentials server-only. The VAPID public keys must match exactly.

## Observability and retention

Sentry and Langfuse are optional and should remain disabled unless deliberately configured.

| Variable | Default | Description |
| --- | --- | --- |
| `SENTRY_DSN` | unset | Optional server-side Sentry reporting |
| `LANGFUSE_PUBLIC_KEY` | unset | Optional Langfuse key |
| `LANGFUSE_SECRET_KEY` | unset | Optional Langfuse secret |
| `LANGFUSE_BASE_URL` | unset | Langfuse endpoint |
| `LANGFUSE_RELEASE` | unset | Release label |
| `LANGFUSE_TRACING_ENVIRONMENT` | unset | Environment label |
| `LANGFUSE_RECORD_IO` | `0` | Explicit prompt/output capture opt-in |
| `TELEMETRY_RETENTION_DAYS` | `90` | Telemetry retention |
| `TRACE_RETENTION_DAYS` | `30` | Diagnostic trace retention |
| `CRON_RUN_RETENTION_DAYS` | `30` | Cron history retention |
| `AI_EVALUATION_RETENTION_DAYS` | `90` | AI evaluation retention |

Review privacy, retention, and provider terms before enabling telemetry or prompt/output capture.

## Billing

Billing is disabled by default and is not part of the normal public OSS path.

| Variable | Default | Description |
| --- | --- | --- |
| `BILLING_ENABLED` | `0` | Explicit billing feature flag |
| `NOWPAYMENTS_API_KEY` | unset | NOWPayments API credential |
| `NOWPAYMENTS_IPN_SECRET` | unset | Webhook signature secret |
| `NOWPAYMENTS_API_BASE` | Sandbox URL | NOWPayments API endpoint |

Never enable billing without reviewing webhook safety, legal terms, idempotency, and operator responsibilities.

## Worker configuration

| Variable | Default/required | Description |
| --- | --- | --- |
| `WORKER_MODE` | `systemd` | `systemd` uses external scheduling; `docker` uses internal scheduling |
| `WORKER_HEALTH_TOKEN` | Required in production; optional locally | Bearer token for worker health endpoints |
| `BIQUOTE_HUB_URL` | BiQuote SignalR URL | Live market feed endpoint |
| `BIQUOTE_PROXY_TOKEN` | Required in production; optional locally | Bearer token for the worker’s BiQuote proxy |
| `BINANCE_CRYPTO_SYMBOLS` | Catalog default | Comma-separated crypto symbols |
| `BINANCE_WS_URL` | Optional | Binance WebSocket base URL |
| `WORKER_DB_POOL_MAX` | Code default | Worker PostgreSQL pool size |
| `DATASETS_DIR` | Worker default | Dataset export directory |
| `EVAL_REPORTS_DIR` | Derived default | Evaluation report directory |
| `DEPLOYED_SHA` | `unknown` | Deployment revision label |

The worker exposes `/health/live` and `/health/ready` on port `8081`, and the optional `/biquote` proxy on port `8082`. Both bind privately by default; if either must be reachable by an orchestrator, use a private network or loopback binding and pass the matching bearer token. Production worker startup fails without both `WORKER_HEALTH_TOKEN` and `BIQUOTE_PROXY_TOKEN`. Never expose either port directly to the public internet.

## Docker-only settings

The setup wizard generates these values in `.env`:

- `POSTGRES_PASSWORD`
- `POSTGRES_VOLUME_NAME`
- `BACKUP_VOLUME_NAME`
- `BACKUP_INTERVAL_SECONDS`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_MAX_AGE_SECONDS`
- `LANGFUSE_NEXTAUTH_SECRET`
- `LANGFUSE_SALT`

Run `./docker/init-secrets.sh` instead of manually inventing secret values. Existing `.env` files are preserved.

## Deprecated and compatibility variables

`HAMAFX_ENABLE_RLS` is accepted as a compatibility alias and normalized to `KESTREL_ENABLE_RLS`. Prefer the Kestrel name in all new configuration. The alias is temporary compatibility behavior and should be removed after existing deployments have migrated. Other legacy compatibility variables may exist in migration or upgrade code; check the canonical schemas before adding one. State-changing JSON API routes use the bounded `parseJsonBody` helper, which enforces a size limit and body-read timeout; new routes must use it instead of calling `req.json()` directly.

## Configuration changes

When adding an environment variable:

1. Add it to the appropriate canonical schema.
2. Add it to `.env.example` or the setup template when public operators need it.
3. Update Compose or worker wiring if applicable.
4. Add validation/tests.
5. Update this document and release notes.
6. Check that the variable cannot expose secrets to the browser or logs.
