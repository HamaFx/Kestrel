# Phase 1: Guardrails, Hooks & RLS Scope Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate silent security/guardrail bypasses (`.githooks/pre-commit` ignoring secrets in source files, `@kestrel/ai` bypassing tenant RLS via `container.resolve(DB)`, and 7 Next.js RSCs/Server Actions calling `@kestrel/ai` DB functions without `withUserTenant`), expand automated RLS scope enforcement tests, and clean up all lint warnings.

**Architecture:**

1. `.githooks/pre-commit` scans all staged text files for secret patterns (`sk-...`, `AIza...`, `BEGIN PRIVATE KEY`, etc.), excluding only `.env.example` template files and known test fixtures.
2. In `@kestrel/ai`, `getDb()` (`packages/ai/src/runtime/db.ts`) is the **single** database accessor because it enforces `hasTenantDbScope()` / `hasAdminDbScope()` when `KESTREL_ENABLE_RLS=1`. No module outside `packages/ai/src/runtime/db.ts` may call `container.resolve(DB)` directly.
3. Every Next.js Server Component (`page.tsx`, `layout.tsx`, server child components) and Server Action (`actions.ts`, `_actions/*.ts`) that invokes tenant-scoped database queries—whether directly through `@kestrel/db` or indirectly through `@kestrel/ai` (`listAlerts`, `listEntries`, `computeStats`, `getLatestBriefing`, `computeUsage`, `deleteAllThreads`)—must execute inside `withUserTenantRead(userId, ...)` or `withUserTenant(userId, ...)`.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle ORM, Vitest, ESLint, Bash Git Hooks.

---

### Task 1: Fix `.githooks/pre-commit` Secret Scanner to Check All Staged Files

**Files:**

- Modify: `.githooks/pre-commit:73-96`
- Create: `scripts/test-pre-commit-secret-scan.mjs`

- [ ] **Step 1: Write a verification test script for secret scanning (`scripts/test-pre-commit-secret-scan.mjs`)**

Create `scripts/test-pre-commit-secret-scan.mjs` to verify that `.githooks/pre-commit` catches secrets in `.ts`, `.json`, and `.env` files while allowing `.env.example`:

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const hookPath = resolve(import.meta.dirname, '..', '.githooks', 'pre-commit');
const hookSource = readFileSync(hookPath, 'utf8');

if (hookSource.includes('if [[ "$file" == *.env* ]]')) {
  console.error(
    'FAIL: .githooks/pre-commit still restricts secret reporting to *.env* files only.',
  );
  process.exit(1);
}

if (!hookSource.includes('if [[ "$file" != *".example"* ]]; then')) {
  console.error('FAIL: .githooks/pre-commit must check all non-.example staged files for secrets.');
  process.exit(1);
}

console.log('PASS: .githooks/pre-commit scans all non-example staged files for secrets.');
```

- [ ] **Step 2: Run the verification script to confirm it fails on the current hook**

Run: `node scripts/test-pre-commit-secret-scan.mjs`
Expected: `FAIL: .githooks/pre-commit still restricts secret reporting to *.env* files only.` (exit code 1)

- [ ] **Step 3: Fix `.githooks/pre-commit` lines 73–96**

In `.githooks/pre-commit`, replace lines 73–96 so that every staged file matching the file list (`*.ts`, `*.tsx`, `*.js`, `*.mjs`, `*.json`, `*.yml`, `*.yaml`, `*.env*`, `*.md`, `*.sh`) except `*.example*` and `*.test.ts` is checked against `$SECRET_PATTERNS`:

```bash
# 2. Check for potential secrets in staged files
SECRET_PATTERNS=(
  'PRIVATE KEY'
  'sk-[a-zA-Z0-9]{20,}'
  'ghp_[a-zA-Z0-9]{36}'
  'xox[baprs]-[a-zA-Z0-9-]+'
  'AIza[0-9A-Za-z_-]{35}'
)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|mjs|json|yml|yaml|env.*|md|sh)$' || true)

if [ -n "$STAGED_FILES" ]; then
  for pattern in "${SECRET_PATTERNS[@]}"; do
    for file in $STAGED_FILES; do
      if [[ "$file" != *".example"* ]] && [[ "$file" != *.test.ts ]]; then
        if git diff --cached "$file" | grep -v '^---' | grep -v '^+++' | grep -E "^\+.*$pattern" > /dev/null 2>&1; then
          echo "❌ Potential secret matching '$pattern' found in staged file: $file"
          exit 1
        fi
      fi
    done
  done
