# Private release process

This document describes the Kestrel private self-hosted release process. There is no separate public/private deployment contract.

## Release classification

The current release is a private self-hosted multi-user platform with Row Level Security (RLS). Every deployment enforces multi-user tenant isolation via Postgres RLS policies.

## Application version contract

Kestrel application releases use independent semantic versions in the root `package.json`, currently `0.1.0` for the first planned public beta. Workspace package versions remain implementation/package metadata and do not define the application release version.

Stable releases are manually selected by the maintainer and published as matching Git tags and GitHub Releases:

```text
package.json: 0.1.0
tag:            v0.1.0
GitHub Release: Kestrel v0.1.0
```

The `main` branch is the development channel. Updates on private deployments are applied via `git pull && docker compose up -d --build`. It preserves `.env` and Docker volumes; operators should create and verify a backup before migration releases.

Every stable release should include release notes, migration notes, known limitations, source revision, Docker image tags/digests, and rollback guidance where applicable.

## Release inputs

A release should identify:

- Git tag and source revision
- Application version
- Workspace package versions, where published
- Web and worker container tags/digests
- Database migration state
- Release notes and known limitations
- Rollback source revision/image

Changesets remain available for package publishing, but publishing workspace packages alone is not a complete application release. The application version and matching GitHub Release/tag are the release identity.

## Local pre-release checks

From a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm turbo run typecheck
pnpm turbo run lint
pnpm turbo run test -- --run
pnpm turbo run build
```

Run the security and environment contract checks:

```bash
pnpm check:env-contract
pnpm check:route-security
```

For database and deployment validation, also run the appropriate disposable tests:

```bash
pnpm test:postgres-rls
./docker/backup-restore-smoke.sh
```

The PostgreSQL RLS test requires real disposable PostgreSQL. Do not run validation against production unless the command explicitly requires it and an operator has approved it.

## Documentation gate

Before publishing:

- Confirm `README.md` describes only verified behavior.
- Confirm `README.md` Profile Matrix matches Compose and setup behavior.
- Confirm `docs/configuration.md`, `docs/troubleshooting.md`, and `docs/architecture.md` match source.
- Confirm `SUPPORT.md`, `SECURITY.md`, and `CONTRIBUTING.md` contain working links and current boundaries.
- Remove private URLs, project identifiers, credentials, cookies, and customer data from tracked files and release artifacts.
- Update `CHANGELOG.md` with user-visible changes, limitations, and security notes.

## Optional billing gate

Billing is optional. Skip the billing checklist when `BILLING_ENABLED=0`. When enabling it, verify the NOWPayments API credentials, IPN secret, webhook signature handling, idempotency, DLQ retention, and operator responsibilities before release.

## Security and licensing gate

Run current-tree and Git-history secret scans. Review:

- Environment files and generated archives
- Docker build context
- Screenshots, fonts, logos, icons, and sample data
- Provider trademarks and terms
- Dependency license report
- `NOTICE` and Apache-2.0 obligations
- Langfuse default and prompt/output capture behavior

Do not publish a release if secrets or private operational data are detected. Provider and market-data redistribution rights remain the operator’s responsibility.

## Changesets and package release

For user-facing package changes:

```bash
pnpm changeset
```

Describe the behavior change and appropriate version bump. The release workflow creates or updates a version PR and publishes packages when the Changesets action is configured to publish.

Review the generated version changes and changelog before merging. Application and Docker release notes must still be maintained explicitly.

## Docker release

The standard source-based deployment and update path is:

```bash
git pull
docker compose up -d --build
```

If using the observability overlay:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up -d --build
```

The update preserves `.env`, `.env.local`, `.kestrel/`, and Docker volumes. If health checks fail after an update, inspect logs:

```bash
docker compose logs --tail=200 app
docker compose logs --tail=200 worker
docker compose ps
```

The Compose deployment requires an operator-generated `.env`:

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

For a private release, validate from a clean checkout and fresh volumes. Do not rely solely on a maintainer’s existing `.env`, Docker volumes, or cached build.

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

Recommended release artifacts include:

- Source tag/release notes
- Web/worker image references and digests
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
