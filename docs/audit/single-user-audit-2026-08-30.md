# Single-user mode audit

**Audit date:** 2026-08-30  
**Scope:** Repository-wide review of the single-user release boundary, authentication, authorization, database, migrations, workers, Docker, CI/CD, dependencies, privacy, observability, documentation, testing, performance, and maintainability.

**Repository state at audit:** clean; no uncommitted changes.

## Executive verdict

**Overall single-user readiness: 7.3/10**

The project has an unusually strong security/release foundation for a self-hosted beta. The single-user boundary is clearly documented and mechanically guarded. Authentication, encryption, CSRF protection, route wrappers, backups, migrations, worker health checks, and CI coverage are all substantially above average.

However, this is **not yet a polished production-grade single-user product**. The largest remaining risks are:

- Runtime startup migrations and operational recovery.
- Too many deployment/configuration modes and compatibility aliases.
- Incomplete HTTP-level authorization testing.
- Worker exposure and health/proxy threat modeling.
- CI quality gates that are report-only or duplicated.
- Very slow PGlite migration tests.
- Incomplete clean-machine, upgrade, disaster-recovery, licensing, and asset validation.
- Significant architectural complexity for a supposedly single-user release.

The correct release classification remains:

> **Single-user self-hosted beta with explicit operator responsibility.**

Do not advertise shared hosting, SaaS, or independently audited production security.

## Verification performed

All of the following passed:

| Check | Result |
|---|---:|
| `pnpm typecheck` | Passed |
| Full Turbo/Vitest suite | Passed |
| Tests | 14 packages, approximately 3,500+ assertions |
| `pnpm turbo run lint` | Passed |
| Single-user release contract | Passed |
| OSS release contract | Passed |
| P0 release check | Passed |
| P3 release check | Passed |
| Route-security check | Passed |
| Environment contract | Passed |
| Compose reproducibility check | Passed |
| Release archive check | Passed |
| Release metadata check | Passed |
| Dependency-report contract | Passed |

Important qualification: many Turbo results were cache hits. The repository’s own current audit documentation also says clean-machine, full app-stack restore, previous-release upgrade, off-host backup, and independent security review remain incomplete.

# Ratings

| Area | Rating | Assessment |
|---|---:|---|
| Single-user boundary | **8.5/10** | Explicit, fail-closed, enforced in Compose, env parsing, DB, and migrations |
| Authentication | **8/10** | Strong controls: bcrypt, lockout, 2FA, backup codes, sessions, token versioning |
| Authorization/API boundaries | **7/10** | Good wrappers and route inventory; runtime ownership still needs HTTP-level proof |
| CSRF protection | **8/10** | Double-submit token with secure cookie handling |
| Session security | **8/10** | Persisted sessions, revocation, token-version checks, fail-closed DB behavior |
| BYOK encryption | **8/10** | AES-GCM and secret handling are thoughtfully implemented |
| Database integrity | **7.5/10** | Extensive constraints/migrations, but large migration surface increases risk |
| RLS/shared-mode safety | **3/10** | Correctly disabled; not ready for multi-user use |
| PGlite/simple mode | **8/10** | Excellent convenience path; behavior differs from real PostgreSQL |
| Docker deployment | **7/10** | Good defaults and health gates; clean-install/upgrade proof remains |
| Worker reliability | **7/10** | Good reconnect, buffering, shutdown, and health mechanisms |
| Worker network security | **6/10** | Host binding is safe in Compose, but container listens on all interfaces |
| Backup/restore | **7/10** | Local logical restore tested; off-host DR not completed |
| Migration safety | **6.5/10** | Fail-closed startup, but startup migration locking/recovery needs stronger guarantees |
| AI/provider safety | **7.5/10** | BYOK, budgets, routing, safeguards; provider behavior remains nondeterministic |
| Privacy/telemetry | **7.5/10** | Opt-in defaults are good; deletion/redaction proofs should expand |
| CI/CD | **7/10** | Broad coverage, but some gates are duplicated or non-blocking |
| Dependency hygiene | **7/10** | Lockfile and scanning exist; upgrade policy/license verification incomplete |
| Licensing/compliance | **6/10** | Apache baseline is good; third-party asset/provider audit incomplete |
| Documentation | **7.5/10** | Honest and detailed; still somewhat fragmented and internally complex |
| Contributor experience | **6.5/10** | Good tooling, but architecture is intimidating for new contributors |
| Performance | **7/10** | Pool/timeouts/bundle checks exist; test and runtime complexity remain |
| Maintainability | **6.5/10** | Strong engineering effort but too much code for the supported product scope |
| Release readiness | **7/10** | Suitable for beta, conditional for production-like self-hosting |