fi
```

- [ ] **Step 4: Run the verification script and delete the temporary test script**

Run: `node scripts/test-pre-commit-secret-scan.mjs && rm scripts/test-pre-commit-secret-scan.mjs`
Expected: `PASS: .githooks/pre-commit scans all non-example staged files for secrets.`

- [ ] **Step 5: Commit**

```bash
git add .githooks/pre-commit
git commit -m "fix(hooks): scan all staged source files for secrets in pre-commit hook"
```

---

### Task 2: Fix `container.resolve(DB)` RLS Bypasses in `@kestrel/ai`

**Why:** `packages/ai/src/runtime/db.ts` defines `getDb()`, which enforces `hasTenantDbScope()` / `hasAdminDbScope()` when `KESTREL_ENABLE_RLS=1` and returns the scoped Drizzle client. However, three modules inside `packages/ai/src/` call `container.resolve(DB)` directly (`opinion-persistence.ts:87,163,199`, `agent-builder.ts:272`, and `mastra-v2/agents/canonical/setup.ts:275`), which returns the cached root unscoped pool connection and bypasses RLS scope verification!

**Files:**

- Modify: `packages/ai/src/committee/opinion-persistence.ts`
- Modify: `packages/ai/src/plugins/agent-builder.ts`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/setup.ts`
- Test: `packages/ai/test/rls-db-access-guard.test.ts`

- [ ] **Step 1: Write a structural test (`packages/ai/test/rls-db-access-guard.test.ts`) forbidding `container.resolve(DB)` outside `runtime/db.ts`**

Create `packages/ai/test/rls-db-access-guard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (full.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('@kestrel/ai database access guard', () => {
  it('never calls container.resolve(DB) outside src/runtime/db.ts', () => {
    const srcRoot = join(__dirname, '..', 'src');
    const offenders: string[] = [];
    for (const file of walkTsFiles(srcRoot)) {
      const rel = relative(srcRoot, file).replace(/\\/g, '/');
      if (rel === 'runtime/db.ts') continue;
      const content = readFileSync(file, 'utf8');
      if (content.includes('container.resolve(DB)')) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it catches the 3 offending files**

Run: `pnpm --filter @kestrel/ai exec vitest run test/rls-db-access-guard.test.ts`
Expected: FAIL with `['committee/opinion-persistence.ts', 'mastra-v2/agents/canonical/setup.ts', 'plugins/agent-builder.ts']`.

- [ ] **Step 3: Replace `container.resolve(DB)` with `getDb()` in all 3 files**

1. In `packages/ai/src/committee/opinion-persistence.ts`:
   - Replace `import { container } from '@kestrel/shared';` and `import { DB } from '../runtime/tokens';` with `import { getDb } from '../runtime/db';`.
   - At lines 87, 163, and 199, replace `const db = container.resolve(DB);` with `const db = getDb();`.
2. In `packages/ai/src/plugins/agent-builder.ts`:
   - Replace `import { container, createLogger } from '@kestrel/shared';` with `import { createLogger } from '@kestrel/shared';`.
   - Replace `import { DB } from '../runtime/tokens';` with `import { getDb } from '../runtime/db';`.
   - At line 272, replace `db: container.resolve(DB),` with `db: getDb(),`.
3. In `packages/ai/src/mastra-v2/agents/canonical/setup.ts`:
   - Remove `container` from `@kestrel/shared` imports and `DB` from `'../../../runtime/tokens'` imports.
   - Add `import { getDb } from '../../../runtime/db';`.
   - At line 275, replace `db: container.resolve(DB),` with `db: getDb(),`.

- [ ] **Step 4: Re-run the test and typecheck**

Run: `pnpm --filter @kestrel/ai exec vitest run test/rls-db-access-guard.test.ts && pnpm --filter @kestrel/ai typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/committee/opinion-persistence.ts packages/ai/src/plugins/agent-builder.ts packages/ai/src/mastra-v2/agents/canonical/setup.ts packages/ai/test/rls-db-access-guard.test.ts
git commit -m "fix(ai): route all DB access through RLS-aware getDb() instead of container.resolve(DB)"
```

---

### Task 3: Wrap Unscoped Next.js RSCs and Server Actions in `withUserTenant` / `withUserTenantRead`

**Why:** When `DATABASE_URL` points to `kestrel_app` (`NOBYPASSRLS`) and `KESTREL_ENABLE_RLS=1`, any call to `getDb()` outside `withUserTenant` / `withUserTenantRead` throws `"getDb() called without an active tenant or admin DB scope"` (or returns 0 rows in Postgres). Seven Next.js files currently call `@kestrel/ai` or `@kestrel/db` queries without opening a tenant scope:

1. `apps/web/src/app/(app)/dashboard/page.tsx:47-53` (`listAlerts`, `listEntries`, `getLatestBriefing`)
2. `apps/web/src/app/(app)/journal/page.tsx:37-40` (`listEntries`, `computeStats`)
3. `apps/web/src/app/(app)/settings/_components/usage-glance.tsx:27` (`computeUsage`)
4. `apps/web/src/app/(app)/journal/actions.ts` (`createJournalEntryAction`, `updateJournalEntryAction`, `deleteJournalEntryAction`)
5. `apps/web/src/app/(app)/alerts/actions.ts` (`createAlertAction`, `toggleAlertAction`, `deleteAlertAction`)
6. `apps/web/src/app/(app)/settings/_actions/data-clear.ts` (`clearChatHistoryAction`)
7. `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts:213` (`regenerateBackupCodesAction` calling `createAuditLog` outside `withUserTenant`)

Additionally, `apps/web/src/lib/services/plugin-manage/store-metadata.ts:120-123` defines a duplicate `withUserTenant` helper instead of importing `withUserTenant` from `@kestrel/db`.

**Files:**

- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(app)/journal/page.tsx`
- Modify: `apps/web/src/app/(app)/settings/_components/usage-glance.tsx`
- Modify: `apps/web/src/app/(app)/journal/actions.ts`
- Modify: `apps/web/src/app/(app)/alerts/actions.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/data-clear.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts`
- Modify: `apps/web/src/lib/services/plugin-manage/store-metadata.ts`
- Modify: `apps/web/test/rsc-tenant-scope.test.ts`

