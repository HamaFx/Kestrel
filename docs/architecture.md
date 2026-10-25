# Architecture

Kestrel is a pnpm/Turborepo monorepo containing a Next.js web application, a persistent Node.js worker, and shared domain packages. Kestrel is a private self-hosted multi-user platform with Row Level Security (RLS).

## System overview

```text
Browser / PWA
    │
    ▼
apps/web — Next.js App Router, Auth.js, API routes, UI
    │
    ├── packages/ai — Mastra agents, workflows, tools, memory
    ├── packages/data — market adapters, providers, failover, caching
    ├── packages/db — Drizzle schema, migrations, DB clients
    └── packages/shared — schemas, environment, encryption, logging

apps/worker — feeds, ticks, candles, jobs, health
    │
    ├── packages/data
    ├── packages/ai
    ├── packages/db
    └── packages/shared
```

The dependency direction is intentionally layered:

```text
config → shared → db + indicators → data → ai → web + worker
```

## Applications

### `apps/web`

The web app provides:

- Next.js 16 App Router pages and server actions
- React 19 UI and PWA behavior
- Auth.js/NextAuth credentials authentication
- Chat transport and streaming responses
- Market, journal, alert, portfolio, settings, admin, and health routes
- CSRF, CSP, request IDs, rate limits, and standardized API envelopes
- User-owned persistence and BYOK settings
- Hoplite Design System: Classical Antiquity meets Cyber-Industrial Hardware (Funnel Display, Redaction Italic, Geist Mono, Bebas Neue, tactile surface chips, and recessed data wells)
- Dual surfaces:
  - **Authenticated Trading Cockpit**: Authenticated operators accessing `/` redirect to `/chat` and use the full trading terminal (AI committee deliberation, live market data, economic calendar, macroeconomic news, trade journal, portfolio tracking, and system settings).
  - **Portfolio Showcase**: Unauthenticated visitors landing on `/` (and direct visits to `/landing`) view the institutional committee showcase (`LandingNav`, `LandingHero`, `LandingDesks`, `LandingStepper`, `LandingArchitecture`, `LandingFAQ`, `LandingFooter`) illustrating the platform's multi-agent deliberative architecture and capabilities.

The request proxy is a security boundary. It handles route access classification, authentication integration, CSRF, CSP nonce propagation, cookies, and request IDs. Keep direct database work out of it.

### `apps/worker`

The worker is a long-running Node.js process for work that does not fit serverless request lifetimes:

- BiQuote SignalR live ticks
- Binance WebSocket crypto ticks
- Tick buffering and persistence
- One-minute candle aggregation
- Durable scheduled jobs
- Health checks and optional external watchdog heartbeats
- Dataset/evaluation exports and cleanup tasks

The worker’s canonical health endpoints are:

```text
/health/live   process liveness
/health/ready  feed/dependency readiness
```

Keep worker ports private by default.

## Packages

### `packages/shared`

The foundation package contains:

- Zod schemas and boundary validation
- Server and worker environment contracts
- Encryption helpers for BYOK/protected secrets
- Error codes and response types
- Logging, redaction, diagnostics, capabilities, and shared domain types

Environment schemas are authoritative for runtime validation.

### `packages/db`

The database package contains:

- Drizzle PostgreSQL schema, grouped into `core/`, `market/`, `ai/`, and `ops/` domain sub-barrels under `src/schema/`
- Migration files and migration tooling
- PostgreSQL client and pooling behavior
- User ownership and tenant-aware query helpers
- Retention, budget, queue, telemetry, and persistence queries

PostgreSQL 16 with pgvector is required across all deployments to support vector embeddings and enforce PostgreSQL Row Level Security (RLS).

### `packages/data`

The data package abstracts market and research providers:

- Price and candle adapters
- News and calendar providers
- Failover ordering and provider health
- Caching and stale-while-revalidate behavior
- Provider error classification
- Storage boundaries and URL safety

Provider calls should use the existing failover and validation paths rather than direct ad hoc requests.

### `packages/indicators`

Pure technical-analysis calculations include moving averages, RSI, MACD, ATR, Bollinger bands, pivots, sessions, volatility, and smart-money-structure calculations. Numerical behavior must remain deterministic and covered by edge/property tests.

### `packages/ai`

The AI package contains:

- Mastra agents and durable workflows
- Domain/model routing under `src/models/`, `src/routing/`, `src/budget/`, `src/runtime/`, and `src/persistence/`
- Typed read-only tools
- Mutation drafts and confirmation workflows
- Prompt-injection detection and Unicode normalization
- Citation/grounding enforcement
- Cost budgets and tool-loop limits
- Memory, persistence, diagnostics, and evaluations

All Mastra orchestration lives under `packages/ai/src/mastra-v2/` (the former
`mastra/` generation was atomically migrated in 2026-10; the audit v2 cleanup
deleted the 70 per-module re-export shims). The deprecated `src/mastra/`
compatibility barrel was removed in the Part 1 maintainability cleanup;
`@kestrel/ai/mastra-v2` is the single public entry point. Committee
orchestration stays in `packages/ai/src/committee/` (specialists,
cross-critique, fusion) and is consumed by the mode runner. The 2026-10-18 deep
agentic audit and its phased remediation plan live in
`docs/audits/mastra-agentic-deep-audit-2026-10-18.md`.

The tree below is asserted in CI by `scripts/check-architecture-tree.mjs` —
editing this list and `packages/ai/src/mastra-v2/` must happen together:

```text
mastra-v2/
  agents/
  capabilities/
  evals/
  mutation/
  packets/
  planning/
  shared/
  tools/
  workflows/
  context.ts
  guardrails.ts
  index.ts
  instance.ts
  langfuse-link.ts
  logger.ts
  memory.ts
  observability-view.ts
  registry.ts
  research-context.ts
  storage.ts
  studio-server.ts
  telemetry.ts
```

AI tool structure is:

```text
input schema → execute core → native createTool registration (mastra-v2/tools/)
             ↘ legacy AI SDK shim (src/tools/, one release) → typed output → registry
```

The core market-data tools (`get_price`, `get_candles`, `get_indicators`,
`search_knowledge`) are native Mastra registrations in
`mastra-v2/tools/canonical/`; their `src/tools/` modules are one-release
shims over the same execute cores. Remaining legacy tools migrate file by
file and keep the identical output shape until then.

The deterministic evidence packet both the committee and the verified XAUUSD
report consume is bounded and typed:

```text
symbol_research_packet {
  packetId, symbol, generatedAt, status, dataQuality
  price { tick, freshness, quality, warnings }
  timeframes[4]                    # 1d, 4h, 1h, 15m — candles + 5 indicators
  marketStructure { recentSwingHigh, recentSwingLow, rangeSize }
  xauusdExtension | genericMacro   # macro context (mutually exclusive)
  optionalContext { available, reason }
  missingData[], warnings[]
}
```

`xauusdExtension` carries the gold macro evidence (dollar index, real yields,
USD events, news). `genericMacro` is the M-02 extension for other symbols
(news, upcoming releases for the symbol's currencies, CFTC positioning where
supported), gated by `ENABLE_GENERIC_MACRO`; `optionalContext` always states
whether macro context was attached or requested-but-unavailable, so a
candle-only read can never imply a macro check that did not happen.

Tools register explicitly via `registerAllTools()` at instance build time —
importing a tool module no longer mutates the singleton registry.

Inside this package, database and model dependencies use typed DI tokens. Request-scoped context uses `AsyncLocalStorage`.

## Request flow

A typical chat request follows this path:

1. Browser sends a request to `/api/chat`.
2. Request security checks validate authentication, CSRF, body limits, and request metadata.
3. The web service loads user/thread context.
4. The AI runtime selects a mode and model.
5. Mastra invokes typed tools through the AI package.
6. Tools call validated data/database services.
7. Budget, loop, safety, and citation checks are applied.
8. The response streams to the browser and persistence/telemetry paths record permitted metadata.

No provider result should be presented as live or verified without the appropriate tool result and citation behavior.

## Market-data flow

```text
Provider(s)
    ▼
packages/data adapters
    ▼
health-aware failover + cache
    ▼
AI tools / API routes / worker persistence
    ▼
chat, charts, dashboards, alerts
```

BiQuote is the primary live feed in the current implementation where configured/available. Other providers are optional fallbacks or feature-specific integrations. External provider terms, rate limits, costs, accuracy, and redistribution rights are operator responsibilities.

## Worker flow

