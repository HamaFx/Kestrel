# Phase 8: Audit Remainder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the audit findings that Phases 5–7 intentionally did not schedule, validate the migrations against real PostgreSQL, and leave the repository in clean, committed state.

**Architecture:** Four focused changes (comparison mode parity, deterministic `convene_committee`, Telegram position reads through the paper-trading query API, dead ESLint removal), followed by a validation and commit pass. No new subsystems.

**Tech Stack:** Next.js 16, Mastra, Drizzle/PostgreSQL, Vitest, pnpm 12, oxlint/oxfmt.

**Spec:** `docs/audit/kestrel-full-architecture-and-product-audit-2026-11-04.md` (§3.1.A defect 2, §3.1.B defect 3, §3.2 P2 coupling, §3.5 dead ESLint packages).

> **Status:** Complete (2026-11-04). Tasks 0–4 implemented and committed individually; Task 5 verified with a real-Postgres migration run. Final evidence: `check:guards` 7/7, `knip` 0 findings, full `turbo run typecheck test` 29/29, `format:check` clean, `build:packages` 12/12, `test:postgres-rls` 24/24 against a fresh pgvector database (migrations `0125` + `0126` applied). E2E was not run: this sandbox has no app database wired into `.env`; an operator with a configured DB should run `pnpm test:e2e:local -- --shards=1`.

## Global Constraints

- Run `pnpm check:guards`, `pnpm knip`, and `pnpm check:fast` after every task. All three must pass.
- Never weaken a guard to silence a failure. Fix the code; only update a guard when the checked contract itself changed.
- Backend `.ts` ≤ 500 LOC, React `.tsx` ≤ 450 LOC; package `src/` roots ≤ 10 loose files.
- No pass-through re-export shims; update callers directly.
- Commits: one baseline commit for Phases 5–7, then one commit per task below.

## Review Focus

- **Full comparison cost:** four desks per symbol plus fusion. The turn must report progress per desk and fail closed if any desk fails (existing strict gate).
- **`convene_committee` downgrade:** the card must say `Heuristic review (no LLM)` for every invocation now. It must never imply model review.
- **Telegram RLS:** `listOpenPositions` must run inside the webhook's tenant scope; an unscoped call silently returns zero rows.
- **ESLint removal:** `pnpm knip` and `check:knip-config` must still validate every remaining package export.
- **Migrations:** `0125` and `0126` must apply cleanly to a fresh database and remain ordered in the journal.

---

### Task 0: Commit the completed Phase 5–7 work

**Files:** all currently modified/untracked files.

- [x] **Step 1: Review the working tree**

Run: `git status --short`
Expected: only files from Phases 5–7 plus the four roadmap/audit documents.

- [x] **Step 2: Run the gate trio**

Run: `pnpm check:guards && pnpm knip && pnpm check:fast`
Expected: 7/7 guards, no knip findings, all turbo tasks successful.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: execute phases 5-7 of the 2026-11-04 audit remediation"
```

---

### Task 1: Honour `full` mode in multi-symbol comparisons

**Files:**

- Modify: `apps/web/src/lib/services/mastra/chat/mastra-execution.ts:101-118`
- Modify: `packages/ai/src/committee/comparison-workflow/workflow.ts:55-70`
- Test: `packages/ai/test/committee.test.ts`

**Interfaces:**

- Produces: `comparisonDeskNamesForMode(mode: MastraAnalysisMode, riskDeskEnabled: boolean): readonly MastraSpecialistName[]` exported from `packages/ai/src/committee/comparison-workflow/workflow.ts`.
- Consumes: `SPECIALISTS_BY_MODE` from `../types`.

- [x] **Step 1: Write the failing test**

Append to `packages/ai/test/committee.test.ts`:

```ts
import { comparisonDeskNamesForMode } from '../src/committee/comparison-workflow/workflow';