- [ ] **Step 1: Expand `apps/web/test/rsc-tenant-scope.test.ts` to check RSCs and Server Actions that call `@kestrel/ai` or `@/lib/services/*` tenant DB helpers**

Update `apps/web/test/rsc-tenant-scope.test.ts` to also assert that:

- `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/journal/page.tsx`, and `src/app/(app)/settings/_components/usage-glance.tsx` use `withUserTenantRead` or `withUserTenant`.
- `src/app/(app)/journal/actions.ts`, `src/app/(app)/alerts/actions.ts`, and `src/app/(app)/settings/_actions/data-clear.ts` wrap tenant mutations in `withUserTenant`.

- [ ] **Step 2: Run `rsc-tenant-scope.test.ts` to verify it fails on the 6 unscoped files**

Run: `pnpm --filter @kestrel/web exec vitest run test/rsc-tenant-scope.test.ts`
Expected: FAIL listing `dashboard/page.tsx`, `journal/page.tsx`, `usage-glance.tsx`, `journal/actions.ts`, `alerts/actions.ts`, and `data-clear.ts`.

- [ ] **Step 3: Scope the 3 RSC files with `withUserTenantRead`**

1. In `apps/web/src/app/(app)/dashboard/page.tsx`:
   - Import `{ withUserTenantRead } from '@kestrel/db';`.
   - Wrap the `Promise.all([listAlerts(...), listEntries(...), getLatestBriefing(...)])` call inside `await withUserTenantRead(userId, () => Promise.all([...]))`.
2. In `apps/web/src/app/(app)/journal/page.tsx`:
   - Import `{ withUserTenantRead } from '@kestrel/db';`.
   - Wrap `Promise.all([listEntries(userId, { limit: 100 }), computeStats(userId, 'all')])` inside `await withUserTenantRead(userId, () => Promise.all([...]))`.
3. In `apps/web/src/app/(app)/settings/_components/usage-glance.tsx`:
   - Import `{ withUserTenantRead } from '@kestrel/db';`.
   - Wrap `computeUsage(userId, '30d')` inside `await withUserTenantRead(userId, () => computeUsage(userId, '30d'))`.

- [ ] **Step 4: Scope the 4 Server Action files with `withUserTenant` and remove duplicate `withUserTenant` in `store-metadata.ts`**

1. In `apps/web/src/app/(app)/journal/actions.ts`:
   - Import `{ withUserTenant } from '@kestrel/db';`.
   - Wrap `createEntry(userId, parsed.data)`, `updateEntry(userId, id, parsed.data)`, and `deleteEntry(userId, id)` in `await withUserTenant(userId, () => ...)`.
2. In `apps/web/src/app/(app)/alerts/actions.ts`:
   - Import `{ withUserTenant } from '@kestrel/db';`.
   - Wrap `createAlert(userId, parsed.data)`, `toggleAlert(userId, id, active)`, and `deleteAlert(userId, id)` in `await withUserTenant(userId, () => ...)`.
