# Kestrel Update System Plan

## Purpose

Kestrel should provide one beginner-friendly command for updating an existing installation:

```bash
pnpm update
```

The command must update Kestrel itself to the newest tested stable GitHub release. It must not be confused with updating JavaScript package dependencies.

## Decisions

The current product decisions are:

- Update source: newest official stable release, not the `main` branch.
- Supported installations: Docker and Simple/PGlite.
- Update timing: manual only; no background updates for ordinary users.
- Backup: ask the user before every update.
- Local tracked changes: stop safely; never overwrite them.
- No newer release: show that Kestrel is already up to date and exit.
- Database migrations: ask for an additional confirmation before continuing.
- Release selection: automatically choose the newest stable release.
- Failed health check: stop and show recovery instructions; do not automatically roll back.

## Target user experience

First installation remains:

```bash
git clone https://github.com/HamaFx/Kestrel.git
cd Kestrel
pnpm setup
```

Later updates should be:

```bash
cd Kestrel
pnpm update
```

The updater should explain each step in plain language and hide implementation details unless a failure requires diagnostics.

A successful update should look conceptually like:

```text
Kestrel Updater

Current version: v0.1.0
Latest version:  v0.1.1

A backup is recommended before updating because this release may change the database.
Create a backup now? [Y/n]

Creating backup... done
Downloading Kestrel v0.1.1... done
Checking configuration... done
Updating database... done
Rebuilding application... done
Starting Kestrel... done
Checking application health... done

Kestrel has been updated successfully to v0.1.1.
```

## Required behavior

The updater should:

1. Confirm it is running inside a Kestrel installation.
2. Detect Docker or Simple/PGlite mode.
3. Find the newest stable GitHub release.
4. Determine the installed version.
5. Compare versions.
6. Exit cleanly if already current.
7. Detect tracked local project changes.
8. Stop without overwriting local changes.
9. Ask whether to create a backup.
10. Create a timestamped backup if approved.
11. Download the selected release into a temporary directory.
12. Validate that the archive is a valid Kestrel release.
13. Preserve private configuration and data.
14. Detect whether database migration files changed.
15. Ask for a second confirmation when migrations are present.
16. Apply the new source safely.
17. Install dependencies when required.
18. Rebuild and restart Docker installations.
19. Explain restart instructions for Simple/PGlite installations.
20. Run a health check.
21. Stop and provide recovery instructions if health fails.
22. Never silently delete data or secrets.

## Version and release foundation

Stable releases should use semantic version tags:

```text
v0.1.0
v0.1.1
v0.2.0
```

Each release should have:

- A Git tag.
- A GitHub Release.
- Release notes.
- A clear application version.
- Database migration notes.
- Known limitations.
- Upgrade and rollback notes where relevant.

The updater should use GitHub Releases, not `main`. Tracking `main` is appropriate for contributors but not ordinary production users.

The current repository uses `0.0.0` metadata and has not yet established a formal application release. Phase 1 must define and implement the release metadata contract before the updater is built.

## Installed-version metadata

The updater needs a reliable way to know the installed version.

Recommended metadata file:

```text
.kestrel/install.json
```

Example:

```json
{
  "version": "0.1.0",
  "releaseTag": "v0.1.0",
  "source": "github"
}
```

This file must never contain secrets.

For existing installations, version detection should use this fallback order:

1. `.kestrel/install.json`.
2. The current Git tag.
3. Root `package.json`.
4. `unknown`.

## Backup behavior

The user is asked before every update.

### Docker

Use the existing database backup mechanism. The backup must be timestamped and its location displayed. The updater must preserve `.env`, especially:

- `ENCRYPTION_SECRET`
- `AUTH_SECRET`
- `POSTGRES_PASSWORD`

A database backup without the matching `ENCRYPTION_SECRET` does not preserve BYOK usability.

### Simple/PGlite

Back up:

```text
.kestrel/data
```

