# Release Operations

These checks require a Docker-enabled machine and GitHub permissions. They are intentionally not run against production by repository automation.

## Local repository gates

```bash
pnpm check:release-archive
pnpm check:p3-release
pnpm check:p0-release
pnpm check:git-history-secrets
pnpm check:oss-release
pnpm typecheck
pnpm lint
```

## SBOM

Install Syft, then run:

```bash
pnpm generate:sbom
```

The source SBOM is written to `artifacts/sbom/source.spdx.json` and should be uploaded with the release, not committed by default. The local tool binaries live under `.tools/bin/` and are ignored from release archives.

## Disposable Docker verification

Run only on a disposable test installation:

```bash
./docker/backup-restore-smoke.sh
docker compose up -d --build
docker compose ps
curl -f http://localhost:3000/api/health/public
```

The backup smoke test creates and removes its own Compose project and volumes.

## Release images

The Docker workflow builds, scans, and publishes versioned commit-tagged images with BuildKit SBOM and provenance enabled. GitHub Actions are pinned to reviewed commit SHAs in the repository workflows. Before publishing, a maintainer must still independently verify base-image digests for every Compose image and review the generated scan results.

Do not treat the repository-controlled checks as proof that external provenance has been verified. The current Trivy filesystem scan reports two HIGH advisories in the lockfile (`js-yaml` and `nanoid`) whose fixed versions are not yet reachable through the current dependency graph; do not claim a vulnerability-free release until they are resolved or formally accepted.

## Credentials

The current configured Git-history scan is clean. A maintainer must still confirm whether any historical example values were ever used as real credentials; any such credential must be revoked and replaced. Never paste secret values into logs, issues, pull requests, or chat.
