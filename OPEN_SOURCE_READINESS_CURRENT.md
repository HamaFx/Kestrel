# Kestrel current open-source readiness

_Last reviewed: 2026-08-29_

## Verdict

Kestrel is suitable for a clearly labeled **single-user self-hosted beta** release. It is not ready to advertise shared multi-user hosting, hosted SaaS operation, or independently security-audited production readiness.

The historical findings are preserved in `OPEN_SOURCE_READINESS_AUDIT.md`. This file is the current status summary.

## Verified green

- Typecheck passes across all packages.
- Full Vitest suite passes: 1,034 web, 1,264 AI, 188 DB, 376 shared, 99 indicators, 65 test-utils, and 110 worker tests.
- OSS, P0, P3, route-security, environment-contract, release-archive, and dependency-contract checks pass.
- Single-user boundary is fail-closed: `OSS_SINGLE_USER_MODE=1`, `MULTI_USER_ENABLED=0`, `KESTREL_ENABLE_RLS=0`, `REGISTRATION_MODE=owner-first`.
- Disposable PostgreSQL RLS policy mechanics were verified with a non-owner role.
- Disposable Docker backup/restore smoke test passed.
- Disposable Docker health-gated image rollback rehearsal passed.
- Worker liveness/readiness endpoints and capability diagnostics exist.

## Supported public contract

Supported profiles are Simple/PGlite and Docker single-user deployments. External PostgreSQL single-user deployments are supported with operator responsibility. Maintainer Vercel/GCE/Supabase infrastructure is not the generic OSS deployment target.

Shared multi-user/RLS mode remains experimental and unsupported.

## Remaining work

### Release polish

- Resolve the remaining 28 lint warnings, primarily API routes importing domain packages instead of the service facade. One worker test also imports the AI barrel.
- Deterministic offline market-data mode is available via `KESTREL_OFFLINE_MODE=1`; AI still requires a configured BYOK/server provider because model behavior cannot be safely substituted in production flows.
- Validate a true clean-machine Compose install using generated secrets and fresh volumes.
- Generate dependency license artifacts and audit bundled fonts, icons, images, screenshots, and sample data.
- Publish image digests/provenance and define the application/Docker release versioning contract.
- Keep the historical audit clearly separate from this current report.

### Operator-only validation

- Configure and test off-host backup storage and recovery of a non-production `ENCRYPTION_SECRET`.
- Rehearse the actual `/opt/kestrel` VM updater on a disposable staging VM.

### Future shared hosting gate

Before enabling multi-user hosting, test the complete migrated schema under real PostgreSQL roles, every worker/cache/memory/export/share/notification/billing/telemetry path, concurrent tenant requests, retry paths, and admin/BYPASSRLS access. Obtain an independent external security review.

## Current classification

```text
Single-user OSS beta:       Ready with explicit caveats
Production self-hosting:    Conditional; clean-install and operator DR checks remain
Shared multi-user hosting:  Not ready
Independent security audit: Not performed
```
