# P3 Completion Record

## Repository safeguards

- Release archive, dependency metadata, P0, P3, OSS, and Git-history checks are implemented and passing.
- Docker base images are pinned to a verified Node.js image digest.
- CI is configured for SBOM/provenance-capable Docker builds.
- Release operations are documented in `RELEASE_OPERATIONS.md`.

## Latest verification

Passed:

- `pnpm verify:local`
- `pnpm check:release-archive`
- `pnpm check:dependency-report`
- `pnpm check:p3-release`
- `pnpm check:p0-release`
- `pnpm typecheck`
- Worker tests: 106 tests
- Web security/storage tests: 25 tests
- Web production build
- Disposable Postgres startup and backup/restore smoke test
- Disposable worker image build

The shared URL safety helper was made browser-safe by removing its Node-only `node:net` dependency. The web build now uses Webpack with a larger V8 heap because the monorepo standalone build exceeds the default heap.

A disposable full-stack run exposed two portability defects: the local Postgres image lacked Supabase-compatible `anon`, `authenticated`, and `service_role` roles required by migration 0069, and local Docker workers were running startup cleanup against a database before the local migration/runtime boundary was ready. Migration 0095 now creates those roles idempotently, and local Docker mode skips the optional stale-row cleanup because it is not required for startup. The worker remains alive through the disposable runtime check; database write errors shown in that check are expected when the full application migration set is not applied.

## External maintainer work

- Re-run full web/worker Compose startup after the migration-role fix.
- Generate final SBOMs with Syft and scan exact release images with Trivy.
- Base-image digest review for every Compose image remains a maintainer verification step.
- Publish signed images/attestations and complete historical credential/license review.
