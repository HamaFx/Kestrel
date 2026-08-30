# pnpm Setup Wizard — Review Report

**Date:** 2026-08-30
**Scope:** The interactive `pnpm setup` wizard (`scripts/setup/` + `scripts/setup.mjs`), its tests, and the shared env/secret tooling.

---

## Architecture Overview

**18 files** under `scripts/setup/`, zero runtime dependencies (Node stdlib only — runs before `pnpm install` on a fresh clone).

```
scripts/setup.mjs              → thin wrapper (documented entry point)
scripts/setup/index.mjs        → orchestrator: flags, step loop, SIGINT, JSON mode
scripts/setup/lib/             → io.mjs, ui.mjs, prompts.mjs, env.mjs, secrets.mjs,
                                 generate-env.mjs, prereqs.mjs, market-data.mjs, run.mjs
scripts/setup/steps/           → prereqs → mode → detect-existing → market-data →
                                 config → install → launch
scripts/setup/secret-template.json  → single source of truth (shared with docker/init-secrets.sh)
```

**Design strengths:**
- ✅ Zero dependencies, pure stdlib — runs pre-install
- ✅ Injectable `io` object everywhere → fully testable (61 tests pass)
- ✅ `secret-template.json` as single source of truth, shared with `docker/init-secrets.sh`
- ✅ Idempotent env writes with `.bak` rotation, 0600 perms, secret-aware diff masking
- ✅ Non-TTY auto-answer degradation (`--yes`, `--json`, CI)
- ✅ Graceful SIGINT/ESC/Ctrl+C handling with terminal restore
- ✅ `--dry-run` never touches the filesystem
- ✅ `check-env-contract.mjs` cross-validates env/secret/compose invariants

---

## Resolved Findings

### B1 — `--fresh` wiped existing secrets (HIGH, data loss)
`steps/config.mjs` built `values` only from `missingSecrets(envPath)` (the keys absent from the file) and passed `replace: true` to `upsertEnvFile`, which drops every key not in `values`.
- On a **partial** `.env`, existing `POSTGRES_PASSWORD`/`AUTH_SECRET` were silently regenerated (previous values lost).
- On a **complete** `.env`, `missing` was empty → `values = {}` → `--fresh` was a silent no-op.

**Fix:** Fresh mode now regenerates the full canonical template set (`loadSecretTemplate()` + `resolveTemplateValue()` for every key) before the `replace: true` upsert. Verified: partial file rewrites all 19 canonical keys; complete file reports `changed: true`.

### B2 — Wizard Docker launch missing BuildKit env (MEDIUM)
`steps/launch.mjs` spawned `docker compose up -d --build` without `DOCKER_BUILDKIT=1` / `COMPOSE_DOCKER_CLI_BUILD=1`. The Dockerfiles use BuildKit-only cache mounts, so the pnpm store cache was silently ignored on the primary "launch from wizard" path.

**Fix:** Added both env vars to the spawn, matching the VM provisioner / CI build paths.

### B3 — `--mode` without a value silently fell back to interactive (LOW)
`parseFlags(['--mode'])` set `mode = null` (falsy), passing the validation and prompting interactively anyway.

**Fix:** The parser now detects a missing value (`--mode` followed by another flag or nothing), and `main()` returns exit 1 with a clear error in both text and JSON modes. Same guard added for `--market` and `--api-key`. A value that looks like a flag (`--mode --yes`) is no longer consumed as the value.

### C1 — Non-frozen install fallback could silently mutate the lockfile (LOW)
When `pnpm install --frozen-lockfile` failed, `install.mjs` retried with plain `pnpm install`, which can rewrite `pnpm-lock.yaml` on a stale clone — running silently in CI/`--yes`.

**Fix:** The fallback now requires interactive confirmation (defaulting to No) that warns "this may update pnpm-lock.yaml", and is refused entirely in non-interactive/`--yes`/dry-run mode.

### C2 — `--market` + `--yes` silently stored no key (LOW)
In non-TTY/`--yes` mode, `text()` returned `''`, so selecting a provider via `--market` stored no key.

**Fix:** Added a repeatable `--api-key=ID:VALUE` flag. Providers given an `--api-key` value are auto-selected and their value is stored without prompting, so non-interactive scripts can configure keys. `parseApiKeys()` ignores unknown providers and malformed specs.

### C3 — Docker→Simple fallback invisible to scripts (LOW)
When `--mode=docker` but Docker wasn't running, the wizard silently fell back to Simple mode, which scripts couldn't detect in `--json`.

**Fix:** The JSON result now includes `modeFallback: true` when Docker mode was requested but unavailable (set in `steps/mode.mjs` on both the flag and interactive fallback paths).

### I6 — Node prereq check looser than engines (LOW)
`MIN_NODE_MAJOR = 20` but `package.json` engines requires `>=22.13.0`.

**Fix:** Raised `MIN_NODE_MAJOR` to 22 so the wizard fails fast instead of letting Node 20/21 past only to hit a hard engines error later.

### I1 — `parseEnv` value trim was lossy (LOW)
`parseEnv` trimmed the whole line and the value, silently stripping meaningful surrounding whitespace from values on the next write.

**Fix:** Keys are still trimmed, but the value is sliced from the original raw line so leading/trailing whitespace round-trips losslessly. Verified with a PEM-fragment-style value.

---

## Deferred / By-design (documented, no change)

- **Multi-mode page read-time** — cosmetic; kept as-is.
- **`--market` + `--yes` now equivalent to explicit `--api-key`** — when no `--api-key` value is given, the provider is recorded but not stored (previously the same). This is intentional: `--yes` = accept defaults / never prompt.

---

## Test Coverage

| File | Tests | Notes |
|---|---|---|
| `setup-env.test.ts` | 13 | parse/serialize/diff/upsert, masking, backups, dry-run, replace mode |
| `setup-prompts.test.ts` | 17 | select/multiselect/confirm/text, raw-mode restore, ESC/Ctrl+C, non-TTY auto |
| `setup-pages.test.ts` | 6 | page render, cursor hide/show, comparison truncation |
| `setup-wizard-policy.test.ts` | 25 | step exports, flags, JSON output, template↔compose↔generate-env sync, `init-secrets.sh` delegation, legacy migration, fresh-mode regression |

New regression tests added for B1 (fresh on complete + partial), B3 (missing flag values, non-zero exit), and C2 (`--api-key` parsing).

---

## Verification

- ✅ 61 tests pass across all 4 setup test files
- ✅ All `.mjs` files pass `node --check`
- ✅ `check-env-contract.mjs` passes
- ✅ Wizard end-to-end: `--mode` (no value) errors; JSON includes `modeFallback`; `--api-key` captured non-interactively
- ✅ `generate-env.mjs` round-trip preserves verbatim values