# Kestrel Open-Source Readiness Findings

_Last reviewed: 2026-08-30_

This file preserves the end-to-end open-source readiness audit performed against the repository's source, manifests, deployment configuration, CI, tests, security boundaries, and release tooling. The `docs/` directory was not treated as authoritative because it may be outdated. The detailed historical audit remains in [`OPEN_SOURCE_READINESS_AUDIT.md`](OPEN_SOURCE_READINESS_AUDIT.md); this file is the durable findings and action record.

## Executive verdict

Kestrel is suitable for a clearly labeled **single-user self-hosted beta**, but it is not ready to advertise shared multi-user hosting, hosted SaaS operation, or independently security-audited production readiness.

Overall open-source readiness: **7/10**

The technical foundation is strong: a real pnpm/Turborepo monorepo, typed package boundaries, migrations, Docker images, CI, authentication hardening, BYOK encryption, route checks, worker health checks, release checks, and broad automated tests. The remaining risk is primarily release hygiene, deployment reproducibility, operational complexity, and ambiguity between maintainer infrastructure and the supported public product.

## Ratings

| Area | Rating | Assessment |
|---|---:|---|
| Beginner local Simple/PGlite install | 8/10 | Strong setup wizard and lightweight path; clean-machine proof remains important |
| Docker single-user self-hosting | 7/10 | Promising and guarded; requires clean install and recovery rehearsal |
| Contributor onboarding | 7/10 | Good tooling, but the repository is complex for non-senior contributors |
| Public GitHub presentation | 7/10 | Clear positioning, but maintainer assumptions and links need strict separation |
| Security baseline | 7/10 | Thoughtful controls; no independent security audit |
| API security | 7/10 | Good wrappers and static checks; runtime authorization needs HTTP tests |
| Database/migrations | 7/10 | Extensive coverage, but many migrations and mode combinations increase upgrade risk |
| CI/CD and release hygiene | 7/10 | Broad checks; release/version/provenance contract is incomplete |
| Licensing/compliance | 6/10 | Apache-2.0 baseline; dependency and asset inventory incomplete |
| Multi-user/shared hosting | 3/10 | Correctly disabled; isolation proof is incomplete |
| Production-grade OSS release | 6.5/10 | Conditional until P0/P1 operational gaps are closed |

## Supported public contract

Supported:

- Single-user local Simple mode using PGlite.
- Single-user Docker Compose mode using PostgreSQL.
- External PostgreSQL for single-user deployments, with operator responsibility.
- BYOK AI providers with encrypted credentials.
- Optional integrations only when explicitly configured.

Not supported by the public release:

- Shared multi-user PostgreSQL deployments.
- Open registration for unrelated users on one instance.
- `MULTI_USER_ENABLED=1`.
- `KESTREL_ENABLE_RLS=1`.
- Maintainer-operated Vercel/GCE/Supabase hosting as a generic deployment target.
- Claims of independent security-audit completion.

The safe public positioning is:

> Kestrel is an open-source, BYOK, single-user self-hosted AI market-research workspace with beginner-friendly local and advanced Docker modes.

## P0 findings and release gates

1. **The complete test suite must be green.** A web test previously failed because its `@kestrel/db` mock did not export the `schema` symbol required by an indirect production import. The mock now includes the required partial database surface; rerun the full suite before release.
2. **The single-user boundary must remain fail-closed.** The invariant is `OSS_SINGLE_USER_MODE=1`, `MULTI_USER_ENABLED=0`, `KESTREL_ENABLE_RLS=0`, and `REGISTRATION_MODE=owner-first`. Do not present manual flag changes as production-ready tenancy.
3. **Maintainer infrastructure must remain separate from OSS support.** Vercel, GCE, Supabase, provider proxies, monitoring, and cron assumptions are not the generic self-hosting contract.
4. **Clean installs must be proven.** Validate Simple/PGlite and Docker Compose from a clean checkout, fresh volumes, generated secrets, and no private environment state.
5. **No secrets in the public release tree or history.** Run the current-tree and Git-history scanners, inspect release archives and Docker build context, and manually review private deployment remnants before publication.
6. **Public security reporting must use an intentional channel.** The repository must not publish an unverified placeholder security address. `SECURITY.md` now directs reporters to GitHub private vulnerability reporting and tells them not to disclose exploit details publicly.
7. **Telemetry must be opt-in.** Sentry, Langfuse, and prompt/output capture must remain disabled by default and be clearly disclosed when enabled.
8. **The multi-user system must remain unavailable.** Dormant RLS, organizations, worker partitions, cache/memory, exports, shares, notifications, billing, and telemetry paths require complete tenant-isolation proof before enablement.
9. **Release versioning must be explicit.** Application, Docker image, source revision, SBOM, provenance, and release archive metadata should share a documented version contract.
10. **Billing must not silently become part of the default OSS path.** Hosted billing is maintainer-only until its configuration, legal terms, webhook safety, and operator responsibilities are intentionally exposed.