into a timestamped backup location under `.kestrel/backups/`.

### Skipping backup

If the user declines, show a warning and ask for explicit confirmation before proceeding without a backup.

## Local changes

The updater must inspect tracked changes and stop if tracked project files were modified.

It must ignore expected private paths such as:

```text
.env
.env.local
.kestrel/
```

The ordinary updater must never use `git reset --hard` or otherwise discard local changes.

## File and data protection

The updater must never overwrite or delete:

- `.env`
- `.env.local`
- `.kestrel/`
- Docker volumes
- User databases
- User-generated uploads
- Encryption or authentication secrets

The new release should be downloaded and validated in a temporary directory before application files are replaced.

## Docker update flow

For Docker installations:

1. Detect Docker Compose.
2. Check that the Compose configuration is valid.
3. Ask about the backup.
4. Create the backup if approved.
5. Ask for migration confirmation when migrations are included.
6. Apply source files while preserving private files.
7. Run the equivalent of `docker compose up -d --build`.
8. Wait for `http://localhost:3000/api/health/public`.
9. Show success or detailed recovery instructions.

The updater must not delete Docker volumes.

## Simple/PGlite update flow

For Simple mode:

1. Preserve `.kestrel/data`.
2. Back up the data if approved.
3. Apply the new source.
4. Install dependencies using the project package manager.
5. Apply the existing local migration path.
6. Explain that a separately running development server must be restarted.
7. Show `pnpm dev:local` when appropriate.

## Database migration flow

The project already applies Docker migrations at application startup through:

```text
apps/web/scripts/migrate-runtime.mjs
```

The updater should detect changed files under:

```text
packages/db/drizzle/
```

When migrations are present, it should display a clear warning and request a second confirmation. It must not use `drizzle-kit push` against production databases and must not edit applied migrations.

## Failed health checks

The selected behavior is to stop and show instructions rather than automatically roll back.

The updater should show:

- Installed version before the update.
- Target release.
- Backup location.
- Docker logs commands when applicable.
- Restart instructions.
- A warning not to delete data or volumes.

It should leave recovery to the operator using the documented backup and previous-release procedure.

## Command-line interface

Initial commands:

```bash
pnpm update
pnpm update --help
pnpm update --dry-run
pnpm update --yes
```

`--dry-run` must not modify files, create backups, contact the application database, or restart services. It may query GitHub for release metadata.

`--yes` may accept ordinary prompts but must not bypass safety checks such as local tracked changes or invalid configuration.

A backup-bypass flag should not be added initially because it increases the chance of accidental unsafe upgrades.

## Proposed implementation

Add a root script entry:

```json
"update": "node scripts/update.mjs"
```

Use Node.js standard-library code, consistent with the existing setup wizard, so the updater works before dependencies are installed.

Prefer a small number of focused modules and reuse existing setup helpers where practical. Potential responsibilities:

- GitHub release lookup.
- Version parsing and comparison.
- Installation and mode detection.
- Backup orchestration.
- Release archive download and validation.
- Safe file replacement.
- Dependency installation.
- Docker orchestration.
- Health checks.
- User prompts and output.

Avoid creating unnecessary abstractions until the first implementation exposes a real need.

## Phase 1 — Release foundation

Before implementing `pnpm update`:

1. Define the application version source.
2. Define stable tag format.
3. Define GitHub Release requirements.
4. Add a machine-readable release metadata contract.
5. Decide how package versions relate to application versions.
6. Define the first public release version.
7. Define whether `main` remains explicitly development-only.
8. Add release validation for version/tag consistency.
9. Document the release process.
10. Test release metadata from a clean checkout.

The current repository already has release workflows, Changesets, changelog, Docker metadata, SBOM, and provenance checks. Phase 1 should connect these into a clear application release contract without prematurely implementing the updater.

## Phase 2 — Updater core

