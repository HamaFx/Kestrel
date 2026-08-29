# Deployment capability matrix

Kestrel has two supported deployment profiles. Keep the profile-specific environment variables explicit; do not copy maintainer VM settings into a local deployment.

| Capability | Simple/local mode | Full Docker mode | Maintainer Vercel + GCE mode |
|---|---:|---:|---:|
| Web UI | Yes | Yes | Yes |
| Embedded PGlite | Yes | No | No |
| PostgreSQL + pgvector | Optional | Yes | Yes |
| Persistent worker | Optional/local development | Yes | Yes |
| Live tick/candle pipeline | No guarantee | Yes, with provider access | Yes |
| Internal worker scheduler | No | Yes (`WORKER_MODE=docker`) | Yes on GCE worker |
| External cron pokes | No | No | Optional/maintainer-operated |
| Local database backups | No | Yes | No; use operator-managed storage |
| Off-host backups | Operator responsibility | Operator responsibility | Optional B2/rclone integration |
| Langfuse | Disabled by default | Optional Compose profile | Optional external service |
| Sentry | Disabled by default | Optional | Optional |
| Multi-user/RLS | Unsupported | Unsupported by OSS release | Only where independently verified |
| Open registration | No | No | No unless shared isolation is verified |

## Safe defaults

Fresh OSS deployments must retain:

```dotenv
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

Docker mode additionally requires generated local secrets and uses direct, container-network PostgreSQL for runtime migrations. Production PostgreSQL deployments must provide `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` and verified TLS settings.

## Optional integrations

The following are optional and should remain unset unless explicitly configured:

- `SENTRY_DSN`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`
- Healthchecks UUIDs
- Backblaze B2 credentials
- Provider API keys
- `BIQUOTE_PROXY_TOKEN` and externally reachable worker proxy access

Never expose PostgreSQL, the worker port, or the backup volume directly to the public internet. Local Docker Compose binds host ports to loopback by default; production operators must preserve equivalent network controls.

## Verification

Static contract checks:

```bash
pnpm check:compose-reproducibility
pnpm check:oss-release
pnpm typecheck
```

The backup/restore smoke test requires Docker and is intentionally separate:

```bash
./docker/backup-restore-smoke.sh
```

Run it only against a disposable Compose project/volume. It is not a production restore procedure.