describe('comparison desk roster', () => {
  it('runs every mode specialist for a full comparison', () => {
    expect(comparisonDeskNamesForMode('full', false)).toEqual([
      'technical',
      'fundamental',
      'risk',
      'sentiment',
    ]);
    expect(comparisonDeskNamesForMode('full', true)).toEqual([
      'technical',
      'fundamental',
      'risk',
      'sentiment',
    ]);
  });

  it('keeps single comparisons lean, with risk behind the rollout flag', () => {
    expect(comparisonDeskNamesForMode('single', false)).toEqual(['technical']);
    expect(comparisonDeskNamesForMode('single', true)).toEqual(['technical', 'risk']);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kestrel/ai test -- committee`
Expected: FAIL with `comparisonDeskNamesForMode is not a function` / missing export.

- [x] **Step 3: Implement the roster helper**

In `workflow.ts`, export:

```ts
export function comparisonDeskNamesForMode(
  mode: MastraAnalysisMode,
  riskDeskEnabled: boolean,
): readonly MastraSpecialistName[] {
  if (mode === 'full') return SPECIALISTS_BY_MODE.full;
  return riskDeskEnabled ? ['technical', 'risk'] : ['technical'];
}
```

Import `SPECIALISTS_BY_MODE` from `../types`, then replace the inline roster with:

```ts
const comparisonDeskNames = comparisonDeskNamesForMode(
  mode,
  readFeatureFlag('ENABLE_COMPARISON_RISK_DESK'),
);
```

- [x] **Step 4: Pass the planned mode from the web runner**

In `mastra-execution.ts`, change the comparison branch's `mode: 'single'` to `mode: input.plan.mode` and update the comment to say full comparisons keep the selected mode.

- [x] **Step 5: Run the tests and the gate trio**

Run: `pnpm --filter @kestrel/ai test -- committee && pnpm check:guards && pnpm knip && pnpm check:fast`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/mastra/chat/mastra-execution.ts packages/ai/src/committee/comparison-workflow/workflow.ts packages/ai/test/committee.test.ts
git commit -m "fix(ai): honour full mode in multi-symbol comparisons"
```

---

### Task 2: Make `convene_committee` a deterministic scorecard

**Files:**

- Delete: `packages/ai/src/tools/convene-committee/committee-run.ts`
- Modify: `packages/ai/src/tools/convene-committee/index.ts`
- Modify: `packages/ai/src/tools/convene-committee/verdicts.ts`
- Test: existing `packages/ai/test` suite + typecheck

**Interfaces:**

- `conveneCommitteeTool` keeps its input/output schema and `ToolIOMap` declaration.
- `buildPacketGroundedFallbackVerdicts(args)` remains the only verdict builder.

- [x] **Step 1: Remove the nested run from the tool**

In `index.ts`:

- Delete the `runLlmCommittee` import.
- Delete the `let verdicts`, `let consensusText`, `let llmVerdictsUsed` mutable state and the `if (ctx)` block.
- Keep `const ctx = maybeGetToolContext()` for `enrichPacketForUser`.
- Use `const verdicts = buildPacketGroundedFallbackVerdicts({...})` and always take the `Heuristic review (no LLM) — ` branch for `consensusText`.
- Update the file header and tool description: the tool returns the instant packet-grounded 4-desk scorecard; the model-reviewed committee is the `full` chat mode.

In `verdicts.ts`:

- Delete `opinionToVerdict` and the `MastraModeOpinion` import; update the header comment.

- [x] **Step 2: Delete the dead module**

Run: `git rm packages/ai/src/tools/convene-committee/committee-run.ts`

- [x] **Step 3: Verify no references remain**

Run: `rg "runLlmCommittee|opinionToVerdict" packages apps`
Expected: no matches.

- [x] **Step 4: Run the gate trio**

Run: `pnpm check:guards && pnpm knip && pnpm check:fast`
Expected: PASS. Knip must not report the removed module or its exports.

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/tools/convene-committee
git commit -m "refactor(ai): make convene_committee a deterministic packet-grounded scorecard"
```

---

### Task 3: Read Telegram paper positions through the paper-trading query API

**Files:**

- Modify: `plugins/paper-trading/package.json` (add `./db/queries` export)
- Modify: `plugins/telegram-bot/src/bot/commands/shared.ts`

**Interfaces:**

- Consumes: `listOpenPositions(userId: string): Promise<PaperPositionRow[]>` from `@kestrel/plugin-paper-trading/db/queries`.

- [x] **Step 1: Export the query barrel**

Add to `plugins/paper-trading/package.json` exports:

```json
"./db/queries": {
  "@kestrel/source": "./src/db/queries/index.ts",
  "types": "./dist/db/queries/index.d.ts",
  "import": "./dist/db/queries/index.js"
}
```

- [x] **Step 2: Replace the raw table read**

In `plugins/telegram-bot/src/bot/commands/shared.ts`:

- Import `listOpenPositions` from `@kestrel/plugin-paper-trading/db/queries`.
- Replace the `withTenantDb(...)` + drizzle query with `const rows = await listOpenPositions(ctx.userId); return rows.slice(0, 20).map(...)`.
- Remove now-unused `withTenantDb`, `paperPositions`, and `and/desc/eq` imports.
- Keep the `TelegramPaperPosition` shape and map `quantity`, `entryPrice`, `unrealizedPnl` with `Number(...)` if the row types are strings.

- [x] **Step 3: Run the plugin tests and gate trio**

Run: `pnpm --filter @kestrel/plugin-telegram-bot test && pnpm check:guards && pnpm knip && pnpm check:fast`
Expected: PASS, and the Telegram bundle no longer imports drizzle or plugin tables.

- [x] **Step 4: Commit**

```bash
git add plugins/paper-trading/package.json plugins/telegram-bot/src/bot/commands/shared.ts pnpm-lock.yaml
git commit -m "refactor(telegram): read paper positions through the plugin query API"
```

---

### Task 4: Remove the dead ESLint package and scaffold files

**Files:**

- Delete: all `eslint.config.js` files (`apps/web`, `apps/worker`, `packages/*`, `plugins/*`)
- Delete: `packages/config/eslint/`
- Modify: `packages/config/package.json`
- Modify: `knip.json` (remove the `packages/config` workspace override)

- [x] **Step 1: Delete the configs**

```bash
git rm apps/web/eslint.config.js apps/worker/eslint.config.js \
  packages/ai/eslint.config.js packages/data/eslint.config.js packages/db/eslint.config.js \
  packages/indicators/eslint.config.js packages/plugin-sdk/eslint.config.js \
  packages/shared/eslint.config.js packages/test-utils/eslint.config.js \
  plugins/eslint.config.js plugins/backtesting/eslint.config.js \
  plugins/paper-trading/eslint.config.js plugins/telegram-bot/eslint.config.js
git rm -r packages/config/eslint
```

- [x] **Step 2: Prune `packages/config/package.json`**

Remove `"eslint"` from `files`, the `"./eslint"` export, and the dependencies `@eslint/js`, `eslint`, `eslint-plugin-react-hooks`, `globals`, `typescript-eslint`.

- [x] **Step 3: Update knip**

Remove the entire `"packages/config": { ... }` workspace block from `knip.json`.

- [x] **Step 4: Reinstall and verify**

Run: `pnpm install && pnpm check:guards && pnpm knip && pnpm check:fast`
Expected: PASS. If knip reports `@kestrel/config` as unused, add it to the root `ignoreDependencies` only after confirming every workspace still extends its tsconfig (that is the legitimate use).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead ESLint configuration and dependencies"
```

---

### Task 5: Validate migrations and ship

**Files:** none (verification only).

- [x] **Step 1: Run the real-Postgres RLS suite**

Run: `pnpm test:postgres-rls`
Expected: PASS. This spins a fresh pgvector container and applies the full migration set including `0125` and `0126`.

- [x] **Step 2: Run every gate one final time**

Run: `pnpm format:check && pnpm check:guards && pnpm knip && pnpm check:fast && pnpm build:packages`
Expected: all pass.

- [x] **Step 3: Record E2E status**

Run: `pnpm test:e2e:local -- --shards=1` only when a configured app database and dev server are available. Otherwise record in the final report that E2E was not run in this sandbox (no app DB), with the exact command an operator should run.

- [x] **Step 4: Commit any formatting fallout**

```bash
git add -A
git commit -m "chore: phase 8 validation"
```

---

## Deliberately out of scope (owner decisions)

- **`WORKER_ENABLE_TICK_STREAM` default:** turning on SignalR/Binance streaming by default is an infrastructure/product decision, not a code defect. Keep `0`, document the env switch.
- **Component recombination:** 158 mechanically split components remain. The caps are relaxed; recombining is optional polish and should be done per-screen with visual review.
- **Service facades:** `chat-ai.ts`, `settings/domain.ts`, `journal/coach.ts` are now documented as deliberate domain boundaries in `apps/web/AGENTS.md`.
- **Dual confirmation architectures:** unifying Mastra suspend/resume with plugin inline cards is a Phase-9 architecture project. The unreachable plugin gate is retained as defense-in-depth and is pinned by `mastra-mutation-policy.test.ts`.
