# Public release process

This document describes the public Kestrel release process. It is intentionally separate from private production deployment instructions. Maintainer-only Vercel, GCE, managed-database, monitoring, and incident details belong in the local ignored `AGENTS.private.md`.

## Release classification

The current public release is a **single-user self-hosted beta**. Do not release or advertise shared multi-user/RLS hosting, open registration, hosted SaaS operation, or independent security-audit completion without completing the documented future gates.

## Application version contract

Kestrel application releases use independent semantic versions in the root `package.json`, currently `0.1.0` for the first planned public beta. Workspace package versions remain implementation/package metadata and do not define the application release version.

Stable releases are manually selected by the maintainer and published as matching Git tags and GitHub Releases:

```text
package.json: 0.1.0
tag:            v0.1.0
GitHub Release: Kestrel v0.1.0
```

The `main` branch is the development channel and is not the stable update channel for ordinary self-hosted users. The `pnpm update` command uses the newest published stable GitHub Release, not `main`. It preserves `.env`, `.env.local`, `.kestrel/`, and Docker volumes; users should create and verify a backup before migration releases.

Every stable release should include release notes, migration notes, known limitations, source revision, Docker image tags/digests, SBOM/provenance metadata, and rollback guidance where applicable.

## Release inputs

A release should identify:

- Git tag and source revision
- Application version
- Workspace package versions, where published
- Web and worker container tags/digests
- Database migration state
- SBOM and dependency-license inventory
- Release notes and known limitations
- Rollback source revision/image

Changesets remain available for package publishing, but publishing workspace packages alone is not a complete application release. The application version and matching GitHub Release/tag are the public release identity.

## Local pre-release checks

From a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm turbo run test -- --run
pnpm build
```

Run the OSS/security/release contract checks:

```bash
pnpm check:oss-release
pnpm check:p0-release
pnpm check:p3-release
pnpm check:route-security
pnpm check:env-contract
pnpm check:release-archive
pnpm check:dependency-report
pnpm check:single-user-release
```

For database and deployment validation, also run the appropriate disposable tests:

```bash
pnpm test:postgres-rls
./docker/backup-restore-smoke.sh
```

The PostgreSQL RLS test requires real disposable PostgreSQL and is not replaced by PGlite tests. Do not run validation against production unless the command explicitly requires it and an operator has approved it.

## Documentation gate

Before publishing:

- Confirm `README.md` describes only verified public behavior.
- Confirm `docs/deployment-matrix.md` matches Compose and setup behavior.
- Confirm `docs/configuration.md`, `docs/troubleshooting.md`, and `docs/architecture.md` match source.
- Confirm `SUPPORT.md`, `SECURITY.md`, and `CONTRIBUTING.md` contain working links and current boundaries.
- Remove private URLs, project identifiers, credentials, cookies, and customer data from tracked files and release artifacts.
- Update `CHANGELOG.md` with user-visible changes, limitations, and security notes.

## Security and licensing gate

Run current-tree and Git-history secret scans. Review:

- Environment files and generated archives
- Docker build context
- Screenshots, fonts, logos, icons, and sample data
- Provider trademarks and terms
- Dependency license report
- `NOTICE` and Apache-2.0 obligations
- Sentry/Langfuse default and prompt/output capture behavior

Do not publish a release if secrets or private operational data are detected. Provider and market-data redistribution rights remain the operator’s responsibility.

## Changesets and package release

For user-facing package changes:

```bash
pnpm changeset
```

Describe the behavior change and appropriate version bump. The release workflow creates or updates a version PR and publishes packages when the Changesets action is configured to publish.

Review the generated version changes and changelog before merging. Application and Docker release notes must still be maintained explicitly.

## Docker release

The public source-based update path is:

```bash
pnpm update
```

The updater downloads the stable source archive, validates that it is a Kestrel release, preserves operator configuration and data, creates a backup through the existing backup service, rebuilds the local Docker stack, and checks `/api/health/public`. If health fails, it stops and prints log and backup instructions rather than silently rolling back.

Docker image publication is tied to a manually published GitHub Release. The release tag is the human-readable version; the commit SHA and image digest provide immutable provenance.

The Docker publication workflow runs when a GitHub release is published. It:

1. Builds web and worker images.
2. Runs Trivy scans for high/critical vulnerabilities.
3. Publishes images to GHCR.
4. Adds source revision metadata.
5. Requests build provenance and SBOM metadata.
6. Applies release and commit tags.

After publication, record the immutable image digests. Consumers should deploy a reviewed digest or release tag, not an unverified mutable tag.

The public Compose deployment still requires an operator-generated `.env`:

```bash
./docker/init-secrets.sh
docker compose up -d --build
```

Do not bake provider credentials or runtime secrets into images.

## Database migration gate

Before a production-like deployment:

1. Confirm a recent database backup exists.
2. Confirm the matching `ENCRYPTION_SECRET` recovery material exists.
3. Check migration status.
4. Use a direct/session connection (`DIRECT_URL` or `POSTGRES_URL_NON_POOLING`).
5. Never use `drizzle-kit push` against production.
6. Never edit an applied migration.
7. Apply migrations through the reviewed migration path.
8. Verify `drizzle.__drizzle_migrations` and application health afterward.

Migration failures must fail the release. Do not bypass validation or delete migration records to force startup. Runtime migrations serialize concurrent starters with a PostgreSQL advisory lock. After an interrupted deployment, inspect the migration log and `drizzle.__drizzle_migrations`, then retry the same reviewed image; PostgreSQL releases the lock when the migration connection closes. Restore only under the documented backup/restore procedure, preserving the matching `ENCRYPTION_SECRET`.

## Release validation after publication

Verify using non-secret information:

- Release page and source tag
- Web container health
- Worker `/health/live` and `/health/ready`
- Database migration state
- Auth and first-owner registration behavior
- BYOK onboarding without a maintainer key
- Market-data-disabled startup
- Backup service health
- Logs for startup errors, secret leakage, and repeated restarts

For a public OSS release, validate from a clean checkout and fresh volumes. Do not rely solely on a maintainer’s existing `.env`, Docker volumes, or cached build.

## Rollback

A rollback plan must identify:

- Previous source tag/revision
- Previous web and worker image digests
- Whether database migrations are backward-compatible
- Backup archive and restore owner
- Health gate used to confirm recovery
- User-visible limitations during rollback

Do not roll back application images across incompatible database migrations without a reviewed database recovery plan. Prefer forward corrective migrations when the schema has already advanced.

## Release artifacts

Recommended public artifacts include:

- Source tag/release notes
- Web/worker image references and digests
- SBOM
- Dependency-license report
- Validation summary
- Known limitations and unsupported modes
- Security contact/reporting instructions

Never include `.env`, database dumps, service-account files, session cookies, provider keys, private logs, or customer data.

## Post-release review

After release, record:

- What was released and when
- Which checks passed
- Any skipped checks and why
- Image digests and migration state
- Known issues and follow-up work
- Whether the public documentation needs correction

The release is not complete until the source, containers, documentation, security posture, and rollback information describe the same version.
