# Kestrel Open-Source Release Plan

**Status:** Hardened single-user self-hosted preview
**Date:** 2026-08-29
**Scope:** Remaining work required before presenting Kestrel as production-ready open-source software.

## Release boundary

The first public release should be explicitly labeled:

> Single-user, self-hosted preview. Multi-user tenancy, hosted billing, and production operational guarantees are not included.

Keep these defaults unchanged for the first OSS release:

```text
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
BILLING_ENABLED=0
```

Do not advertise multi-user self-hosting until the tenant/RLS and worker-isolation test suites pass.

## Definition of done

The project is ready for a public OSS preview when:

- no secret is present in the release tree or Git history;
- `pnpm check:oss-release`, `pnpm typecheck`, `pnpm lint`, focused tests, and the full hermetic test suite pass;
- Docker, PGlite, and hosted-style startup paths are smoke-tested from a clean checkout;
- all privileged routes have behavioral authorization coverage;
- arbitrary outbound requests have DNS-aware SSRF protection;
- uploads and object access have ownership, quota, and abuse coverage;
- release artifacts are reproducible enough to scan, attest, and identify;
- privacy, deletion, retention, and worker failure behavior are tested;
- public security, support, licensing, and versioning metadata is accurate.

## Phase 0 — repository and secret release gate

**Priority:** P0

### Tasks

1. Run a vetted secret scanner against the full Git history and current tracked tree.
2. Inspect all environment variants, backups, Vercel files, certificates, service-account material, and generated artifacts.
3. Rotate every credential if historical exposure is found.
4. Confirm only placeholder values exist in `.env.example`.
5. Remove local environment files from the release workspace before packaging.
6. Run `pnpm check:oss-release` in CI and as a release prerequisite.
7. Verify ignored files are not included in source archives or Docker build context.

### Exit criteria

- Secret scan is clean or all findings are rotated and remediated.
- Release archive contains no secrets, local databases, private deployment files, or credentials.
- CI fails closed on newly introduced secret-like files.

## Phase 1 — privileged access and API boundaries

**Priority:** P0/P1

### Tasks

1. Add behavioral route-matrix tests for every `/api/admin/**` endpoint:
   - no session → `401`;
   - regular user → `403`;
   - explicit admin → success;
   - sole OSS user → success only when `OSS_SINGLE_USER_MODE=1`.
2. Add route-matrix tests for every cron endpoint:
   - missing bearer/session;
   - invalid bearer;
   - regular session;
   - admin session;
   - valid scheduler bearer;
   - sensitive versus non-sensitive job behavior.
3. Audit diagnostics, traces, logs, eval data, billing DLQ, impersonation, flush, and user-management routes for redaction and audit logging.
4. Move remaining API route direct imports behind `apps/web/src/lib/services/*`.
5. Standardize auth, rate limiting, request IDs, and error envelopes through the service boundary.
6. Keep impersonation unavailable in production regardless of other settings.

### Exit criteria

- Static and behavioral route coverage is complete.
- No API route bypasses the intended auth/service boundary without an explicit, tested exception.
- Diagnostics never expose keys, cookies, authorization headers, or credential-bearing URLs.

## Phase 2 — outbound network and content security

**Priority:** P1

### SSRF tasks

1. Inventory every `fetch`, URL constructor, redirect, webhook, health target, vault target, and external-content path.
2. Apply the shared URL policy to every user-, model-, or environment-controlled target.
3. Resolve hostnames before connection and reject loopback, private, link-local, multicast, reserved, and cloud-metadata addresses.
4. Revalidate every redirect hop and prevent DNS rebinding between validation and connection.
5. Use strict timeouts, response-size limits, content-type checks, and safe header allowlists.
6. Never forward cookies, authorization headers, internal request headers, or cloud credentials.
7. Add controlled-resolver tests for redirects, DNS changes, IPv4/IPv6 forms, and mixed-encoding hostnames.

### Upload/storage tasks

1. Enforce authenticated ownership on every upload, read, signed URL, and delete operation.
2. Add per-user upload rate limits, quotas, and cleanup retry handling.
3. Test malformed files, decompression bombs, oversized multipart bodies, MIME spoofing, and metadata abuse.
4. Reject executable and active content types, including SVG unless explicitly sanitized.
5. Verify signed URL expiry, content disposition, cache headers, and cross-user object isolation.
6. Ensure provider errors do not disclose secrets or internal URLs.

### CSP/HTML tasks

1. Review every HTML injection sink with hostile-input tests.
2. Remove `unsafe-inline` and broad external origins where Next.js and TradingView permit.
3. Narrow `connect-src`, `frame-src`, image origins, and WebSocket origins.
4. Confirm CSP behavior on middleware-bypassed, error, static, and service-worker routes.