# Findings

## P1 — High priority

### 1. Runtime migrations are still an operational single point of failure

**Locations:**

- `apps/web/docker-entrypoint.sh`
- `apps/web/scripts/migrate-runtime.mjs`

The app container automatically applies migrations before startup. This is fail-closed, which is better than serving against a stale schema, but it creates several risks:

- Multiple app replicas can race to migrate.
- Migration ownership is coupled to application startup.
- A failed migration can leave the deployment unavailable.
- Rollback behavior across incompatible schema versions is not automatic.
- The migration transaction/locking policy is not obvious from the entrypoint.
- There is no clear migration lease/leader-election mechanism.

**Recommendation:**

Use one of these models:

1. A dedicated migration job/container executed before app rollout.
2. A PostgreSQL advisory lock around the entire migration process.
3. Explicit migration status and recovery documentation.
4. A tested previous-release → current-release upgrade matrix.

**Impact:** Availability and upgrade safety.

### 2. HTTP-level ownership and authorization coverage is incomplete

The project has static route classification and extensive unit tests. That does not prove:

- Anonymous requests cannot reach protected handlers.
- A user cannot access another user’s resource by changing an ID.
- CSRF enforcement works through the actual proxy.
- Signed headers cannot be forged through alternate request paths.
- Cron/admin/webhook boundaries remain isolated in deployment.
- Error responses do not disclose sensitive existence information.

The audit documentation already acknowledges this gap.

**Recommendation:** Add a focused HTTP integration suite covering:

- Anonymous GET/POST/PATCH/DELETE.
- Cross-user thread, message, journal, upload, export, billing, and notification access.
- Invalid/expired session cookies.
- Forged `x-user-id` and `x-user-id-sig`.
- Missing, mismatched, and stale CSRF tokens.
- Invalid cron and webhook signatures.
- Oversized request bodies.
- Admin-only routes under the single-user fallback.
- Public share-token misuse.

**Impact:** Security confidence; this should be completed before calling the release production-grade.

### 3. Worker health/proxy surface needs a stricter default

`apps/worker/src/index.ts` listens on:

```ts
healthServer.listen(8081, '0.0.0.0')
```

Compose currently publishes no worker port to the host, which is good. But:

- The container listens on every container interface.
- Other containers on the Docker network can reach the health/proxy server.
- The same server exposes both health endpoints and the BiQuote proxy.
- The proxy token is not represented clearly in the worker environment contract.
- The health token is described as optional in public configuration even though production behavior depends on it.

**Recommendation:**

- Split health and proxy into separate listeners or routes with separate credentials.
- Make `WORKER_HEALTH_TOKEN` mandatory in production.
- Make `BIQUOTE_PROXY_TOKEN` explicit in the worker schema.
- Bind to `127.0.0.1` where the deployment profile permits it.
- Add request method checks and body-size limits.
- Return generic upstream errors rather than `String(err)`.
- Add integration tests for unauthorized health/proxy access.

**Impact:** Internal network abuse, information disclosure, SSRF-adjacent exposure.

