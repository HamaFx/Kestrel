# Configuration reference

This document describes the supported private self-hosting configuration contract for Kestrel. The canonical validation sources are:

- `packages/shared/src/env.ts` — web/server environment
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
| `DATABASE_URL` or `POSTGRES_URL`           | External DB/app | Web/worker              | Runtime database connection                                                     |
| `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` | Migrations      | Migration tooling       | Direct/session database connection; do not use a transaction pooler             |
| `DATABASE_URL_REPLICA`                     | Optional        | Web                     | Read-only replica for read-heavy queries                                        |
| `SUPABASE_CA_CERT`                         | Optional        | Web/worker/migrations   | CA certificate for managed PostgreSQL TLS                                       |
| `ADMIN_DATABASE_URL`                       | Required        | Web/worker              | Dedicated `BYPASSRLS` connection for tenant lookup, worker, and cron operations |

PostgreSQL is required in every environment; provide `DATABASE_URL` or `POSTGRES_URL`.

## Application and runtime

| Variable                      | Default                   | Description                                                        |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                    | `development`             | `development`, `test`, or `production`                             |
| `NEXT_PUBLIC_APP_URL`         | `http://localhost:3000`   | Browser-visible application URL                                    |
| `NEXTAUTH_URL`                | Setup-generated/local URL | Auth callback and cookie URL                                       |
| `MAX_DAILY_USD`               | `5`                       | Admin reporting ceiling — spend is ledgered, never blocking        |
| `ENFORCE_BUDGET`              | `0`                       | Q4: ledger-only budget by default; `1` restores the hard cap (429) |
| `MAX_TOOL_ITERATIONS`         | `6`                       | Maximum tool-loop iterations per chat turn                         |
| `AI_SEMANTIC_ROUTING_ENABLED` | `0`                       | Enables semantic routing before keyword fallback                   |
| `KESTREL_OFFLINE_MODE`        | `0`                       | Enables deterministic synthetic market-data mode                   |
| `LOG_PROMPTS`                 | `0`                       | Prompt logging; keep disabled unless intentionally debugging       |
| `ALERT_WINDOW_HOURS`          | `1`                       | Health-alert evaluation window                                     |
| `PHASE2_PACKET_CACHE`         | `1`                       | 30s fresh-only research packet cache (§2.1)                        |
| `PHASE3_MODEL_DIVERSITY`      | `0`                       | Per-committee-agent models from user overrides (§3.1)              |
| `ENABLE_COMMITTEE_CRITIQUE`   | `1`                       | Cross-critique round for Full mode (Q6; `0` disables)              |
| `PHASE3_STRUCTURED_FUSION`    | `0`                       | Structured fusion output for Full mode (§3.3)                      |
| `ENABLE_GENERIC_MACRO`        | `1`                       | Generic macro packet for non-XAUUSD symbols (M-02; `0` rollback)   |
| `ENABLE_COMPARISON_RISK_DESK` | `1`                       | Technical + risk desks per symbol in comparisons (P1-04)           |
| `PHASE_TOOLS_SHIMS`           | `1`                       | Legacy tool shims registered; `0` proves the native path (P2-01)   |
| `REDIS_URL`                   | _(unset)_                 | Optional shared Redis for the packet cache (§2.1)                  |
| `MASTRA_COMMITTEE_MODELS`     | _(unset)_                 | Optional JSON of per-specialist model picks (§3.1, top-tier only)  |
| `MASTRA_XAUUSD_MODEL`         | _(unset)_                 | Pin the XAUUSD verified-report model (`provider:model`)            |

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
| `CHAT_IMAGES_BUCKET`           | Storage bucket used for chat images                                                              |

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
| `CREDIT_LEDGER_RETENTION_DAYS` | `730`   | Billing ledger/audit retention        |

Review privacy, retention, and provider terms before enabling telemetry or prompt/output capture.

## Billing

Billing is disabled unless `BILLING_ENABLED=1` — it is a self-host opt-in and is not part of the normal path.

### Locked billing decisions (plan §1.2)

