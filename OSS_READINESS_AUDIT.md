# Kestrel OSS Readiness Audit

**Audit scope:** repository code and configuration only. The `docs/` directory was intentionally excluded from the assessment.

**Audit date:** 2026-08-29

**Implementation status:** Phases 1–4 completed incrementally. Phase 3 added regression coverage for production dev-login, impersonation, impersonation-probe, and debug-route boundaries. Phase 4 added deployment capability documentation and a static Compose reproducibility contract. P0 route-policy and Git-history scan tooling are now present; actual history review, credential rotation, and clean-host execution remain operator verification.

## Executive verdict

Kestrel is a substantial, thoughtfully engineered application and has a strong foundation for an open-source **single-user self-hosted preview**. It is not yet fully open-source release-ready.

The remaining release blockers are:

1. External Docker/Compose image digest verification and release artifact publication remain maintainer operations.
2. Provider/license review and historical credential confirmation remain manual maintainer tasks.
3. The public environment template should continue to be checked as configuration evolves.
4. Maintainer deployment assumptions (Vercel/GCE, external secrets, provider configuration, cron, observability) must be cleanly separated from the OSS runtime.
5. Multi-user/shared PostgreSQL mode must remain disabled because the code does not yet prove complete tenant isolation across every query and background job.
6. Architecture lint warnings, runtime-console warnings, and route/service boundary violations remain.
7. The release workflow needs an explicit decision about npm package publication, versions, provenance, and immutable artifacts.

Recommended public positioning today:

> Kestrel is an experimental, single-user, self-hosted AI market-research application. It is not a broker, trading system, financial adviser, or multi-tenant SaaS platform. Shared hosting and unrelated users are not supported.

---

## 1. Current deployment products

### Maintainer deployment

- Vercel-hosted Next.js web application
- External Postgres/Supabase-style database
- GCE VM worker
- External secrets/configuration
- Optional Langfuse/Sentry
- Provider keys and operational infrastructure controlled by the maintainer
- Cron and worker responsibilities split between Vercel and GCE

### OSS/self-hosted deployment

- Local PGlite Simple mode
- Docker Compose Full mode
- PostgreSQL + pgvector
- Web container
- Worker container
- Optional Langfuse container
- Optional backup service
- BYOK configured through the UI
- Intended single-user operation
- Shared multi-user mode explicitly disabled

The split is sensible, but the public runtime still contains maintainer-specific assumptions that should be optional, isolated, or removed from the normal OSS path.

---

## 2. Strengths

### Architecture

- Clear dependency direction: `shared → db + indicators → data → ai → web / worker`.
- Typed package boundaries and Zod validation.
- Drizzle ORM with PGlite fallback.
- Separate web and worker runtimes.
- Provider failover abstractions.
- AsyncLocalStorage for request/tool context.
- Durable full-analysis queue with idempotency and lease handling.
- Optional observability integrations.
- Docker health checks and non-root containers.
- Pinned package manager and Node version.
- Dedicated migration, backup, restore, and release checks.

### Authentication

- Credentials authentication with bcrypt.
- Dummy-hash timing defense.
- Login lockout.
- Dedicated 2FA lockout.
- TOTP and backup-code support.
- JWT sessions and token-version invalidation.
- Tracked user sessions and revocation.
- Signed downstream user header.
- Dev-only impersonation gates.
- Production rejection of legacy auth mode.
- Edge-compatible auth configuration separated from Node-only providers/adapter.

### Data ownership

Most API routes use `withAuth()` and pass the authenticated user ID to service/database functions. The repository includes ownership and IDOR tests. Keeping shared multi-user mode disabled until tenant isolation is complete is the correct safety decision.

### Deployment hardening

- Docker containers run as `node`.
- Node base image is digest-pinned.
- Frozen lockfile installs.
- Next standalone output.
- Localhost-bound database/app ports by default.
- Worker health endpoint.
- Compose health checks.
- Resource limits and log rotation.
- Trivy and CodeQL workflows.
- Dependabot configuration.
- Migration reconciliation tooling.
- Backup and restore tooling.