### 4. The project is overbuilt relative to its supported single-user contract

The repository contains substantial dormant or experimental infrastructure for:

- RLS and tenant context.
- Organizations and memberships.
- BYPASSRLS/admin database connections.
- Tenant-aware workers.
- Shared mode.
- Billing.
- Multiple observability systems.
- Multiple scheduler/deployment profiles.
- Several providers and fallback modes.
- Compatibility aliases from the previous product name.
- Multiple migration/runtime modes.

This is technically ambitious, but it increases:

- Attack surface.
- Configuration ambiguity.
- Upgrade complexity.
- Test matrix size.
- Contributor cognitive load.
- Risk that unsupported code accidentally becomes reachable.

**Recommendation:** Create hard product boundaries:

- `single-user-core`
- `experimental-shared`
- `maintainer-only`
- `test/load infrastructure`

Then enforce those boundaries through package exports, build profiles, environment validation, and documentation. Consider excluding unsupported shared/billing infrastructure from the default OSS build until it is ready.

**Impact:** Maintainability and accidental feature activation.

### 5. Startup and production configuration validation is duplicated

Production checks appear in multiple places:

- `packages/shared/src/env.ts`
- `apps/worker/src/env.ts`
- `apps/web/src/auth.ts`
- `apps/web/src/auth.config.ts`
- `apps/web/scripts/migrate-runtime.mjs`
- `apps/web/docker-entrypoint.sh`
- Various static release scripts.

This creates drift risk. For example:

- Different places interpret compatibility variables.
- Auth security checks are duplicated.
- Worker and web environment schemas diverge.
- Migration configuration logic is partly shell and partly JavaScript.
- `WORKER_HEALTH_TOKEN` and `BIQUOTE_PROXY_TOKEN` are not equally represented.

**Recommendation:** Centralize canonical invariants in one shared, runtime-neutral package, then expose narrowly scoped projections for web/worker. Keep only runtime-specific checks local.

**Impact:** Configuration correctness and future regressions.

## P2 — Medium priority

### 6. `auth.ts` remains too concentrated

`apps/web/src/auth.ts` includes or coordinates:

- Credentials authentication.
- Password verification.
- Login lockout.
- 2FA/TOTP.
- Backup-code consumption.
- Session creation.
- OAuth provisioning.
- Impersonation.
- Token versioning.
- Auth environment checks.
- Logging/anomaly events.

The implementation is thoughtful, but the file is difficult to reason about and easy to regress.

**Suggested split:**

```text
auth/
  credentials-authorize.ts
  password-lockout.ts
  two-factor.ts
  backup-codes.ts
  session-creation.ts
  oauth-provisioning.ts
  impersonation.ts
  auth-invariants.ts
```

Keep `auth.ts` as composition glue.

### 7. CI contains duplicated and non-blocking checks

Examples:

- `ci-fast.yml` runs `check:env-contract` twice.
- Bundle analysis is `continue-on-error`.
- Knip is report-only.
- Playwright report merging is `continue-on-error`.
- Release workflow says “Setup Node.js 20” but actually uses Node 22.
- CI is broad but not obviously divided into required PR gates versus informational checks.

**Recommendation:**

- Remove duplicate steps.
- Correct labels.
- Define required checks explicitly.
- Make report-only jobs visibly informational.
- Add a CI status summary job that fails if required jobs fail.
- Avoid running the full web build twice in the same PR job unless analysis output is needed.

### 8. Test suite passes but produces excessive expected error noise

The full test output contains many expected errors/warnings, including:

- Encryption authentication failures used to test error paths.
- React warnings.
- Missing mocked exports.
- Service-worker template warnings.
- Voice input diagnostics.
- Worker simulated connection errors.

This makes genuine regressions harder to identify.

**Recommendation:**