## End-to-end audit findings

### New-user experience

Strengths:

- README communicates self-hosting, BYOK, supported assets, limitations, and a financial disclaimer.
- `pnpm setup` offers Simple and Full modes, generated settings, backups, dry-run, JSON output, and launch controls.
- Simple mode reduces prerequisites and is appropriate for beginners and vibecoders.

Gaps:

- A true clean-machine run remains necessary to prove the wizard's promises across supported operating systems.
- Failure recovery should be concise and actionable for Docker, port conflicts, database startup, missing AI keys, and provider failures.
- The first-run experience should make data leaving the server, provider costs, and backup responsibility obvious.

### Authentication and authorization

Strengths:

- bcrypt credentials, dummy-hash timing protection, atomic lockout, TOTP, single-use backup codes, persisted sessions, token-version invalidation, CSRF, signed user headers, and route wrappers.

Gaps:

- Auth is highly concentrated and complex; future refactoring should split credential validation, lockout, 2FA, sessions, OAuth provisioning, impersonation, and invariants.
- `trustHost` and reverse-proxy/TLS requirements need operator-facing warnings.
- Add table-driven request-boundary tests for public/protected routes, spoofed headers, malformed signatures, CSP nonces, cookies, and non-browser clients.

### API security

Strengths:

- Admin and cron wrappers, route inventory checks, body limits, timeouts, Zod validation, standardized errors, and rate limits exist.

Gaps:

- Static route checks cannot prove resource ownership or runtime authorization. Add HTTP-level anonymous, cross-user, admin, invalid-secret, invalid-signature, CSRF, and oversized-body tests.
- Worker health and proxy ports need an explicit threat model and safe default binding.

### Database and migrations

Strengths:

- Drizzle migrations, PGlite support, migration-chain tests, constraints, TLS handling, pool controls, budgets, queues, and retention features are present.

Gaps:

- The large migration history creates an upgrade burden. Release procedures need clean-install, upgrade, backup, migration-failure, and recovery tests.
- Runtime startup migrations require locking, logging, backup policy, and clear failure recovery.
- Real PostgreSQL is required to prove RLS, roles, grants, BYPASSRLS, pgvector, and extension behavior; PGlite cannot substitute for those tests.

### Worker and deployment

Strengths:

- Graceful shutdown, reconnection, buffering, aggregation, health checks, timeouts, centralized jobs, and non-root Docker execution exist.

Gaps:

- Add a startup capability report for optional providers and integrations.
- Standardize `/health/live`, `/health/ready`, and dependency diagnostics.
- Bind worker port 8081 to localhost by default where possible; make public exposure an explicit operator decision.
- Define one canonical scheduler per deployment profile so embedded, Docker, Vercel, VM, and manual cron mechanisms cannot overlap accidentally.

### AI and providers

Strengths:

- BYOK, provider registry, model routing, typed tools, prompt-injection detection, citation enforcement, budgets, confirmation gates, and evaluation infrastructure are strong.

Gaps:

- AI behavior is not fully reproducible without provider credentials. Deterministic offline market fixtures exist, but a no-provider AI fixture mode is still needed for complete beginner development.
- Provider terms, costs, rate limits, trademarks, and redistribution remain operator responsibilities.
- Keep prompt/output telemetry opt-in and add redaction, retention, and deletion tests.

### Secrets and environment

Strengths:

- Environment files are ignored, setup generates secrets, release scanners exist, production validation exists, and BYOK is encrypted at rest.

Gaps:

- Many compatibility aliases and deployment modes increase configuration difficulty. Define canonical names, warn on deprecated names, and reject unsupported combinations early.
- Before publishing, manually inspect tracked/untracked state, Git history, release archives, Docker context, assets, and private deployment remnants.

### CI/CD and releases

Strengths:

- Actions are pinned, CodeQL and Trivy exist, SBOM generation exists, dependency updates are configured, and release/security contracts run in CI.

Gaps:

- Separate required PR, main, nightly, and release checks clearly.
- Ensure `continue-on-error` cannot hide release-critical failures.
- Publish image digests, source revision labels, provenance, SBOMs, and a deployment manifest.
- Align Changesets/package publishing with the application and Docker release model.

### Legal and licensing

Strengths:

- Apache-2.0, NOTICE, security policy, and SPDX headers are present.

Gaps:

- Generate dependency license reports as release artifacts.
- Audit bundled fonts, icons, logos, images, screenshots, charting assets, sample data, provider trademarks, and API terms.
- Repeat the financial-risk disclaimer in onboarding, risk screens, generated plans, confirmation flows, and public shares.

### Contributors and vibecoders

Strengths:

- Setup wizard, Simple/Full modes, pinned Node/pnpm versions, issue templates, Code of Conduct, CI, and package boundaries are available.

Gaps:

- Add a first-run diagnostic command covering runtime, database, auth, AI, market data, worker, integrations, filesystem, and Docker.
- Clearly label stable, experimental, maintainer-only, and safe-to-modify areas.
- Complete the Kestrel/HamaFX naming transition deliberately.

## P1 work after P0

- Clean-machine Compose and Simple validation.
- Real PostgreSQL 16 integration tests.
- Backup/restore and encryption-secret recovery rehearsal.
- Previous-release upgrade testing.
- Deterministic no-provider AI mode.
- Startup capability report and standardized health endpoints.
- HTTP-level ownership/isolation tests.
- Lint warning cleanup.
- Dependency license artifacts and asset audit.
- Image digests, provenance, and supported deployment matrix.

## P2 work before shared hosting

- Establish tenant context for every user-data query and worker job.
- Prove cache, AI memory, exports, shares, uploads, notifications, billing, telemetry, retries, admin, and BYPASSRLS isolation.
- Add concurrent real-PostgreSQL cross-tenant tests.
- Obtain an independent security review.

P2 status remains **not complete**. The repository intentionally keeps shared mode disabled. A real PostgreSQL RLS probe exists at `packages/db/test/postgres-rls-isolation.test.ts`, and `pnpm test:postgres-rls` now creates and removes a disposable `pgvector/pgvector:pg16` container automatically. The remaining gate is the full application/schema isolation matrix plus independent security review; the probe never treats PGlite as proof of RLS behavior.

## Single-user release status

The single-user release track is now mechanically guarded by `pnpm check:single-user-release`. The check confirms the Compose defaults, environment boundary, README positioning, redacted capability diagnostics, and independent-review disclaimer. Disposable PostgreSQL/pgvector startup, RLS probing, migration coverage, and backup archive creation/validation have been exercised locally. Full app-stack restore and prior-release upgrade testing remain operator/release-environment rehearsals, not claims made by static checks.

## Implementation status in this pass

- Preserved the complete audit in `OPEN_SOURCE_READINESS_AUDIT.md`.
- Added this durable findings/action record.
- Removed the unverified `security@kestrel.com` contact from public security and conduct/support surfaces.
- Updated the P0 release check to require GitHub private vulnerability reporting instructions and reject unverified security email addresses.
- The original audit also identified the canonical-chat test mock issue; the current repository already contains the required `schema` mock surface, so the remaining action is full-suite verification.