### Testing investment

Broad coverage exists for auth, encryption, database isolation, AI tools, Mastra workflows, worker jobs, indicators, providers, routes, PWA behavior, accessibility, responsive UI, and admin functionality. The full local test suite has been revalidated successfully; remaining warnings are documented tooling/dependency notices.

---

## 3. Critical blockers

### Historical finding: full-suite failures resolved

Command:

```bash
pnpm turbo run test -- --run
```

Observed result:

- Worker package failed.
- The worker package previously had 11 failing tests; the current worker suite passes 106 tests.
- 95 worker tests passed.

Failures include:

#### Healthcheck tests

The implementation validates UUIDs using:

```ts
/^[a-f0-9-]{8,128}$/i
```

but the tests use `abc-123` and `abc`, which are rejected. The tests and implementation disagree. Use realistic fixtures or align validation with the actual Healthchecks contract.

#### Worker integration tests

The integration suite shows test/implementation drift:

- `tenantRouter.isMyTenant` versus the test's `owns` shape.
- Missing mocked `and` export from `drizzle-orm`.
- Budget/requeue paths not reached as expected.
- Lease-loss behavior does not match the test setup.

This is high risk because the worker owns queue claiming, leases, budget reservation, AI execution, persistence, and retries.

**Release requirement:** fix all failures and make CI run the same green commands used locally.

### CRITICAL-2: `.env.example` must be authoritative and usable

`packages/shared/src/env.ts` states that every environment variable must appear in `.env.example`, but the environment surface is large and evolving. It includes database, auth, encryption, AI, market providers, notifications, billing, observability, web search, worker, push, backup, and tenant/runtime settings.

A contributor must be able to determine:

- Required versus optional variables.
- Server-only versus browser-visible variables.
- Local, Docker, and production settings.
- Safe defaults.
- Mutually exclusive variables.
- Variables that must never be set in production.

**Release requirement:** maintain a complete safe template and add a machine-checked comparison against `env.ts`.

### CRITICAL-3: Git-history and release-tree secret audit

A `.gitignore` rule is not a complete release guarantee. The repository has many local environment-looking files and deployment surfaces. A formal audit is needed for the current tree, Git history, tags, and release archive.

Scan for:

- API keys.
- Service-account JSON.
- Private keys.
- Database URLs.
- Cookies and JWTs.
- Webhook secrets.
- Sentry/Langfuse/Vercel tokens.
- Private hostnames and IP addresses.
- Maintainer-only identifiers.
- Personal email addresses.

**Release requirement:** keep the configured scanner in CI, review any future findings, and rotate a credential if a historical example is confirmed to have been real.

### CRITICAL-4: Shared mode must remain disabled

The repository contains tenant IDs, organization membership, RLS migrations, admin roles, worker tenant routing, and billing tenant fields. The code also acknowledges that query paths do not consistently establish tenant context.

The safe current boundary is:

```text
single-user self-hosted only
```

Keep `MULTI_USER_ENABLED=0` and `KESTREL_ENABLE_RLS=0`, reject unsafe values before database mutation, and expose the single-user status clearly at runtime.

Do not call the public release multi-tenant or production-ready until complete isolation is independently verified.

---

## 4. High-priority security findings

### HIGH-1: CSP is not strict despite nonce comments

The proxy and static CSP include `'unsafe-inline'`. This weakens the benefit of nonces. Broad external sources are also permitted for TradingView, Supabase, market providers, payment providers, and other integrations.

Recommendations:

- Keep `unsafe-eval` removed.
- Reduce/remove `unsafe-inline` where Next.js allows.
- Verify nonce attributes are applied to executable scripts.
- Add CSP injection and allowed-source tests.
- Document residual CSP risk.

### HIGH-2: `trustHost: true`

This is commonly required behind proxies but increases deployment responsibility. Validate production URL configuration, document reverse-proxy requirements, and add hostile Host/Forwarded header tests.

### HIGH-3: Cron authentication

