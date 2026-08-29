# Kestrel open-source deployment matrix

Kestrel's public release is a **single-user self-hosted beta**. Shared multi-user/RLS hosting is not supported by the public release.

## Supported profiles

| Profile | Database | Worker | Intended use | Status |
|---|---|---:|---|---|
| Simple | Embedded PGlite | No | Local development and evaluation | Supported |
| Docker single-user | PostgreSQL + pgvector | Yes | Complete local/self-hosted stack | Supported |
| External PostgreSQL single-user | Operator-managed PostgreSQL | Optional | Advanced self-hosting | Supported with operator responsibility |
| Maintainer Vercel/VM | Supabase + Vercel + GCE worker | Yes | Kestrel's own deployment topology | Maintainer-specific |
| Shared multi-user/RLS | PostgreSQL + RLS | Required | Future hosted/shared deployments | Not supported |

## Security boundary

The public OSS profile must use:

```text
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

Do not expose a shared instance to unrelated users. Enabling multi-user or RLS flags does not make the deployment supported; the complete tenant-isolation proof is still a future milestone.

## External integrations

All external integrations are optional unless the selected feature requires them:

- AI providers: configured through BYOK in the application.
- Market data: provider availability, rate limits, and redistribution terms vary.
- Sentry: disabled unless `SENTRY_DSN` is configured.
- Langfuse: disabled unless all Langfuse variables are configured; prompt/output capture is opt-in.
- Telegram: disabled unless bot credentials are configured.
- Email: disabled unless Resend credentials are configured.
- Billing: disabled unless explicitly enabled and configured.
- Healthchecks.io: disabled when job UUIDs are absent.

Operators are responsible for the terms, costs, privacy practices, rate limits, and data redistribution rights of external providers.

## Backup requirements

A recoverable deployment requires both:

1. A database backup
2. A secure backup of `ENCRYPTION_SECRET`

Without `ENCRYPTION_SECRET`, stored BYOK credentials cannot be decrypted. Local Docker backup volumes do not protect against host loss; copy backups off-host and periodically test restoration.

## Worker health endpoints

The worker provides:

- `/health/live`: process liveness; does not require a live market tick.
- `/health/ready`: readiness; requires an active feed and recent tick.
- `/health` and `/api/health`: compatibility aliases for readiness.

In production, health endpoints require `WORKER_HEALTH_TOKEN`. Bind the worker health port to localhost or a private network unless an explicit, firewall-protected exposure is required.

## Release validation

Before declaring a release ready, validate from clean state:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm turbo run test -- --run
pnpm check:oss-release
pnpm check:p0-release
pnpm check:p3-release
pnpm check:route-security
pnpm check:env-contract
pnpm check:release-archive
pnpm check:dependency-report
```

Then separately validate:

- Simple/PGlite startup with no remote database.
- Docker startup with fresh volumes.
- PostgreSQL migration and restart behavior.
- Backup and restore.
- Auth, CSRF, and ownership boundaries.
- Provider-disabled startup and BYOK onboarding.
- Worker shutdown, health, and reconnect behavior.

## Not a financial service

Kestrel is a research and workflow tool, not financial advice, a broker, or an automated trading system. Market data and AI output may be delayed, incomplete, or wrong.
