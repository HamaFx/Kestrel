# Kestrel open-source readiness audit

## Executive verdict

**Current status: not yet ready for a broad public open-source release without qualification.**

The project is significantly more mature than a typical private application: it has a real monorepo structure, typed boundaries, migrations, Docker images, CI, security checks, authentication hardening, BYOK encryption, route classification, worker health checks, and extensive automated tests.

However, the repository currently mixes:

1. A **maintainer-specific Vercel + GCE VM deployment**
2. A **single-user self-hosted OSS deployment**
3. Dormant or incomplete **multi-user/RLS infrastructure**
4. Optional integrations for billing, Telegram, Langfuse, Sentry, market data, and cloud secret managers

That creates a dangerous gap between “the code is secure for the intended OSS boundary” and “a new operator can understand, configure, upgrade, recover, and safely expose it.”

Recommended release posture:

> Release it as a clearly labeled **single-user self-hosted preview/beta**, not as a production-ready multi-user platform.

The current code already appears designed around that boundary. The largest remaining work is not adding more features; it is removing ambiguity, validating the actual deployment paths, improving reproducibility, and eliminating private/maintainer assumptions from the public release path.

---

## Validation performed

The source, package manifests, deployment files, environment contracts, API routes, auth/database boundaries, Docker files, worker implementation, GitHub Actions, migrations, tests, and release checks were reviewed. Existing documentation was not treated as authoritative.

Checks executed during the audit:

```text
pnpm check:oss-release       PASS
pnpm check:p0-release        PASS
pnpm check:p3-release        PASS
pnpm check:route-security    PASS
pnpm check:env-contract      PASS
pnpm check:release-archive   PASS
pnpm check:dependency-report PASS
pnpm typecheck               PASS
pnpm lint                    PASS with 28 warnings
pnpm turbo run test -- --run  FAILED
```

Initial test result:

- **1,033 tests passed**
- **1 web test suite failed**
- Failure: `mastra-canonical-chat-service.test.ts`
- Cause: its `@kestrel/db` mock did not provide the required `schema` export, which is imported through `packages/data/src/health.ts`.

There were also noisy but non-failing test/build messages involving service-worker generation and expected diagnostic logging.

---

## Overall score

| Area                            |                       Status | Assessment                                                                     |
| ------------------------------- | ---------------------------: | ------------------------------------------------------------------------------ |
| Code organization               |                         Good | Clear monorepo and package layering                                            |
| Authentication                  |           Good, needs review | Strong implementation, but complex and hard to maintain                        |
| Single-user OSS safety boundary |                         Good | Explicit fail-closed configuration                                             |
| Multi-user readiness            |                 Not complete | Correctly disabled, should not be advertised as ready                          |
| Database/migrations             | Good but operationally risky | Large migration history and complex roles/RLS                                  |
| Docker deployment               |                    Promising | Needs actual clean-machine validation and better separation                    |
| Vercel + GCE deployment         |          Maintainer-specific | Not a general OSS deployment target                                            |
| API security                    |                Good baseline | Static route checks are useful but insufficient alone                          |
| Secrets handling                |                Good baseline | Environment tree contains too many modes and compatibility paths               |
| CI                              |              Strong coverage | Important failures are currently hidden or split across workflows              |
| Tests                           |                        Broad | Full suite must remain green                                                   |
| Licensing/compliance            |                   Incomplete | Dependency and provider licensing remains operator responsibility              |
| Contributor experience          |                     Moderate | Setup exists, but architecture and operational complexity are high             |
| Release process                 |                   Incomplete | Versioning and package publishing do not match the application’s release model |
| OSS readiness                   |                  Conditional | Suitable for controlled beta release after P0/P1 fixes                         |

---

# Critical findings

## P0 — Must fix before public release

### 1. Full test suite must be green

The initial full suite failed because the web test mock for `@kestrel/db` did not export `schema`, while production code indirectly required it.

This should be fixed by updating the mock or converting it to a partial mock using the original module exports. A public repository should not advertise a passing test suite while the default test command fails.

### 2. The OSS boundary is safe only because multi-user mode is disabled

The code explicitly admits that tenant context is not consistently established across all paths. This is the correct reason to disable shared mode.

The important invariant is:

```text
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

The code generally enforces this in environment parsing, database initialization, runtime migrations, Docker Compose, registration provisioning, and route behavior.

The project must clearly state that shared multi-user hosting is intentionally unsupported because the complete isolation proof has not been completed. Setting the flags manually must not be presented as production-ready multi-tenancy.

### 3. The project contains a large dormant multi-user system

There is substantial code for RLS, tenant GUCs, admin/BYPASSRLS database connections, organization memberships, tenant-aware workers, shared deployments, worker partitions, tenant triggers, and cross-tenant jobs.

For the OSS release, multi-user support should remain explicitly experimental and unavailable until every user-data query, worker job, cache, memory path, export, share, upload, notification, billing, and telemetry path is tenant-safe and covered by real PostgreSQL tests.

### 4. The production deployment topology is not generic OSS infrastructure

The repository contains maintainer-specific assumptions for Vercel, GCE VM, Supabase, healthchecks.io, BiQuote proxying, systemd/VM paths, external Vercel cron behavior, maintainer URLs, staging secrets, and private monitoring workflows.

The public release needs a clear distinction:

```text
OSS supported:
- Simple local mode
- Docker Compose web + worker + PostgreSQL
- Optional external PostgreSQL
- Optional reverse proxy

Maintainer deployment:
- Vercel web
- GCE worker
- Supabase
- Provider-specific proxy
- Maintainer monitoring and cron setup
```

### 5. Docker Compose should have a clearly defined minimal/full contract

The Compose stack includes PostgreSQL, app, worker, and backup infrastructure. Langfuse is optional, which is good, but new operators still need to understand worker requirements, named volumes, backup limitations, reverse proxy/TLS requirements, and offsite backup responsibility.

Consider minimal and full Compose profiles or make the current full behavior explicit in the public release contract.

---

# Authentication and authorization audit

## Strengths

- Credentials authentication uses bcrypt.
- Dummy-hash comparison helps mitigate user enumeration timing.
- Login lockout is atomically updated.
- 2FA is enforced rather than merely offered.
- Backup codes are single-use and atomically consumed.
- Session rows are persisted.
- Token version is used for invalidation.
- Session validation fails closed on database failure.
- Impersonation is dev-only and requires an admin challenge.
- Production rejects legacy authentication mode.
- CSRF uses a double-submit cookie.
- User ID headers are signed with HMAC.
- Route wrappers distinguish authenticated, admin, cron, and public boundaries.

## Risks and gaps

### Authentication complexity is high

The auth code has many responsibilities: credentials validation, Google OAuth provisioning, 2FA, backup codes, lockout, session creation, token version checks, impersonation, environment guards, and compatibility behavior.

A future refactor should separate these into focused modules such as:

```text
auth/
├── credentials-authorize.ts
├── lockout.ts
├── two-factor.ts
├── session.ts
├── oauth-provisioning.ts
├── impersonation.ts
└── security-invariants.ts
```

### `trustHost: true` needs an explicit operator warning

The public setup should require correct `AUTH_URL`/`NEXTAUTH_URL`, external hostname, TLS, reverse proxy host restrictions, and no accidental direct exposure of the Node process.

### The request proxy is security-critical

The proxy handles auth, CSRF, request IDs, CSP, signed headers, legacy auth behavior, route matching, and cookies. Add table-driven tests for public routes, protected APIs, spoofed headers, malformed signatures, CSP nonce propagation, cookie behavior, and non-browser clients.

---

# API security audit

## Strengths

- Route inventory and static checks exist.
- Admin routes are wrapped.
- Cron routes are wrapped.
- Webhooks are classified.
- Authenticated routes generally use shared wrappers.
- Request body size limits exist.
- Slow body reads have timeouts.
- Zod validation is widespread.
- Standardized errors exist.
- Rate limiting is used in sensitive routes.

## Gaps

### Static route classification does not prove runtime security

The route checker cannot prove resource ownership, authorization inside services, safe query predicates, internal service boundaries, or retry-path behavior. Add HTTP-level integration tests for anonymous requests, cross-user resource access, admin access, invalid cron secrets, invalid webhook signatures, forged user headers, missing CSRF, and oversized bodies.

### The worker proxy needs a separate threat model

The worker exposes health endpoints and a BiQuote proxy. Operators should bind health locally where possible, restrict port 8081 at the firewall, use a dedicated proxy token, and never expose the health port as a public application API.

---

# Database and migration audit

## Strengths

- Drizzle migrations are tracked.
- PGlite supports simple local setup.
- PostgreSQL/pgvector supports full mode.
- Migration chain tests are extensive.
- Idempotency and constraints are tested.
- Database TLS handling is conservative in production.
- Pool sizing and statement timeouts are configured.
- Admin and tenant database scopes are separated conceptually.
- Retention, queue, budget, and idempotency tables exist.

## Gaps and risks

### 95 migrations are a significant upgrade burden

Add a migration index, supported upgrade policy, clean-install test, upgrade-from-previous-release test, backup requirement, migration failure recovery procedure, and compatibility policy.

### Runtime auto-migrations are risky

The web Docker image runs migration logic at startup. Consider a separate migration service/command or at minimum a migration lock, exact migration-state logging, backup hook, and opt-in production auto-migration.

### Database mode combinations are complex

Behavior depends on many flags and URLs, including RLS, OSS mode, runtime, admin DB, replica DB, TLS, and compatibility aliases. Reduce supported combinations to explicit profiles:

```text
Simple
Docker single-user
External PostgreSQL single-user
Maintainer Vercel/VM
Experimental shared
```

Reject unsupported combinations early with one diagnostic message.

### PGlite cannot prove real PostgreSQL RLS behavior

Real PostgreSQL 16 integration tests are required for RLS, role switching, BYPASSRLS, grants, pgvector, and extension behavior.

---

# Worker and deployment audit

## Strengths

- Graceful shutdown exists.
- SignalR reconnection exists.
- Binance WebSocket support exists.
- Tick buffering and candle aggregation are separated.
- Health server exists.
- Sentry shutdown flushing exists.
- Jobs are registered centrally.
- Job timeouts and scheduler behavior are explicit.
- Docker runs the worker as non-root.
- Logs are rotated in Compose.

## Gaps

### External provider dependencies need a capability report

The worker depends optionally on BiQuote, Binance, FRED, Telegram, Resend, Healthchecks.io, Sentry, Langfuse, and B2/rclone. Add a startup report showing enabled and disabled capabilities and the reason for each disabled integration.

### Health configuration differs between deployments

Standardize on endpoints such as:

```text
/health/live
/health/ready
/health/dependencies
```

Use consistent authentication, ports, and environment behavior.

### External worker port exposure is too easy to misuse

The VM Compose file publishes `8081:8081` on all interfaces and relies on firewall protection. Prefer localhost binding by default and require an explicit override to expose it.

### Scheduler ownership is ambiguous

Embedded scheduler, Docker scheduler, Vercel cron routes, GCE/systemd timers, and manual endpoints can overlap. Define one canonical scheduler per deployment mode and make other mechanisms clearly disabled.

---

# AI and provider audit

## Strengths

- BYOK is appropriate for OSS.
- Provider registry exists.
- Model routing is domain-aware.
- Tools use typed schemas.
- Prompt injection detection exists.
- Citation enforcement exists.
- Budgets and rate limits exist.
- Mutation flows have confirmation gates.
- AI evaluation infrastructure exists.
- External content is handled defensively.

## Gaps

### AI functionality is not reproducible without provider credentials

Add an offline mode with deterministic AI fixtures, synthetic market data, local auth, persistence, and no external requests.

### Provider terms and redistribution remain operator responsibilities

Provide a provider capability matrix, synthetic fixtures only, attribution where required, and explicit handling for unavailable providers.

### Prompt/output privacy needs a stronger default

Keep Sentry and Langfuse disabled by default, make prompt/output capture opt-in, add redaction tests, provide retention/deletion controls, and show what data leaves the server.

### Package/runtime compatibility needs a public contract

Define supported Node versions, package manager versions, provider matrix, public versus internal packages, and stable API expectations. The package publishing configuration and application release model currently do not fully align.

---

# Environment and secrets audit

## Strengths

- Environment files are ignored.
- Secret scanning exists.
- Git history scanning exists.
- Setup generates secrets.
- Production secrets are validated.
- BYOK uses encryption at rest.
- Production database TLS is enforced unless explicitly local Docker.
- Release-tree checks exist.

## Gaps

The repository contains many ignored environment-like files from private deployment use. Before publishing, manually verify current tracked/untracked state and Git history with the existing secret scanners. Environment compatibility aliases also create complexity; choose canonical names, warn on deprecated aliases, and eventually remove old names.

---

# CI/CD audit

## Strengths

- Actions are pinned to commit SHAs.
- CodeQL exists.
- Trivy scans Docker images.
- SBOM generation exists.
- Dependency updates are configured.
- Build/typecheck/lint/test checks exist.
- Route and release contracts are automated.
- Docker backup/restore smoke tests exist.
- E2E sharding exists.
- Test artifacts are uploaded.
- Live AI eval is isolated from normal CI.

## Gaps

- Required PR, main, nightly, and release checks should be clearly separated.
- Ensure `continue-on-error` is not hiding real failures.
- The release workflow’s Changesets/package publishing model does not clearly match the application/Docker release model.
- Publish image digests, version labels, source revision labels, provenance, and a deployment manifest in releases.

---

# Licensing and legal readiness

Current baseline includes Apache-2.0, NOTICE, SECURITY.md, and widespread SPDX headers.

Remaining work:

- Audit logos, fonts, icons, images, screenshots, charting assets, and patches.
- Generate dependency license reports as release artifacts.
- Review provider trademarks and API terms.
- Ensure no proprietary sample data is bundled.
- Show the financial-risk disclaimer in onboarding, risk screens, generated plans, mutation confirmation, and public share pages.

---

# Contributor experience audit

## Strengths

- Setup wizard exists.
- Simple and Full modes exist.
- Node/pnpm versions are pinned.
- Test conventions are described.
- Issue templates and Code of Conduct exist.
- CI is extensive.
- Package boundaries are documented in source.

## Gaps

- Add a first-run diagnostic command that reports runtime, database, auth, AI, market data, worker, optional integrations, filesystem, and Docker state.
- Add offline/no-provider development mode.
- Clearly identify stable, experimental, maintainer-only, and safe-to-modify areas.
- Complete the Kestrel/HamaFX naming transition deliberately.

---

# Recommended release gates

## P0: before publishing

1. Fix the failing web test.
2. Run the full test suite from a clean checkout.
3. Run a clean Docker Compose install on a fresh machine/VM.
4. Run a clean Simple/PGlite install without existing local state.
5. Verify no secrets exist in tracked files, release archives, Docker context, or Git history.
6. Separate maintainer deployment assumptions from OSS-supported deployment.
7. Confirm all public URLs and contact addresses are intentional.
8. Confirm external telemetry is disabled by default.
9. Make the single-user limitation impossible to miss.
10. Decide whether billing belongs in the public default build.

## P1: before production-ready self-hosting

1. Test real PostgreSQL 16.
2. Test backup, restore, and encryption-secret recovery.
3. Test upgrades from the previous release.
4. Add deterministic offline mode.
5. Add startup capability report.
6. Standardize worker health endpoints.
7. Reduce or profile Compose services.
8. Add HTTP-level authorization/isolation tests.
9. Clean lint output.
10. Publish dependency license reports.
11. Publish image digests and provenance metadata.
12. Publish a supported deployment matrix.

## P2: before shared multi-user hosting

1. Complete tenant-context coverage for every user-data query.
2. Prove worker jobs are tenant-safe.
3. Prove admin/BYPASSRLS paths are isolated.
4. Add real PostgreSQL RLS integration tests.
5. Test concurrent requests across tenants.
6. Test cache isolation.
7. Test AI memory isolation.
8. Test exports, shares, uploads, notifications, billing, and telemetry isolation.
9. Test failure/retry paths for tenant leakage.
10. Obtain an independent security review.

---

# Final conclusion

Kestrel has a strong technical foundation and a serious security posture for a self-hosted single-user beta. The main issue is not lack of engineering effort; it is that the repository exposes too many deployment modes and future capabilities without a sufficiently narrow, reproducible public contract.

The project is ready to move toward open source after these immediate actions:

1. Fix the failing test suite.
2. Validate Simple and Docker modes from clean state.
3. Separate maintainer deployment assumptions from OSS-supported deployment.
4. Make offline/no-provider development possible.
5. Simplify environment/profile complexity.
6. Make the unsupported multi-user boundary impossible to misunderstand.
7. Add real PostgreSQL operational validation.
8. Resolve the package/release model.
9. Publish dependency and asset licensing information.
10. Run a final Git-history and release-archive secret audit.

Suggested readiness classification:

```text
Code quality:              B+
Security baseline:         B+
Single-user OSS readiness: B
Deployment portability:    C+
Operational readiness:     C
Multi-user readiness:      Not ready
Public beta readiness:     Yes, after P0 fixes
Production OSS readiness:  Not yet
```