These decisions are recorded here so implementation and operations share one
contract. Change them only with a migration + docs update.

| #   | Decision              | Locked behaviour                                                                                                                                           |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Who pays the LLM bill | **Hybrid.** Credits meter platform-paid (managed) turns only. BYOK turns still emit telemetry but consume `PLATFORM_FEE_CREDITS` (default `0`).            |
| D2  | Currency/provider     | **Stripe fiat primary**, NOWPayments crypto retained. `BILLING_PROVIDER=stripe\|nowpayments\|both`.                                                        |
| D3  | Credit unit           | Integer credits where **1 credit = $0.001** (`CREDITS_PER_DOLLAR=1000`). Stored as `bigint`, never float.                                                  |
| D4  | Rollover              | Subscription grants expire at period end (no rollover). Top-up packs roll over and never expire. Promo grants may expire.                                  |
| D5  | Grace / overage       | **Soft degrade.** At zero credits, BYOK turns still work; managed turns return HTTP 402 with an upsell. Balances never go negative.                        |
| D6  | Self-host semantics   | `BILLING_ENABLED` remains the kill-switch; `BILLING_MODE=selfhost\|saas` selects the presentation/requirement profile. Never branch billing on `NODE_ENV`. |

### Core billing variables

| Variable                           | Default                   | Description                                                     |
| ---------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `BILLING_ENABLED`                  | `0`                       | Explicit billing master switch                                  |
| `BILLING_MODE`                     | `selfhost`                | `selfhost` or `saas` (UI/requirement profile)                   |
| `BILLING_PROVIDER`                 | `stripe`                  | `stripe`, `nowpayments`, or `both`                              |
| `BILLING_STRIPE_ENABLED`           | `0`                       | Enables Stripe checkout/webhooks                                |
| `BILLING_TOPUPS_ENABLED`           | `1`                       | Enables credit top-up packs                                     |
| `NOWPAYMENTS_API_KEY`              | unset                     | NOWPayments API credential                                      |
| `NOWPAYMENTS_IPN_SECRET`           | unset                     | Webhook signature secret                                        |
| `NOWPAYMENTS_API_BASE`             | Sandbox URL               | NOWPayments API endpoint                                        |
| `STRIPE_SECRET_KEY`                | unset                     | Stripe API secret (`sk_live_…` / `sk_test_…`)                   |
| `STRIPE_WEBHOOK_SECRET`            | unset                     | Stripe webhook signing secret (`whsec_…`)                       |
| `STRIPE_BILLING_PORTAL_RETURN_URL` | unset                     | Return URL after the Stripe customer portal                     |
| `BILLING_GAMMAL_ENABLED`           | `0`                       | Enables Gammal one-time pass checkout/webhooks                  |
| `GAMMAL_PROJECT_ID`                | unset                     | Public Gammal project id (`pid`), e.g. `47`                     |
| `GAMMAL_API_BASE`                  | `https://api.gammal.tech` | Gammal API origin for links and signing key                     |
| `GAMMAL_CURRENCY`                  | `USD`                     | Charge currency; Kestrel plans are USD                          |
| `GAMMAL_PUBLIC_KEY_PEM`            | unset                     | Optional pinned RS256 public key (otherwise fetched)            |
| `GAMMAL_PASS_DAYS`                 | `30`                      | Fallback prepaid pass length                                    |
| `CREDITS_PER_DOLLAR`               | `1000`                    | Credits per USD (1 credit = $0.001)                             |
| `FULL_MODE_CREDIT_ESTIMATE`        | `250`                     | Credits reserved for one Full-analysis turn                     |
| `PLATFORM_FEE_CREDITS`             | `0`                       | Flat fee per BYOK turn                                          |
| `CREDITS_ENFORCEMENT_ENABLED`      | `0`                       | `0` = shadow metering, `1` = return 402 on insufficient credits |
| `CREDITS_SHADOW_LOG`               | `1`                       | Write shadow reservations/ledger rows while enforcement is off  |
| `CREDIT_LEDGER_RETENTION_DAYS`     | `730`                     | Ledger/billing audit retention (never swept at 90 days)         |