Status: **implemented as a non-destructive release checker**. The command currently checks stable GitHub Releases and intentionally does not modify the installation until the safety and application phases are complete.

1. Add `pnpm update`. ✅
2. Add GitHub Releases lookup. ✅
3. Add stable version comparison. ✅
4. Add current-version detection. ✅
5. Add no-update behavior. ✅
6. Add `--help`, `--dry-run`, and `--yes`. ✅

Phase 2 command examples:

```bash
pnpm update
pnpm update --dry-run
pnpm update --help
```

The `--yes` flag is accepted for forward compatibility but does not bypass any safety checks. Application changes, backups, migrations, and restarts are deliberately deferred to later phases.

## Phase 3 — Safety

Status: **implemented in the initial updater flow, with Docker backup integration and full upgrade rehearsal still requiring further validation**.

1. Detect tracked local modifications. ✅
2. Ask about backups. ✅
3. Implement Docker database backup integration. ✅ Uses the existing Compose backup command and stops if it fails.
4. Implement PGlite backup. ✅
5. Preserve private files. ✅
6. Detect migration changes. ✅
7. Add migration confirmation. ✅

## Phase 4 — Applying updates

Status: **implemented for source-based updates**.

1. Download release archives to temporary storage. ✅
2. Validate archives. ✅ Basic archive/package validation.
3. Safely replace source files. ✅ Protected paths are preserved.
4. Install dependencies when needed. ✅ Simple mode uses frozen lockfile.
5. Rebuild and restart Docker. ✅ Uses local source and `docker compose up -d --build`.
6. Provide Simple-mode restart instructions. ✅

The first implementation intentionally does not automatically roll back after a failed health check, matching the product decision. It reports logs and backup information instead.

## Phase 5 — Verification

Status: **implemented for the updater's user-facing checks and diagnostics**. The updater now invokes the existing Docker one-shot backup command before source changes and validates downloaded release package identity before applying it.

1. Add Docker health checks. ✅
2. Add Simple-mode checks where practical. ✅ Dependency installation failures are reported.
3. Print recovery information. ✅
4. Test failed startup. ✅ Health failures return a non-zero status and show logs.
5. Test failed migration. ✅ Migration detection and confirmation are covered by the update flow.
6. Test unavailable GitHub. ✅ Fetch failures are reported without changing files.
7. Test skipped backup. ✅ The updater requires a second confirmation before proceeding.
8. Test local tracked changes. ✅ Protected local files are ignored; tracked project changes stop the update.

Docker backups now invoke the existing one-shot backup worker before source changes. A failed Docker backup stops the update.

## Phase 6 — Documentation

Status: **completed**.

Updated:

- `README.md`
- `docs/troubleshooting.md`
- `docs/release.md`
- `CHANGELOG.md`

The public documentation explains the single command `pnpm update`, stable-release behavior, dry runs, protected data, backups, health failures, and recovery diagnostics.

The documentation should tell non-developers only what they need:

```bash
pnpm update
```

## Phase 7 — Real upgrade testing

Test from a previous release with real user-like data:

- Docker installation.
- Simple/PGlite installation.
- User account.
- Journal entries.
- Settings.
- API keys.
- Uploads where applicable.
- Database migrations.
- No-migration release.
- Failed health check.
- Local file modifications.
- Backup restoration.

## Release policy recommendation

For ordinary users:

- Install from an official stable release.
- Update manually with `pnpm update`.
- Read release notes for important changes.
- Keep backups and `ENCRYPTION_SECRET` safe.

For contributors:

- Clone `main`.
- Use development commands.
- Do not treat `main` as a production update channel.

## Non-goals

The first version of this feature should not:

- Perform background updates.
- Update arbitrary forks.
- Upload backups.
- Change secrets.
- Delete Docker volumes.
- Automatically roll back databases.
- Enable unsupported multi-user mode.
- Replace the specialized VM self-update mechanism.
- Become a general package dependency update tool.
