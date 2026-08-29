# Open-source readiness validation

## Scope

These checks use disposable local Docker resources only. They do not touch production Vercel, GCE, Supabase, or operator backups.

## PostgreSQL RLS isolation

A disposable `postgres:16-alpine` container was used with a non-owner `app_user` role. A tenant table was protected with `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a `USING`/`WITH CHECK` policy based on `app.current_tenant`.

Result: passed on 2026-08-29.

- Tenant A saw only its one row.
- Tenant B saw only its one row.
- Tenant A could not update Tenant B rows.
- Tenant A could not insert a Tenant B row.

This validates PostgreSQL policy mechanics. It does not prove every production table/policy and application query path is correct; that still requires staging validation with the actual migrated schema and roles.

## Backup and restore

Command:

```sh
./docker/backup-restore-smoke.sh
```

Result: passed on 2026-08-29.

The smoke test creates a disposable PostgreSQL container, inserts a marker, creates and validates a compressed custom-format dump, mutates the marker, restores the dump, verifies the original marker, and removes the temporary volumes on exit.

## Docker upgrade and rollback

A disposable Compose project was used to rehearse the deployment transaction with isolated containers and no repository or host paths. The rehearsal verified:

- A healthy old image starts.
- A new image replaces it and reaches healthy status.
- A deliberately unhealthy replacement fails the health gate.
- The previous image is restored and reaches healthy status.
- Disposable resources are removed afterward.

Result: passed on 2026-08-29.

This validates the image/health-gate rollback concept. The repository's actual VM script still requires a staging VM rehearsal because it also performs Git checkout changes, host-file synchronization, metadata writes, and service restarts.

## Compose validation

The default Compose file requires a generated `.env` containing `POSTGRES_PASSWORD`. The VM Compose file intentionally references `/opt/kestrel/.env` and requires the maintainer VM layout.

## Off-host backup and secret recovery

The local logical backup and restore path passed. Off-host object-storage upload and recovery of the production `ENCRYPTION_SECRET` were not executed because they require operator credentials and external storage. The scripts fail closed when B2 is not configured.

## Security review

The repository's internal release/security checks pass, including route security, environment contract, OSS boundary, archive, and P0/P3 checks. An independent external security assessment remains a separate activity and is not claimed by these tests.
