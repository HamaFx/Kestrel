# Kestrel Phase 10: Open-Source Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining code, configuration, Git index, test hermeticity, and asset-hygiene tasks required to transition Kestrel (`v0.1.0`) from a private repository to a public open-source release.

**Architecture:** All public documentation and community governance files (`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `README.md`, `docs/README.md`, `docs/configuration.md`, `CHANGELOG.md`, and the Cloud Run / Cloudflare audit docs) have already been written and scrubbed. This plan covers the 5 remaining code, script, test, and repository-plumbing tasks: (1) fixing `.gitignore` rule ordering and untracking local AI-agent telemetry/checkpoint files, (2) removing hardcoded personal Vercel URLs and invalid `CODEOWNERS` handles, (3) fixing the `AI_SEMANTIC_ROUTING_ENABLED` env contract bug that causes `mastra-router.test.ts` to make live outbound Gemini API calls during unit tests, (4) removing 2.0 MB of unused candidate landing images and cleaning `knip.json` hints, and (5) pruning internal checkpoint Git refs and running the final release verification suite.

**Tech Stack:** pnpm 12.14, Turborepo 2.11, TypeScript 7 (`tsrs`), Vitest 5, Oxlint, Oxfmt, Knip 6, Git.

**Spec:** Self-contained in this plan (`docs/superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md` and `docs/roadmaps/phase10-open-source-launch-readiness.md`).

## Global Constraints

- **Protected Guardrails (`AGENTS.md`):** Never weaken `scripts/check-*.mjs`, `scripts/maintainability-baseline.json`, or `.oxlintrc.json`. Every task must pass `pnpm check:guards && pnpm knip && pnpm check:fast`.
- **Documentation Already Updated (Do Not Revert):** `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `README.md`, `docs/README.md`, `docs/configuration.md`, `CHANGELOG.md`, `docs/audit/kestrel-cloud-run-deployment-2026-11-02.md`, and `docs/audit/kestrel-cloudflare-hosting-analysis-2026-11-01.md` have already been updated for the open-source release. Keep them staged/committed alongside your work.
- **File Size & Formatting Rules:** Backend `.ts` `<= 500` LOC (`RULE-F01`), React `.tsx` `<= 450` LOC (`RULE-F02`), zero empty `catch {}` blocks (`RULE-R01`), and all edited files formatted via `pnpm format` (`oxfmt`).
- **Plain-Text Figures (`docs/figures.md`):** Any framed figure in `docs/**`, `README.md`, `CONTRIBUTING.md`, `SUPPORT.md`, or `DEPLOY.md` must use the `mdxcn` `+--- [ TITLE ] ---+` dialect and pass `pnpm check:figures`.

## Review Focus

- **`.gitignore` Last-Match-Wins Trap (`.gitignore:25` vs `.gitignore:84`):** Line 25 un-ignores `!.env.example`, but line 84 later specifies `.env*`. In Git, the last matching pattern wins, which causes Git to ignore future edits to `.env.example` or new `.env.example` files unless `--force` is passed.
- **Tracked Local Agent Telemetry (`.entire/settings.json` & `.opencode/plugins/entire.ts`):** Although `.entire/` and `.opencode/` were added to `.gitignore:101-102`, `.entire/.gitignore`, `.entire/settings.json` (`"telemetry": true`), `.opencode/plugins/entire.ts`, `.claude/settings.json`, and `.codex/hooks.json` are still tracked in the Git index (`git ls-files`) and trigger `"Entire CLI is enabled but not installed"` banners for external contributors using Claude Code or Codex.
- **`AI_SEMANTIC_ROUTING_ENABLED=0` Ignored in Production & Live Gemini Calls in Unit Tests (`packages/ai/src/routing/index.ts:44`):** `.env.example:66` and `docs/configuration.md:125` document `AI_SEMANTIC_ROUTING_ENABLED=0` (disabled by default). However, `packages/ai/src/routing/index.ts:44` evaluates `(process.env.AI_SEMANTIC_ROUTING_ENABLED ?? 'true') !== 'false'`. Because `'0' !== 'false'` is `true` and `undefined ?? 'true'` is `'true'`, semantic routing runs unconditionally whenever any API key is present—causing `packages/ai/test/mastra-router.test.ts` (which passes `GOOGLE_GENERATIVE_AI_API_KEY: 'test-key'`) to make 4 live HTTPS POST requests to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` during `pnpm test`.
- **Invalid GitHub `CODEOWNERS` Wildcard Handle (`.github/CODEOWNERS:1`):** The configured organization team does not exist on the personal repository `HamaFx/Kestrel`, causing GitHub to flag a syntax error on every pull request.
- **Hardcoded Personal Vercel URLs in Operational Scripts (`scripts/deploy-cloud.mjs:21,82,163`, `scripts/verify-production.mjs:20`, `tools/lighthouse/run.mjs:36`):** `scripts/deploy-cloud.mjs:163` silently falls back to the author's personal deployment URL when `--url` and `PRODUCTION_URL` are omitted, writing that URL into generated `.env.worker` and `.env.vercel` files for external self-hosters.

```
+------------ [ PHASE 10 LAUNCH PLAN ] ------------+
|                                                  |
| [x]  step 0: docs, security.md & code of conduct |
| [x]  task 1: .gitignore fix & untrack .entire    |
| [x]  task 2: codeowners & deploy script urls     |
| [x]  task 3: fix semantic routing env & test leak|
| [x]  task 4: prune 2mb unused jpgs & knip hints  |
| [x]  task 5: prune checkpoint refs & final gate  |
+--------------------------------------------------+
```

---

### Task 1: Fix `.gitignore` Rule Ordering & Untrack Local Agent Hook/Telemetry Configs

**Files:**

- Modify: `.gitignore:16-25,78-103`
- Modify: `.claude/settings.json`
- Modify: `.codex/hooks.json`
- Untrack (`git rm --cached`): `.entire/.gitignore`, `.entire/settings.json`, `.opencode/plugins/entire.ts`

**Interfaces:**

- Consumes: `.gitignore`, `.claude/settings.json`, `.codex/hooks.json`.
- Produces: Clean `.gitignore` where `git check-ignore -v .env.example` exits `1` (not ignored), `.entire/*` and `.opencode/*` are untracked from the index, and `.claude/settings.json` / `.codex/hooks.json` retain only the deterministic `node scripts/format-edited-files.mjs` hook without external `entire` CLI hooks.

- [ ] **Step 1: Verify the current `.gitignore` bug and tracked `.entire`/`.opencode` files**

Run: `git check-ignore -v .env.example && git ls-files .entire .opencode`
Expected: `git check-ignore` outputs `.gitignore:84:.env*	.env.example` (proving line 84 overrides `!.env.example`), and `git ls-files` lists `.entire/.gitignore`, `.entire/settings.json`, and `.opencode/plugins/entire.ts`.

- [ ] **Step 2: Clean `.gitignore` so `.env*` precedes `!.env.example` and deduplicate trailing entries**

In `.gitignore`:

1. In the `# env` block (lines 16–25), replace the list of `.env` variants with:
   ```gitignore
   # env
   .env
   .env*
   !.env.example
   ```
2. In the `# generated by apps/web/scripts/* during build` and `# AI agent local state` blocks (lines 78–103), remove the duplicate `.env*.local`, `.env*`, and duplicate `.vercel` lines so lines 78–101 read:
   ```gitignore
   # generated by apps/web/scripts/* during build
   apps/web/.build-id
   apps/web/public/sw.js
   apps/web/public/sw-precache.json
   .tmp/

   # k6 load testing
   K6_LOAD_TESTING_LOG.md
   loadtest/results/
   loadtest/node_modules/

   # local E2E shard runner output
   artifacts/
   !artifacts/licenses/
   !artifacts/licenses/dependency-licenses.json
   .tools/

   # AI agent local state (keep AGENTS.md and CLAUDE.md tracked!)
   AGENTS.override.md
   CLAUDE.local.md
   .agents/
   .entire/
   .opencode/
   ```

- [ ] **Step 3: Untrack `.entire/` and `.opencode/` from the Git index while keeping local files on disk**

```bash
git rm --cached .entire/.gitignore .entire/settings.json .opencode/plugins/entire.ts
```

- [ ] **Step 4: Strip the proprietary `entire` CLI hooks from `.claude/settings.json` and `.codex/hooks.json`, keeping only `node scripts/format-edited-files.mjs`**

Replace `.claude/settings.json` with:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/format-edited-files.mjs",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Replace `.codex/hooks.json` with:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/format-edited-files.mjs",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 5: Verify `.env.example` is no longer ignored and `.entire`/`.opencode` are untracked**

Run: `! git check-ignore -q .env.example && test -z "$(git ls-files .entire .opencode)" && echo "PASS"`
Expected: `PASS`

- [ ] **Step 6: Commit Task 1 (including the documentation updates already in the working tree)**

```bash
git add .gitignore .claude/settings.json .codex/hooks.json SECURITY.md CODE_OF_CONDUCT.md CONTRIBUTING.md SUPPORT.md README.md CHANGELOG.md docs/
git commit -m "chore(oss): add open-source governance docs, fix .gitignore ordering, and untrack local agent state"
```

---

### Task 2: Fix `.github/CODEOWNERS` & Replace Hardcoded Personal Vercel URLs in Scripts

**Files:**

- Modify: `.github/CODEOWNERS:1`
- Modify: `scripts/deploy-cloud.mjs:21,82,160-165`
- Modify: `scripts/verify-production.mjs:20`
- Modify: `tools/lighthouse/run.mjs:36`

**Interfaces:**

- Consumes: `.github/CODEOWNERS`, `scripts/deploy-cloud.mjs`, `scripts/verify-production.mjs`, `tools/lighthouse/run.mjs`.
- Produces: Valid `@HamaFx` code owner and neutral example URLs (`https://kestrel.example.com`) with no hardcoded personal deployment hosts or former team handles anywhere in tracked operational files.

- [ ] **Step 1: Update `.github/CODEOWNERS` to reference `@HamaFx`**

Replace line 1 of `.github/CODEOWNERS` (the former organization team handle) with:

```text
* @HamaFx
```

- [ ] **Step 2: Replace the personal Vercel URL in `scripts/deploy-cloud.mjs` (`lines 21, 82, 163`)**

In `scripts/deploy-cloud.mjs`:

- Change line 21 comment example to `node scripts/deploy-cloud.mjs --db="postgres://..." --url="https://kestrel.example.com"`.
- Change line 82 `--help` description to `'  --url=<https://...>         Production web URL (default: https://kestrel.example.com)'`.
- Change line 163 fallback string from the personal deployment URL to `'https://kestrel.example.com'`.

- [ ] **Step 3: Replace personal URLs in `scripts/verify-production.mjs:20` and `tools/lighthouse/run.mjs:36`**

- In `scripts/verify-production.mjs:20`, change the example `PRODUCTION_URL` from the personal host to `PRODUCTION_URL=https://kestrel.example.com pnpm verify:production`.
- In `tools/lighthouse/run.mjs:36`, change the example URL from the personal host to `https://kestrel.example.com`.

- [ ] **Step 4: Verify zero remaining personal deployment host or former team handle references in tracked files**

Run: `! git grep -n -E '(hamafx[-]ai|hama[-]fx[-]ai|@core[-]team)' && pnpm check:guards && echo "PASS"`
Expected: `PASS`

- [ ] **Step 5: Commit Task 2**

```bash
git add .github/CODEOWNERS scripts/deploy-cloud.mjs scripts/verify-production.mjs tools/lighthouse/run.mjs
git commit -m "chore(oss): set CODEOWNERS to @HamaFx and replace personal Vercel URLs in scripts"
```

---

### Task 3: Fix `AI_SEMANTIC_ROUTING_ENABLED` Contract Bug & Stop Live Gemini API Calls in `mastra-router.test.ts`

**Files:**

- Modify: `packages/ai/src/routing/index.ts:39-66`
- Modify: `packages/ai/test/mastra-router.test.ts:52-75`

**Interfaces:**

- Consumes: `ResolveModelEnv` (`packages/ai/src/models/env-factory.ts`) and `resolveSemanticRoutingConfig(userSettings, env, signal)` (`packages/ai/src/routing/index.ts:53`).
- Produces: `isSemanticRoutingEnabled(env?: ResolveModelEnv): boolean` in `packages/ai/src/routing/index.ts` that honors `env.AI_SEMANTIC_ROUTING_ENABLED` and `process.env.AI_SEMANTIC_ROUTING_ENABLED` (defaulting to `false` to match `.env.example:66` and `docs/configuration.md:125`, returning `true` only when the value is `true`, `'1'`, or `'true'`), plus hermetic unit tests in `packages/ai/test/mastra-router.test.ts` with zero outbound network requests to `generativelanguage.googleapis.com`.

- [ ] **Step 1: Add a test in `packages/ai/test/mastra-router.test.ts` asserting that `resolveSemanticRoutingConfig` is disabled by default (`AI_SEMANTIC_ROUTING_ENABLED=0` or unset) and enabled only when `AI_SEMANTIC_ROUTING_ENABLED='1'` or `'true'`**

In `packages/ai/test/mastra-router.test.ts`, import `resolveSemanticRoutingConfig` from `'../src/routing'` and add:

```ts
it('disables semantic LLM routing by default or when AI_SEMANTIC_ROUTING_ENABLED is 0, and enables it when set to 1', () => {
  expect(resolveSemanticRoutingConfig(settings, env)).toBeNull();
  expect(
    resolveSemanticRoutingConfig(settings, {
      ...env,
      AI_SEMANTIC_ROUTING_ENABLED: '0',
    } as never),
  ).toBeNull();
  expect(
    resolveSemanticRoutingConfig(settings, {
      ...env,
      AI_SEMANTIC_ROUTING_ENABLED: '1',
    } as never),
  ).not.toBeNull();
});
```

- [ ] **Step 2: Run `mastra-router.test.ts` to observe the failure and the 4 live `generativelanguage.googleapis.com` network errors on `stderr`**

Run: `pnpm --filter @kestrel/ai test test/mastra-router.test.ts`
Expected: FAIL (`resolveSemanticRoutingConfig(settings, env)` returns an object instead of `null`, and `stderr` prints `APICallError: API key not valid` from `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`).

- [ ] **Step 3: Implement `isSemanticRoutingEnabled(env?: ResolveModelEnv): boolean` in `packages/ai/src/routing/index.ts:39-66`**

In `packages/ai/src/routing/index.ts`, replace `const SEMANTIC_ROUTING_ENABLED = (process.env.AI_SEMANTIC_ROUTING_ENABLED ?? 'true') !== 'false';` (`lines 39-58`) with:

```ts
/**
 * Semantic routing is opt-in (`AI_SEMANTIC_ROUTING_ENABLED=0` by default in
 * `.env.example` and `docs/configuration.md`). Accepts boolean `true` or
 * `'1'` / `'true'` on either the caller's `env` bag or `process.env`.
 */
export function isSemanticRoutingEnabled(env?: ResolveModelEnv): boolean {
  const raw =
    (env as { AI_SEMANTIC_ROUTING_ENABLED?: unknown } | undefined)?.AI_SEMANTIC_ROUTING_ENABLED ??
    process.env.AI_SEMANTIC_ROUTING_ENABLED;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return false;
}
```

And in `resolveSemanticRoutingConfig` (`line 58`), replace `if (!SEMANTIC_ROUTING_ENABLED) return null;` with:

```ts
if (!isSemanticRoutingEnabled(env)) return null;
```

- [ ] **Step 4: Re-run `mastra-router.test.ts` and the full `@kestrel/ai` test suite**

Run: `pnpm --filter @kestrel/ai test test/mastra-router.test.ts && pnpm --filter @kestrel/ai test`
Expected: PASS in `<50ms` for `mastra-router.test.ts` (down from `~1,593ms`) with **zero** `Upstream LLM API error` or `generativelanguage.googleapis.com` requests on `stderr`.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/ai/src/routing/index.ts packages/ai/test/mastra-router.test.ts
git commit -m "fix(ai): honor AI_SEMANTIC_ROUTING_ENABLED=0 default and stop live Gemini calls in router tests"
```

---

### Task 4: Remove 2.0 MB of Unused Landing Candidate JPGs & Clean Redundant `knip.json` Hints

**Files:**

- Delete: `apps/web/public/landing/candidates/desks-council-four-strategists.jpg` (764 KB)
- Delete: `apps/web/public/landing/candidates/hero-horus-neoclassical-cleaned.jpg` (632 KB)
- Delete: `apps/web/public/landing/candidates/desks-spartan-aegis-isolated.jpg` (628 KB)
- Modify: `knip.json`

**Interfaces:**

- Consumes: `apps/web/public/landing/candidates/*` and `knip.json`.
- Produces: 2.0 MB smaller Git working tree and `pnpm knip --no-progress` exiting `0` with `0` configuration hints.

- [ ] **Step 1: Verify that nothing in the repository references `public/landing/candidates/` and remove the 3 unused JPG files**

```bash
! git grep -q "candidates/"
git rm -rf apps/web/public/landing/candidates
```

- [ ] **Step 2: Prune redundant `entry` and `ignoreDependencies` entries in `knip.json` while keeping `scripts/check-knip-config.mjs` green**

Run `pnpm knip --no-progress` to inspect the 42 `Configuration hints` (entries that duplicate `package.json` `main`/`exports` fields, plus `@vitest/coverage-v8` in root `ignoreDependencies` and `drizzle-orm` in `loadtest.ignoreDependencies`). Remove only the entries that `knip` flags as redundant AND that `scripts/check-knip-config.mjs` does not require.

- [ ] **Step 3: Verify `check-knip-config.mjs` and `pnpm knip` both pass**

Run: `node scripts/check-knip-config.mjs && pnpm knip --no-progress`
Expected: `check-knip-config.mjs` exits `0` and `pnpm knip --no-progress` exits `0`.

- [ ] **Step 4: Commit Task 4**

```bash
git add apps/web/public/landing knip.json
git commit -m "chore(repo): remove 2MB of unused landing candidate JPGs and clean knip config hints"
```

---

### Task 5: Prune Internal Checkpoint Git Refs & Run Final Open-Source Release Verification Gate

**Files:**

- Git refs cleanup: `refs/heads/entire-checkpoint`, `refs/remotes/origin/entire-checkpoint`, `refs/entire/*`, `refs/agent/*`

**Interfaces:**

- Consumes: All tasks 1–4.
- Produces: Clean Git ref tree and 100% passing build, guard, lint, format, typecheck, and test verification across all 15 workspace tasks.

- [ ] **Step 1: Delete local and remote `entire-checkpoint` / `refs/entire/*` / `refs/agent/*` refs**

```bash
git branch -D entire-checkpoint 2>/dev/null || true
git update-ref -d refs/remotes/origin/entire-checkpoint 2>/dev/null || true
for ref in $(git for-each-ref --format='%(refname)' refs/entire/ refs/agent/); do
  git update-ref -d "$ref"
done
# If pushing to origin:
# git push origin --delete entire-checkpoint 2>/dev/null || true
```

- [ ] **Step 2: Format all modified files and run the full verification suite**

```bash
pnpm format
pnpm format:check
pnpm check:guards
pnpm lint
pnpm typecheck
pnpm knip --no-progress
pnpm test
pnpm build:packages
```

Expected:

- `pnpm check:guards`: `✓ All 8 static guards passed` (including `✓ 28 documented figure(s) align`).
- `pnpm lint` & `pnpm format:check`: `0` errors.
- `pnpm typecheck`: `15 successful, 15 total`.
- `pnpm knip --no-progress`: `0` unused files/exports/dependencies.
- `pnpm test`: `14 successful, 14 total` with zero outbound LLM API errors.
- `pnpm build:packages`: `12 successful, 12 total`.