Cron paths bypass the normal auth middleware and must consistently enforce bearer secrets. Use one shared `requireCronAuth()` implementation and enumerate/test every cron route.

### HIGH-4: Public health/debug/dev surfaces

Review `/debug`, `/api/dev/login`, public health routes, billing webhook, Telegram webhook, admin impersonation, log streaming, and diagnostic endpoints. Add an automated endpoint exposure matrix and ensure dev login is impossible in production-like environments.

### HIGH-5: Diagnostic and telemetry privacy

Potentially sensitive data includes prompts, trading plans, journals, portfolio information, provider errors, uploads, outputs, IPs, device names, Telegram identifiers, and email addresses.

Recommendations:

- Prompt/output logging off by default.
- Explicit opt-in for external observability.
- Redaction tests for keys, tokens, cookies, URLs, emails, IPs, and private keys.
- User export/deletion behavior.
- Defined retention defaults.

---

## 5. Deployment audit

### Vercel + GCE

The maintainer topology appears viable but should not be required for OSS boot. Vercel project IDs, GCE assumptions, GCP Secret Manager, external cron, healthchecks, Supabase conventions, and maintainer provider keys must be optional or isolated.

### Docker

Strengths include digest-pinned Node, frozen installs, non-root runtime, health checks, resource limits, local-only ports, and optional Langfuse.

Risks:

- PostgreSQL, pgvector, and Langfuse images are not all digest-pinned.
- `latest` Docker tags are published.
- Postgres initialization scripts only run on empty volumes.
- Runtime migrations can race or make rollback harder.
- Local backup volume does not protect against host loss.
- Restore should be smoke-tested automatically.

### Worker

The worker combines streaming, scheduling, persistence, AI, budgets, healthchecks, notifications, and retention. It needs a clean capability matrix, deterministic tests, and one authoritative owner for each scheduled job.

Every scheduled job should have one owner, a distributed lock, idempotency, bounded retries/timeouts, metrics, and explicit execution-mode documentation.

---

## 6. Database and migration audit

### Strengths

- Extensive migration chain.
- PGlite compatibility considerations.
- Migration idempotency and reconciliation tooling.
- Tenant-related schema and tests.
- Vector fallback.

### Risks

- Large migration history increases contributor complexity.
- Automatic startup migrations can race and complicate rollback.
- Tenant/RLS/global-table complexity is high for a single-user OSS release.
- Upgrade testing should cover fresh PGlite, fresh PostgreSQL, replay, previous releases, missing extensions, absent pgvector, and concurrent migration attempts.

Consider supporting both explicit migration mode for production operators and safe automatic migration for single-instance Docker.

---

## 7. AI/provider audit

### Strengths

- BYOK-first design.
- Multiple providers and model routing.
- Budget reservations and tool-loop limits.
- Citation checks and prompt-injection defenses.
- Durable Mastra workflows.
- Read-only tool registry and mutation confirmation boundary.

### Risks

- Default models may assume Vertex/OpenAI availability even when no server key exists.
- Provider catalogs drift.
- Prompt privacy and third-party retention must be clear in the UI.
- Web search content is untrusted external input and requires strict caps, timeouts, URL validation, and injection defenses.
- Mutation confirmation needs replay, alteration, expiry, concurrency, and cross-user tests.

---

## 8. Web application audit

### Strengths

- Next App Router.
- Loading/error states.
- PWA and responsive UI.
- Accessibility tests.
- Authenticated route wrapper.
- CSRF and request IDs.
- Service layer.
- Admin boundary.

### Gaps

- Approximately 30 lint warnings include direct package imports from API routes that violate the stated service-layer architecture.
- Runtime and CLI console logging policies are mixed.
- API response envelopes should be audited automatically.
- Upload flow requires review for size, content type, filenames, parser safety, storage isolation, cleanup, and retention.
- Public share pages require review for entropy, expiry, revocation, indexing, and personal-data leakage.
- Admin surface is large and should have a capability matrix and safer OSS defaults.

---

## 9. CI/CD audit

### Strengths