- Capture and assert expected logs instead of printing them.
- Add a test logger sink that suppresses expected output.
- Fail tests on unexpected `console.error` or React warnings.
- Fix incomplete mocks such as the reported missing `getDb` mock.
- Treat “expected error” tests as structured assertions, not noisy runtime logs.

### 9. PGlite test strategy is too slow

Several DB test files take tens or hundreds of seconds because migrations are repeatedly applied. This makes the full suite expensive and discourages frequent verification.

**Recommendation:**

- Use one migrated fixture per test file where isolation permits.
- Cache a prepared PGlite database snapshot.
- Reserve full migration-chain tests for a dedicated job.
- Use transaction rollback or schema reset for unit-level database tests.
- Keep real PostgreSQL tests separate and explicitly labeled.

### 10. The tick buffer drain logic has a documented race

`apps/worker/src/index.ts` says:

> ticks arriving between `peek()` and `drain()` will be cleared by `drain()`

The code treats this as acceptable because the window is small. For market data, silently dropping ticks can still affect candle construction and live prices.

**Recommendation:** Use a generation/sequence-based buffer:

- `peek()` returns a batch plus sequence boundary.
- Successful flush removes only entries up to that boundary.
- New ticks remain queued.
- Add a concurrency test where ticks arrive during the DB write.

**Impact:** Data correctness during high-volume or slow-database periods.

### 11. Candle flush timeout does not cancel the underlying operation

The code races `flushClosedCandle` against a timeout, but the underlying promise continues running after timeout. This can result in:

- Unbounded concurrent database work if the DB hangs repeatedly.
- Late writes after the worker believes the operation timed out.
- Confusing success/failure accounting.
- Shutdown completing while flushes remain in flight.

**Recommendation:** Pass an `AbortSignal` through the persistence layer and cancel on timeout, or enforce database-side cancellation/statement timeout tied to the operation.

### 12. Worker startup ordering is fragile

`runWorker()` starts market-data consumers before the health server is created in `main()`. If the consumer starts successfully but health server creation/listening fails, cleanup is handled, but the worker may briefly run without a health surface.

Also, `notifyReady()` is called before the HTTP health server is listening.

**Recommendation:**

- Start the health server before advertising readiness.
- Register cleanup immediately after each resource is created.
- Call `notifyReady()` only after consumers, scheduler, and health server are all active.
- Add startup failure tests for each stage.

### 13. Compose secrets and container configuration are easy to misunderstand

The Compose file combines:

- `environment`
- `env_file`
- interpolated values
- local Docker overrides
- optional Langfuse profile
- production-like variables
- historical volume names

This is functional but complex. Operators may assume an `env_file` value overrides an explicit `environment` value when it does not.

**Recommendation:** Add a generated, redacted `docker compose config` validation command to setup/diagnostics. Document precedence explicitly. Consider one canonical `.env` schema with generated comments explaining each variable.

### 14. `trustHost: true` needs stronger operator guardrails

`auth.config.ts` uses:

```ts
trustHost: true
```

This is often necessary behind reverse proxies, but it places responsibility on the deployment topology. The code comments mention this, but a self-hosting operator could expose the app directly or misconfigure forwarded hosts.

**Recommendation:**

- Document trusted proxy requirements prominently in the setup output.
- Validate `NEXTAUTH_URL`/`AUTH_URL` and public host consistency.
- Add host-header and forwarded-header integration tests.
- Provide a reverse-proxy example for Caddy/Nginx/Traefik.

### 15. Security headers are incomplete

The CSP is thoughtful, but the repository’s stated best-practice target should also explicitly verify:

- HSTS in HTTPS deployments.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy`.
- `Permissions-Policy`.
- `frame-ancestors` within CSP.
- `base-uri`.
- `form-action`.
- Trusted Types rollout or a documented reason not to use it.

**Recommendation:** Add a response-header contract test against the actual production middleware path.

### 16. Error responses may disclose upstream/internal details

The worker proxy returns:

```ts
message: String(err)
```

Even though logs redact the target host, the response can expose internal fetch, URL, DNS, or TLS details to callers.

**Recommendation:** Return a stable generic message and request ID. Keep detailed errors in structured logs only.

### 17. Documentation claims and implementation should be checked mechanically

The documentation is generally honest, but there are inconsistencies worth cleaning:

- `SECURITY.md` refers to `hfx_csrf`, while production uses `__Host-hfx_csrf`.
- Worker health token is described as “recommended” in one place and effectively required for production behavior elsewhere.
- Release workflow label says Node 20 while using Node 22.
- Legacy HamaFX/Kestrel names remain in compatibility paths, comments, tests, and operational files.
- Historical audit references can be mistaken for current guarantees.

**Recommendation:** Add documentation contract tests for security-sensitive names and version claims.

## P3 — Low priority / cleanup

### 18. Remove or isolate compatibility aliases

Examples include:

- `HAMAFX_ENABLE_RLS`
- `HAMAFX_RUNTIME`
- `HAMAFX_LOCAL_DOCKER`
- legacy `.hamafx/` directories
- old names in load tests and comments

Compatibility is useful for upgrades, but aliases should:

- Emit warnings.
- Have a removal target/version.
- Be tested separately.
- Never appear in new deployment examples.

### 19. Reduce comments that describe historical phases

Many files contain phase/PR/audit references such as `P2-6`, `H-3`, `STAB-21`, and report names. These are useful during development but add noise after the behavior is stable.

**Recommendation:** Keep concise rationale comments in source; move historical implementation narratives into changelog/audit documents.

### 20. Add a first-run diagnostic command

This is already identified in the project documentation and would materially improve support.

It should report, without secrets:

- Node/pnpm/Docker versions.
- Selected deployment profile.
- Database connectivity and migration status.
- Auth configuration status.
- Single-user invariant status.
- Writable paths.
- Worker connectivity.
- Optional providers.
- Backup status.
- Public URL/TLS configuration.
- Image/source revision.

### 21. Make versioning explicit

The root application remains:

```json
"version": "0.0.0"
```

The repository itself acknowledges that package publishing and application/Docker releases are not yet unified.

Define:

- Git tag.
- Application version.
- Web image tag/digest.
- Worker image tag/digest.
- Migration version.
- SBOM version.
- Source revision.
- Release archive metadata.

### 22. Improve dependency and asset compliance

The project has lockfile, SBOM, audit, and license tooling, but the audit still needs:

- Actual dependency license artifact review.
- Font/icon/image license inventory.
- Screenshot/sample-data review.
- Provider trademark and API-term review.
- A policy for high/critical advisories that cannot immediately be upgraded.

### 23. Add browser-level regression coverage for the real single-user lifecycle

The current test suite is broad, but the most valuable end-to-end path should be explicitly covered as one scenario:

1. Fresh install.
2. First owner registration.
3. Second registration rejected.
4. Login.
5. Enable 2FA.
6. Add BYOK key.
7. Create chat/thread/journal data.
8. Export/delete data.
9. Restart application.
10. Verify data and session behavior.
11. Backup and restore.

# Security assessment

## Strengths

- Single-user mode defaults are clear and fail closed.
- `MULTI_USER_ENABLED` requires RLS.
- OSS mode rejects multi-user/RLS combinations.
- Production auth secrets are required.
- Legacy auth is forbidden in production.
- Password timing defense exists.
- Atomic login lockout updates exist.
- Dedicated 2FA lockout/rate limiting exists.
- Backup-code consumption is atomic.
- JWT token version invalidation exists.
- Persisted sessions enable revocation.
- CSRF double-submit protection exists.
- Signed downstream user headers provide defense in depth.
- BYOK encryption uses AES-256-GCM.
- Database TLS behavior is conservative in production.
- Container images run as non-root.
- Docker ports default to localhost on the host.
- Webhook HMAC verification and idempotency protections exist.
- Secret scanners, CodeQL, Trivy, SBOM generation, and release checks exist.

## Residual security risks

- HTTP-level ownership proof is incomplete.
- Worker proxy and health endpoint are combined.
- Runtime migration startup is operationally risky.
- `trustHost: true` depends heavily on correct reverse-proxy setup.
- CSP/security headers need broader automated verification.
- Unsupported shared-mode code remains present and complex.
- Provider/upstream error details may be returned to callers.
- Off-host backup and encryption-secret recovery are not proven.
- No independent security assessment has occurred.

**Security rating: 7/10.**

# Single-user mode specifically

## What is correctly enforced

The intended invariant is:

```text
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