### Exit criteria

- No user/model-controlled outbound request bypasses the shared policy.
- Upload and object ownership tests pass.
- CSP and hostile-content tests pass without regressions.

## Phase 3 — deployment and supply-chain integrity

**Priority:** P1

### Tasks

1. Verify exact upstream digests for all Docker and Compose images; pin only verified digests.
2. Pin every GitHub Action to a verified commit SHA.
3. Build each image once, scan that exact artifact, then publish that artifact.
4. Generate image and package SBOMs.
5. Add signed provenance/attestation and immutable release tags.
6. Add package-content checks for published workspaces and verify no private files are included.
7. Add clean-checkout smoke jobs for:
   - PGlite/Simple mode;
   - Docker/Postgres mode;
   - web plus worker mode;
   - production-like startup with billing and impersonation disabled.
8. Validate migration startup using direct/session database URLs only.

### Exit criteria

- Release artifacts are identifiable, scanned, attestable, and reproducible within the documented limits.
- Clean-checkout setup succeeds without private files or hosted-only assumptions.
- Mutable action/image references are absent or explicitly justified and tested.

## Phase 4 — privacy, deletion, and reliability

**Priority:** P1/P2

### Tasks

1. Map all persisted user data: accounts, sessions, chats, traces, telemetry, memory, embeddings, uploads, notifications, billing, audit records, and backups.
2. Define deletion and retention behavior for each category.
3. Test account deletion, retries, partial failures, tombstones, and backup retention.
4. Confirm retained billing/audit records cannot expose deleted user content.
5. Test worker leases, heartbeats, stale recovery, retries, cancellation, shutdown, and duplicate workers.
6. Verify every background job is idempotent and tenant-safe.
7. Test service-worker cache behavior across logout/login and account switching.
8. Ensure production logs and diagnostics redact prompts, tokens, keys, cookies, and personal data.

### Exit criteria

- Deletion and retention behavior is documented in executable tests.
- Worker restart and duplicate-processing scenarios are safe.
- No private response remains available through a shared browser cache.

## Phase 5 — hermetic tests and contributor experience

**Priority:** P2

### Tasks

1. Make default unit/integration tests provider-free and deterministic.
2. Separate live AI, market-data, email, Telegram, billing, and staging tests from default CI.
3. Run full tests with no production credentials.
4. Add targeted coverage thresholds for auth, authorization, URL safety, uploads, encryption, billing, and deletion.
5. Replace `0.0.0` with a deliberate pre-1.0 version policy.
6. Align Node and pnpm requirements across package metadata, setup scripts, and contributor entry points.
7. Document dependency overrides and upgrade compatibility tests.
8. Verify CODEOWNERS, security contacts, contribution rules, and the Code of Conduct point to public resources.
9. Verify provider terms, rate limits, attribution, and redistribution responsibilities.

### Exit criteria

- A new contributor can clone, install, test, and run the supported local mode without private context.
- CI is deterministic and does not depend on production services.
- Package and public-project metadata is consistent.

## Execution order

1. Phase 0: secret and release-tree gate.
2. Phase 1: privileged-route behavioral coverage and service boundaries.
3. Phase 2: complete SSRF, upload, storage, and CSP security.
4. Phase 3: verified supply chain, SBOM, provenance, and deployment smoke tests.
5. Phase 4: privacy, deletion, and worker reliability.
6. Phase 5: hermetic CI and contributor/release polish.

## Current verification baseline

Already verified in the working tree:

```text
pnpm typecheck                         PASS
pnpm lint                              PASS, warnings only
pnpm check:oss-release                 PASS
Focused admin/billing tests            PASS
Focused URL/storage tests              PASS in prior verification
OSS single-user boundary               PASS in prior verification
```

Still requiring external or operational verification:

- Git-history secret scan and credential rotation.
- Exact Docker image and GitHub Action digest verification.
- SBOM/provenance publication.
- Clean Docker, PGlite, and hosted deployment smoke tests.
- DNS-aware SSRF tests with a controlled resolver.
- Full retention/deletion and worker restart tests.
- Full hermetic suite and complete E2E verification.

## Release policy

Until all P0 and P1 exit criteria pass:

- release only as a single-user self-hosted preview;
- keep `BILLING_ENABLED=0` by default;
- keep `MULTI_USER_ENABLED=0` and `KESTREL_ENABLE_RLS=0`;
- keep impersonation disabled in production;
- do not publish hosted deployment credentials or environment files;
- do not claim multi-user isolation or production operational support.