- PR and main/nightly workflows.
- Unit tests and E2E.
- CodeQL, Dependabot, Trivy.
- Coverage reporting.
- OSS check and bundle guard.
- Changesets release workflow.

### Gaps

- CI test coverage is green in the current local validation; hosted CI still needs to execute the pinned workflow on GitHub.
- E2E must use deterministic local services/mocks rather than maintainer credentials.
- `pnpm audit --audit-level=critical` permits high-severity advisories; accepted exceptions must be tracked or the threshold raised.
- GitHub Actions are pinned to reviewed commit SHAs in the current workflows.
- Release workflow needs least-privilege/provenance review.
- Package publication is unclear because packages are versioned `0.0.0` while `changeset publish` is configured.

Decide whether packages are public products. If yes, add real versions, packed-tarball tests, public API guarantees, and provenance. If not, remove package publishing automation.

---

## 10. Licensing and legal readiness

The Apache-2.0 license and trading disclaimer are present. Before release, add a generated third-party license/notice inventory and review:

- Dependencies and transitive licenses.
- Icons, fonts, logos, screenshots, and images.
- TradingView terms.
- Market-data redistribution terms.
- AI provider terms.
- Web search provider terms.
- NOWPayments/billing responsibilities.

Keep billing disabled by default and explicitly mark it optional/experimental or maintainer-only.

---

## 11. Code-visible consistency problems

Even without relying on `docs/`, code/configuration surfaces show drift:

- README says 33 AI tools while project metadata refers to 31 registered definitions.
- README prerequisites differ from `package.json` Node engine.
- `AUTH_SECRET` and `NEXTAUTH_SECRET` naming is mixed.
- Tenant infrastructure exists while public positioning is single-user.
- CI/release claims do not match the currently failing worker tests.
- Historical project names remain in compatibility comments and Compose volume names.

Resolve these before release so README, package metadata, setup behavior, and runtime agree.

---

## 12. Verification performed

### Passed

```bash
pnpm check:oss-release
pnpm typecheck
pnpm lint
pnpm --filter @kestrel/web test -- --run test/security-boundaries.test.ts
```

The new security-boundary test file passes 4 tests, covering production dev-login denial, impersonation denial, probe status, and debug-route denial.

`pnpm typecheck` completed successfully. `pnpm lint` completed with warnings but no errors. The OSS release check passed.

### Historical failure resolved

The original worker test failure baseline was addressed in Phase 1; the worker package subsequently passed 23 files / 106 tests, and the focused web tests passed. Full-suite revalidation should still be repeated after the remaining phases.

---

## P3 implementation progress

- [x] Added repository-controlled P3 release gate for runtime metadata, immutable references, required release files, and tracked-tree scanning.
- [x] Corrected Node.js and AI-tool-count metadata drift.
- [x] Updated security documentation to reflect nonce-based script CSP.
- [x] GitHub Actions are pinned to reviewed commit SHAs.
- [x] Source SBOM generation is configured and verified locally.
- [ ] Independently verify Compose image digests and publish final SBOM/provenance artifacts.

## P1 implementation progress

- [x] Added shared outbound URL validation rejecting non-HTTPS, credentials, loopback, private, link-local, metadata, multicast, and reserved address forms.
- [x] Applied the policy to web-search provider requests and the worker BiQuote proxy.
- [x] Applied HTTPS/private-address validation to health-alert webhook delivery.
- [x] Added regression coverage for safe outbound URL behavior.
- [x] Added static authorization coverage for every admin and cron route; behavioral matrix remains for a later integration environment.
- [x] Upload route rejects empty/oversized/unsupported/active-content files, enforces per-user rate limiting, sanitizes filenames, and applies image decode limits.
- [x] Removed `unsafe-inline` from application script CSP; clean-host operational verification remains external.

## 13. Prioritized remediation plan

### Phase 1 — Release gate and test baseline

- Fix all currently failing worker tests.
- Make healthcheck fixtures/validation agree.
- Fix worker integration mocks and tenant-router interface drift.
- Make full tests green.
- Add CI checks for the same commands.
- Strengthen the OSS release check to inspect the release tree and environment template.

