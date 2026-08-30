# Architecture

Kestrel is a pnpm/Turborepo monorepo containing a Next.js web application, a persistent Node.js worker, and shared domain packages. The public release is a single-user self-hosted beta.

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

- Drizzle PostgreSQL schema
- Migration files and migration tooling
- PostgreSQL client and pooling behavior
- PGlite local fallback
- User ownership and tenant-aware query helpers
- Retention, budget, queue, telemetry, billing, and persistence queries

PostgreSQL 16 with pgvector is used for full Docker functionality. PGlite is intended for Simple mode and cannot prove PostgreSQL RLS, roles, grants, BYPASSRLS, or pgvector behavior.

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
- Domain/model routing
- Typed read-only tools
- Mutation drafts and confirmation workflows
- Prompt-injection detection and Unicode normalization
- Citation/grounding enforcement
- Cost budgets and tool-loop limits
- Memory, persistence, diagnostics, and evaluations

AI tool structure is:

```text
input schema → module augmentation → execute → typed output → registry
```

Inside this package, database and model dependencies use typed DI tokens. Request-scoped context uses `AsyncLocalStorage`.

## Request flow

A typical chat request follows this path:

1. Browser sends a request to `/api/chat`.
2. Request security checks validate authentication, CSRF, body limits, and request metadata.
3. The web service loads user/thread context.
4. The AI runtime selects a mode and model.
5. A planner may produce a structured plan for complex technical/fundamental turns.
6. Mastra invokes typed tools through the AI package.
7. Tools call validated data/database services.
8. Budget, loop, safety, and citation checks are applied.
9. The response streams to the browser and persistence/telemetry paths record permitted metadata.

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

The public OSS release requires:

```text
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

The code contains experimental multi-tenant/RLS infrastructure, but shared mode is unsupported until tenant context is established and proven across all user-data queries and worker/cache/memory/export/share/upload/notification/billing/telemetry paths. User ID filters alone are not proof of database isolation.

## Deployment profiles

### Simple

- Web development process
- Embedded PGlite
- No persistent worker
- No pgvector
- Best for local development, evaluation, and contribution

### Docker single-user

- PostgreSQL 16 + pgvector
- Web container
- Worker container
- Local logical backup service
- Optional Langfuse profile
- Localhost-bound ports by default

### External PostgreSQL

- Web and optional worker run outside the bundled database
- Operator provides database URL, TLS, credentials, backups, and upgrades
- Direct connection required for migrations

### Maintainer topology

The maintainer’s Vercel/GCE/managed-database deployment is separate from the public OSS contract. Its private provider proxies, monitoring, cron, staging, and secret-management details must not be copied into public documentation.

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

Kestrel persists application state in PostgreSQL or PGlite depending on the profile. Docker backups are compressed logical dumps stored in a named volume. A named volume is not off-host disaster recovery. Operators must copy backups elsewhere and retain the matching `ENCRYPTION_SECRET`; without it, stored BYOK credentials cannot be decrypted.

## Observability

Logging uses the shared structured logger with categories, trace correlation, redaction, and diagnostic context. Sentry and Langfuse are optional. Prompt/output capture is explicitly opt-in and should remain disabled unless privacy, retention, and provider terms have been reviewed.

## Change guidance

When changing architecture:

1. Preserve dependency direction.
2. Validate all package boundaries.
3. Add regression tests for security, ownership, failure, and recovery behavior.
4. Update public documentation if supported behavior changes.
5. Keep static architecture snapshots informational; runtime code must not depend on them.
6. State clearly whether the change affects public OSS, experimental shared mode, or private maintainer infrastructure.