This is enforced in:

- `docker-compose.yml`
- `packages/shared/src/env.ts`
- `packages/db/src/client.ts`
- `apps/web/scripts/migrate-runtime.mjs`
- release-contract scripts
- documentation and CI

That is excellent. The project does not merely document single-user mode; it actively prevents several unsafe combinations.

## What remains dangerous

Single-user mode is safe primarily because it avoids the hardest tenant-isolation problem. It should not be interpreted as proving the underlying multi-user architecture.

The project itself correctly acknowledges that user scoping is not equivalent to database-enforced isolation. This distinction should remain prominent.

For a single-user instance, the main threat shifts from cross-tenant isolation to:

- Unauthorized access to the one account.
- Secret theft from the host.
- Misconfigured reverse proxy.
- Exposed database/worker ports.
- Lost encryption secret.
- Broken backup restoration.
- Provider/API data leakage.
- Operational migration failure.
- Local filesystem permissions.
- Accidental activation of legacy or experimental modes.

# Upgrade/improvement plan

## Immediate release blockers

1. Add advisory locking or a dedicated migration job.
2. Complete HTTP-level auth/ownership/CSRF integration tests.
3. Make production worker health/proxy credentials explicit and safer.
4. Perform a true clean-machine Docker install with fresh volumes.
5. Perform previous-release upgrade testing.
6. Perform backup restore with a matching encryption secret.
7. Run current-tree and Git-history secret checks before release.
8. Review all release artifacts and dependency/asset licenses.

## Next iteration

1. Split authentication responsibilities.
2. Centralize environment invariants.
3. Fix tick-buffer sequence draining.
4. Add cancellation to timed-out candle writes.
5. Make readiness notification occur after health server startup.
6. Remove duplicated CI checks.
7. Separate required and informational CI.
8. Reduce noisy expected test logs.
9. Improve PGlite fixture reuse.
10. Add first-run diagnostics.

## Before any shared/multi-user mode

1. Complete tenant context on every user-data query.
2. Prove worker/cache/memory/export/share/upload/notification/billing/telemetry isolation.
3. Test concurrent cross-tenant requests on real PostgreSQL.
4. Test retries, failures, leases, and admin/BYPASSRLS paths.
5. Test complete migrated schema under real PostgreSQL roles.
6. Obtain an independent external security review.
7. Keep shared mode disabled until every gate passes.

# Final assessment

This is a serious and well-engineered **single-user self-hosted beta**, not a toy project. The security boundary is one of the strongest parts of the repository, and the project has good instincts around fail-closed behavior, explicit caveats, encrypted BYOK, operational checks, and release hygiene.

The primary weakness is not a single obvious catastrophic bug. It is **system complexity combined with incomplete production validation**. The repository contains more infrastructure than the supported single-user product needs, and that increases the chance of configuration drift, accidental activation, and upgrade failures.

**Recommended release decision:**

- **Single-user self-hosted beta:** Approve with caveats.
- **Production-like self-hosting:** Conditional approval after clean-install, migration, backup/restore, and proxy hardening.
- **Shared multi-user hosting:** Reject.
- **Independent security-audit claim:** Reject; not performed.

No source changes were made during the audit itself.