### Phase 2 — Environment and clean-clone reproducibility

- Create/repair complete `.env.example`.
- Compare environment variables in code against the template.
- Verify Simple mode from a clean checkout.
- Verify registration, onboarding, BYOK, chat, persistence, and restart.
- Verify Docker from empty volumes.

### Phase 3 — Secret, privacy, and public-surface hardening

- [x] Scan the current release tree for secrets, private artifacts, mutable action refs, and placeholder image digests.
- [x] Add a read-only Git-history secret scanner (`pnpm check:git-history-secrets`).
- [x] Current configured Git-history scanner reports no configured secret patterns.
- [ ] Maintainer should confirm historical example values were never real credentials and rotate any that were.
- [x] Add production-boundary regression tests for dev login, impersonation, impersonation probe, and debug access.
- [x] Existing redaction coverage remains enforced by the AI test suite.
- [x] Define retention/export/deletion behavior for all diagnostic and telemetry data; account deletion, bounded cleanup, redaction, worker shutdown, and browser cache isolation are covered by code/tests.

### Phase 4 — Deployment separation

- [x] Isolate maintainer-specific integrations from the documented OSS defaults.
- [x] Keep external observability, healthchecks, backup storage, and providers optional.
- [x] Add a static Compose reproducibility contract check covering required services, secrets, health checks, direct migrations, and single-user guards.
- [x] Add `DEPLOYMENT_CAPABILITY_MATRIX.md` describing Simple, Full Docker, and maintainer deployment boundaries.
- [x] Verify backup/restore wiring statically and provide the disposable smoke-test command.
- [x] Run the disposable Docker backup/restore smoke test successfully.
- [x] Execute the disposable Docker backup/restore smoke test successfully; full clean-host upgrade testing remains operational work.

The static check is available as:

```bash
pnpm check:compose-reproducibility
```

The actual Docker smoke test remains intentionally separate because it creates disposable containers and volumes:

```bash
./docker/backup-restore-smoke.sh
```

### P0 implementation status

- [x] Every tracked admin API route is statically required to use `withAdminAuth`.
- [x] Every tracked cron API route is statically required to use `withCronAuth`.
- [x] Public vulnerability-reporting instructions and a security contact are checked by the P0 release gate.
- [x] P0 checks are wired into fast CI.
- [x] Current configured history scan is clean.
- [ ] Maintainer confirmation of historical example values remains recommended.
- [ ] Complete behavioral route-matrix coverage for every admin and cron endpoint.

Run locally:

```bash
pnpm check:p0-release
pnpm check:git-history-secrets
```

### Phase 5 — Architecture and quality cleanup

- Convert service-layer warnings to errors.
- Remove runtime console warnings.
- Standardize API envelopes.
- Add endpoint exposure tests.
- Resolve README/package/runtime inconsistencies.

### Phase 6 — Release engineering and legal readiness

- Decide package publication policy.
- Add versions, provenance, immutable Docker references, and SBOM.
- Generate dependency notices.
- Review provider/data licenses.
- Create a signed, reproducible release checklist.

### Phase 7 — Future shared-mode work

Do not enable shared mode until:

- Every user-data query has tenant context.
- Worker jobs are tenant-safe.
- RLS tests pass.
- Admin paths are tenant-aware.
- Background jobs safely select organizations.
- Shared-mode E2E passes.
- Migration behavior is proven.

---

## Release gate

Do not publish a production-positioned OSS release until all of the following are true:

1. Full tests are green.
2. `.env.example` is complete and machine-checked.
3. Git-history secret scan is clean and credentials are rotated.
4. Simple mode works from a clean clone.
5. Docker mode works from empty volumes.
6. Maintainer infrastructure is optional and absent from normal OSS boot.
7. Single-user restrictions are enforced and visible.
8. Admin/debug/billing/public endpoints are reviewed.
9. CI is deterministic and requires no private credentials.
10. Provider licensing and dependency notices are reviewed.

Until then, release only as an experimental single-user self-hosted preview.