Never enable billing without reviewing webhook safety, legal terms, idempotency, and operator responsibilities.

### Provider guardrails

- A Stripe `sk_test_` key in a production process logs a warning; it never
  silently takes live money.
- NOWPayments sandbox in production logs an error; set
  `NOWPAYMENTS_API_BASE=https://api.nowpayments.io` before real charges.
- Both webhook paths verify the signature over the **raw** body before any
  JSON parsing. Stripe uses `Stripe-Signature`; NOWPayments uses
  `x-nowpayments-sig`.
- `billing_events` deduplicates Stripe events; `ipn_events` deduplicates
  NOWPayments `(payment_id, payment_status)`. Gammal events are deduplicated by
  the verified `txn` in `billing_events`.
- Gammal has no API key. The checkout link is domain-authorised, and the
  short-lived RS256 `payment_token` is verified locally against
  `GAMMAL_PUBLIC_KEY_PEM` (or the cached public key) before any credit
  movement. Never grant access from the browser return URL's `status` alone.
- `credit_ledger` and `billing_*` tables are excluded from the 90-day
  telemetry sweep and retained for `CREDIT_LEDGER_RETENTION_DAYS`.
- In shared/SaaS mode, set `ADMIN_DATABASE_URL` (BYPASSRLS). Stripe webhooks
  resolve the tenant from the Stripe customer before entering a tenant
  transaction; the cross-tenant lookup cannot run under the RLS app role.
- Webhook endpoints: `POST /api/billing/webhook` dispatches on
  `Stripe-Signature` first, then `x-nowpayments-sig`, then the Gammal
  `X-Gammal-Event` + signed `payment_token`. Configure Stripe to send
  `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
  `invoice.paid`, `invoice.payment_failed`, `payment_intent.succeeded`, and
  `charge.refunded`.
- Reconciliation crons: `GET /api/cron/billing-reconcile` (every 6h) and
  `GET /api/cron/credit-reclaim` (every 30m), both protected by
  `CRON_SECRET` or an admin session.

## Worker configuration

| Variable                    | Default/required                                              | Description                                                                    |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `WORKER_MODE`               | `systemd`                                                     | `systemd` uses external scheduling; `docker` uses internal scheduling          |
| `WORKER_ENABLE_TICK_STREAM` | `0` (default on-demand REST mode)                             | `0` disables 24/7 SignalR/Binance DB tick streaming; `1` enables legacy stream |
| `WORKER_HEALTH_TOKEN`       | Required in production; optional locally                      | Bearer token for worker health endpoints                                       |
| `BIQUOTE_HUB_URL`           | BiQuote SignalR URL                                           | Live market feed endpoint (used when `WORKER_ENABLE_TICK_STREAM=1`)            |
| `BIQUOTE_PROXY_TOKEN`       | Optional in on-demand mode; required when tick stream enabled | Bearer token for the worker’s optional `:8082` BiQuote proxy                   |
| `BINANCE_CRYPTO_SYMBOLS`    | Catalog default                                               | Comma-separated crypto symbols                                                 |
| `BINANCE_WS_URL`            | Optional                                                      | Binance WebSocket base URL                                                     |
| `WORKER_DB_POOL_MAX`        | Code default                                                  | Worker PostgreSQL pool size                                                    |
| `DATASETS_DIR`              | Worker default                                                | Dataset export directory                                                       |
| `EVAL_REPORTS_DIR`          | Derived default                                               | Evaluation report directory                                                    |
| `DEPLOYED_SHA`              | `unknown`                                                     | Deployment revision label                                                      |

The worker exposes `/health/live` and `/health/ready` on port `8081`, and the optional `/biquote` proxy on port `8082` (when `BIQUOTE_PROXY_TOKEN` is set). Both bind privately by default; if either must be reachable by an orchestrator, use a private network or loopback binding and pass the matching bearer token. Production worker startup requires `WORKER_HEALTH_TOKEN` (and `BIQUOTE_PROXY_TOKEN` when `WORKER_ENABLE_TICK_STREAM=1`). Never expose either port directly to the public internet.

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
