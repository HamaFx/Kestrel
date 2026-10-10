# Kestrel deployment matrix

Kestrel is a private self-hosted multi-user platform. Multi-user isolation is enforced using Postgres Row Level Security (RLS) across all deployments.

## Supported profiles

| Profile                   | Database                    |   Worker | Intended use                     | Status                                 |
| ------------------------- | --------------------------- | -------: | -------------------------------- | -------------------------------------- |
| Docker Compose (Standard) | PostgreSQL + pgvector       |      Yes | Complete local/self-hosted stack | Supported                              |
| External PostgreSQL       | Operator-managed PostgreSQL | Optional | Advanced self-hosting            | Supported with operator responsibility |

## Security boundary

All deployments enforce:

```text
MULTI_USER_ENABLED=1
KESTREL_ENABLE_RLS=1
REGISTRATION_MODE=open
```

Tenant isolation is enforced via Postgres RLS on every user-data table. Each user's queries are scoped to their tenant ID via `withTenantDb`. Admin access requires an explicit `role='admin'` on the user record.

## Profile validation

Each supported profile should be selected explicitly. The runtime rejects unsafe combinations rather than silently choosing a fallback:

- All deployments require `MULTI_USER_ENABLED=1` and `KESTREL_ENABLE_RLS=1`. Disabling RLS while multi-user is active is rejected at startup.
- `REGISTRATION_MODE` must be `open` or `disabled` (invite-only).
- Production worker deployments require both `WORKER_HEALTH_TOKEN` and `BIQUOTE_PROXY_TOKEN`.
- All deployments require a configured database URL and verified TLS, except for the explicit local Docker profile.
- Web requests, worker jobs, and tenant lookup require `ADMIN_DATABASE_URL`, backed by a dedicated `BYPASSRLS` database role. Docker Compose provisions it automatically; external PostgreSQL operators must provision the role and URL themselves.

Use `pnpm verify:local` and `pnpm check:env-contract` before starting a deployment.

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

- Docker startup with fresh volumes.
- PostgreSQL migration and restart behavior.
- Backup and restore.
- Auth, CSRF, and ownership boundaries.
- Provider-disabled startup and BYOK onboarding.
- Worker shutdown, health, and reconnect behavior.

## Not a financial service

Kestrel is a research and workflow tool, not financial advice, a broker, or an automated trading system. Market data and AI output may be delayed, incomplete, or wrong.