3. In `apps/web/src/app/(app)/settings/_actions/data-clear.ts`:
   - Import `{ withUserTenant } from '@kestrel/db';`.
   - Wrap `deleteAllThreads(userId)` + `createAuditLog(...)` inside `await withUserTenant(userId, async () => { ... })`.
4. In `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts`:
   - Move `await createAuditLog({ userId, action: 'user.2fa_backup_regenerated', ipAddress: ip });` inside the `withUserTenant(userId, async (db) => { ... })` callback at line 206.
5. In `apps/web/src/lib/services/plugin-manage/store-metadata.ts`:
   - Import `withUserTenant` from `@kestrel/db` and delete the local `function withUserTenant` at lines 120–123.

- [ ] **Step 5: Run `rsc-tenant-scope.test.ts` and typecheck**

Run: `pnpm --filter @kestrel/web exec vitest run test/rsc-tenant-scope.test.ts && pnpm --filter @kestrel/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard/page.tsx apps/web/src/app/\(app\)/journal/page.tsx apps/web/src/app/\(app\)/settings/_components/usage-glance.tsx apps/web/src/app/\(app\)/journal/actions.ts apps/web/src/app/\(app\)/alerts/actions.ts apps/web/src/app/\(app\)/settings/_actions/data-clear.ts apps/web/src/app/\(app\)/settings/_actions/security-two-factor.ts apps/web/src/lib/services/plugin-manage/store-metadata.ts apps/web/test/rsc-tenant-scope.test.ts
git commit -m "fix(web): wrap unscoped RSCs and server actions in withUserTenant/withUserTenantRead"
```

---

### Task 4: Remove Stale ESLint Directives in `@kestrel/worker`, Remove Unused-Vars Disables in `@kestrel/ai`, and Lint `apps/web/test`

**Files:**

- Modify: `apps/worker/test/briefings.test.ts`
- Modify: `apps/worker/test/cot-job.test.ts`
- Modify: `apps/worker/test/fred-actuals.test.ts`
- Modify: `apps/worker/test/snapshots-job.test.ts`
- Modify: `apps/worker/test/weekly-review.test.ts`
- Modify: `apps/worker/test/embedding-backfill.test.ts`
- Modify: `packages/ai/src/tools/get-intermarket-resonance.ts`
- Modify: `packages/ai/src/tools/get-system-diagnostics.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Remove unused `// eslint-disable-next-line no-restricted-imports` comments in `apps/worker/test/*.test.ts`**

Remove the stale `// eslint-disable-next-line no-restricted-imports` line in:

- `apps/worker/test/briefings.test.ts:15`
- `apps/worker/test/cot-job.test.ts:15`
- `apps/worker/test/fred-actuals.test.ts:16`
- `apps/worker/test/snapshots-job.test.ts:15`
- `apps/worker/test/weekly-review.test.ts:15`
- `apps/worker/test/embedding-backfill.test.ts:15`

- [ ] **Step 2: Remove file-level `/* eslint-disable @typescript-eslint/no-unused-vars */` in `packages/ai/src/tools/get-intermarket-resonance.ts` and `packages/ai/src/tools/get-system-diagnostics.ts`**

1. In `packages/ai/src/tools/get-intermarket-resonance.ts`:
   - Delete line 17 (`/* eslint-disable @typescript-eslint/no-unused-vars */`).
   - Remove the unused `IntermarketResonanceInputSchema` import from `@kestrel/shared`.
2. In `packages/ai/src/tools/get-system-diagnostics.ts`:
   - Delete line 17 (`/* eslint-disable @typescript-eslint/no-unused-vars */`).
   - Remove the unused `SystemDiagnosticsInputSchema` import from `@kestrel/shared`.
   - In `executeGetSystemDiagnostics(_ctx: ToolContext, _input: SystemDiagnosticsInput = {})`, prefix `_input` or wire `forceProbe` / `verbose` cleanly so no unused-vars suppression is needed.

- [ ] **Step 3: Update `apps/web/package.json` to lint `src` and `test`**

In `apps/web/package.json`, change:

```json
"lint": "eslint src test"
```

Fix any unused-var warnings surfaced in `apps/web/test`.

- [ ] **Step 4: Run full workspace `lint` and `typecheck`**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS with **0 warnings** and **0 errors** across all 16 workspace packages.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/test/ packages/ai/src/tools/get-intermarket-resonance.ts packages/ai/src/tools/get-system-diagnostics.ts apps/web/package.json
git commit -m "chore(lint): remove stale eslint-disable directives and include apps/web/test in lint"
```