```text
SignalR/WebSocket feed
    ▼
validation
    ▼
tick buffer
    ├── live tick persistence
    └── one-minute candle aggregation

worker scheduler
    ▼
leased/idempotent jobs
    ▼
PostgreSQL persistence and health/watchdog reporting
```

Scheduler ownership must be explicit per deployment profile. Avoid running equivalent embedded, Docker, VM, external cron, and manual jobs concurrently.

## Data and ownership boundary

All deployments enforce:

```text
MULTI_USER_ENABLED=1
KESTREL_ENABLE_RLS=1
REGISTRATION_MODE=open
```

Tenant isolation is enforced via Postgres Row Level Security (RLS) on all user-data tables. Multi-user and RLS are mandatory. Tenant context is established via authenticated user sessions and scoped database helpers (`withTenantDb`). Administrative access requires an explicit `role='admin'` on the user record; background workers use `ADMIN_DATABASE_URL` with BYPASSRLS.

## Deployment profiles

### Docker Compose (Standard)

- PostgreSQL 16 + pgvector
- Web container
- Worker container
- Local logical backup service
- Optional observability profile (Langfuse v3 + ClickHouse, Redis, MinIO, and Langfuse worker)
- Localhost-bound ports by default

### External PostgreSQL

- Web and optional worker run outside the bundled database
- Operator provides database URL, TLS, credentials, backups, and upgrades
- Direct connection required for migrations

### Operator-managed cloud topology

The operator-managed cloud deployment is an infrastructure choice, not a separate product mode. Its private provider proxies, monitoring, cron, staging, and secret-management details are maintained by the operator.

## BYOK and local spend budgets

Kestrel is BYOK-only: users bring their own provider keys, and there is no
subscription, checkout, credit wallet, or payment webhook in the product.

- `chat_telemetry.est_cost_usd` records the estimated USD cost of a turn and
  attributes it to `byok` or `managed` (operator fallback key).
- `daily_ai_spend` and `ai_budget_reservations` are the local spend ledger.
  `packages/ai/src/budget/index.ts` is the single admission facade
  (`acquireBudget` / `reserveTurnBudget`); `packages/ai/src/budget/cost.ts` remains
  the only model price source and rate table.
- Budget enforcement is off by default (ledger-only observability). Set
  `ENFORCE_BUDGET=true` to enforce each user's `max_daily_usd` cap locally.
- BYOK key material is encrypted by `@kestrel/shared` and never leaves the
  instance; `/settings/models` manages provider keys.

Invariants:

1. No turn depends on a remote billing service; provider keys are the only
   external spend authority.
2. `packages/ai/src/budget/cost.ts` + `buildCatalogRateTable()` remain the only model
   price source.
3. Reservation reconcile/release is idempotent and keeps the ledger
   non-negative.

## Security boundaries

Important boundaries include:

- Auth.js session validation and token-version invalidation
- bcrypt password hashing and account lockout
- TOTP/backup-code enforcement
- CSRF double-submit protection
- CSP nonce handling
- Signed internal user headers
- Zod validation at boundaries
- User ownership predicates and tenant guards
- BYOK encryption with `ENCRYPTION_SECRET`
- Rate limits, budgets, and tool-loop limits
- Provider failover and SSRF protections
- Webhook signature verification and idempotency
- Worker health-token protection

See `SECURITY.md` for the policy and operator responsibilities.

## Persistence and recovery

Kestrel persists application state in PostgreSQL. Docker backups are compressed logical dumps stored in a named volume. A named volume is not off-host disaster recovery. Operators must copy backups elsewhere and retain the matching `ENCRYPTION_SECRET`; without it, stored BYOK credentials cannot be decrypted.

## Observability

Logging uses the shared structured logger with categories, trace correlation, redaction, and diagnostic context. Langfuse tracing is an optional overlay. Prompt/output capture is explicitly opt-in and should remain disabled unless privacy, retention, and provider terms have been reviewed.

## Change guidance

When changing architecture:

1. Preserve dependency direction.
2. Validate all package boundaries.
3. Add regression tests for security, ownership, failure, and recovery behavior.
4. Update public documentation if supported behavior changes.
5. Keep static architecture snapshots informational; runtime code must not depend on them.
6. State clearly whether the change affects self-hosted or maintainer infrastructure.
