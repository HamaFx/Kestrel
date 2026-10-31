# Phase 4 Implementation Plan: Unified Training Dataset Export, 5-Dimension Jev Eval Gate & CI Eval Harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the AI training and evaluation loop end to end: make the Admin "Export Now" button (`POST /api/admin/eval-datasets/export`) and the nightly worker job (`dataset-export.ts`) enrich feedback training pairs with real tool calls from `chat_tool_telemetry` and write `dataset.jsonl`, `manifest.json`, and `jev-rlcd.jsonl` (`Decision 3A`), upgrade `recordsToGateObserved()` (`packages/ai/src/mastra-v2/evals/gate.ts`) to unpack all 5 Jev rubric scores from `kestrel-jev-rubric` (`faithfulness`, `answerRelevancy`, `noHallucination`, `unbiasedScenarios`, `nonToxic`), and fix `eval-gate.ts` + `.github/workflows/evals-nightly.yml` with a committed baseline file (`packages/ai/src/eval/eval-baseline.json`).

**Architecture:** Enrich `listReviewedTrainingPairs` (`packages/db/src/queries/training-dataset.ts`) with a correlated array subquery over `chat_tool_telemetry` (and assistant message `parts`) so `ReviewedTrainingPair.toolNames` carries the actual tools used in each turn. Update `POST /api/admin/eval-datasets/export` to write `dataset.jsonl`, `manifest.json`, and `jev-rlcd.jsonl` to `DATASETS_DIR/<version>/` (best-effort on serverless/read-only filesystems, mandatory when writable) and publish to Langfuse when configured. In `packages/ai/src/mastra-v2/evals/gate.ts`, parse the JSON `reason` emitted by `createJevRubricScorer` so every rubric dimension is gated. Commit `packages/ai/src/eval/eval-baseline.json` and update `packages/ai/scripts/eval-gate.ts` to point to it.

**Tech Stack:** TypeScript, Drizzle ORM, Mastra Evals, Node.js `fs/promises`, GitHub Actions, Vitest.

**Spec:** `docs/audits/09_Kestrel_Logging_Debugging_Telemetry_Jev_And_Training_Master_Audit.md` (Decision 3A, Phase 4)

## Global Constraints

- **Privacy & PII Refusal Guard:** Both `dataset.jsonl` (`kestrel.eval-record.v1`) and `jev-rlcd.jsonl` (`kestrel.jev-rlcd.v1`) must continue running `redactString` and `findSensitiveTrainingContent` (`email`, `phone`, `credential`), refusing any record where sensitive content survives redaction.
- **Serverless-Safe File Writes on Web Export:** In `POST /api/admin/eval-datasets/export`, writing `dataset.jsonl`, `manifest.json`, and `jev-rlcd.jsonl` to `process.env.DATASETS_DIR ?? '/tmp/kestrel-datasets'` must be best-effort if the host filesystem is read-only, while always returning `rlcdRecordCount` and registering the content-addressed manifest in `eval_datasets`.
- **5-Dimension Jev Rubric Gate:** A `kestrel-jev-rubric` score record passes in `recordsToGateObserved()` only when `faithfulness >= minOverallPassRate` AND, when `reason` parses as a JSON object with Jev rubric fields, `answerRelevancy >= 0.5`, `noHallucination >= 0.8`, `unbiasedScenarios >= 0.8`, and `nonToxic >= 0.9`.

## Review Focus

1. `ReviewedTrainingPair.toolNames` in `packages/db/src/queries/training-dataset.ts`: use a correlated SQL subquery `COALESCE((SELECT array_agg(DISTINCT t.tool ORDER BY t.tool) FROM chat_tool_telemetry t WHERE t.thread_id = ${assistant.threadId} AND t.tenant_id = ${feedback.tenantId} AND (t.message_id = ${assistant.id} OR t.trace_id = ${feedback.traceId}) AND t.ok = true), ARRAY[]::text[])` so both `dataset.jsonl` and `jev-rlcd.jsonl` record the exact tools invoked during the reviewed turn.
2. `parseJevRubricReason` in `packages/ai/src/mastra-v2/evals/gate.ts`: if `record.scorerId === 'kestrel-jev-rubric'` and `record.reason` is valid JSON containing `{ faithfulness, answerRelevancy, noHallucination, unbiasedScenarios, nonToxic }`, enforce all five thresholds and surface any failing dimension in `assertions` so the gate failure message names which rubric failed (e.g. `jev-rubric failed: noHallucination=0.40 < 0.80`).
3. `DEFAULT_BASELINE_PATH` in `packages/ai/scripts/eval-gate.ts`: change from the non-existent `../../../docs/archive/audit-v2/eval-baseline.json` to `../src/eval/eval-baseline.json` and commit a valid initial `packages/ai/src/eval/eval-baseline.json` (`schemaVersion: "kestrel.eval-baseline.v1"`).
4. `apps/worker/src/jobs/dataset-export.ts` and `apps/web/src/app/api/admin/eval-datasets/export/route.ts`: map `pair.toolNames ?? []` into `toolCalls: (pair.toolNames ?? []).map((name) => ({ name, args: {} }))` when constructing `PromptResult[]` from `listReviewedTrainingPairs` so `buildTrainingRecords` and `buildJevRlcdTrainingRecords` populate `toolNames` and `questions.tools_used`.
5. `RLCD_EXPORT_ENABLED` default: enable `jev-rlcd.jsonl` generation by default (`(process.env.RLCD_EXPORT_ENABLED ?? 'true') !== 'false'`) in both `dataset-export.ts` and `/api/admin/eval-datasets/export/route.ts` (per `Decision 3A`) while skipping any individual record that trips `findSensitiveTrainingContent` so one user prompt containing an email address never aborts the entire batch.

---

### Task 1: Enrich Feedback Training Pairs with Tool Calls & Upgrade Manual + Nightly Dataset Exports (`Decision 3A`)

**Files:**
- Modify: `packages/db/src/queries/training-dataset.ts:12-90`
- Modify: `packages/ai/src/eval/training-export.ts:148-215`
- Modify: `apps/worker/src/jobs/dataset-export.ts:150-255`
- Modify: `apps/web/src/app/api/admin/eval-datasets/export/route.ts:35-145`
- Test: `apps/worker/test/dataset-export.test.ts`
- Test: `packages/ai/test/regime-memory-and-jev-export.test.ts`

**Interfaces:**
- Modifies `ReviewedTrainingPair` in `packages/db/src/queries/training-dataset.ts`:
  - Adds `toolNames?: string[]`
- Updates `POST /api/admin/eval-datasets/export` response JSON to include `rlcdRecordCount: number` and `outputDir: string | null`

- [x] **Step 1: Write the failing tests in `apps/worker/test/dataset-export.test.ts`**

```typescript
it('populates toolCalls from ReviewedTrainingPair.toolNames and writes jev-rlcd.jsonl by default', async () => {
  // Mock listReviewedTrainingPairs returning [{ messageId: 'm1', prompt: 'XAUUSD levels?', assistantText: 'Support at 2740.', rating: 'positive', reviewerLabel: 'pass', toolNames: ['get_price', 'get_market_structure'], ... }]
  // Run runDatasetExport(ctx) without setting RLCD_EXPORT_ENABLED
  // Assert buildJevRlcdTrainingRecords received toolCalls: [{ name: 'get_price' }, { name: 'get_market_structure' }]
  // and that jev-rlcd.jsonl was written to outDir.
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test test/dataset-export.test.ts`
Expected: FAIL (`toolCalls` was hardcoded to `[]` and `rlcd` was skipped unless `RLCD_EXPORT_ENABLED=true`)

- [x] **Step 3: Update `training-dataset.ts`, `dataset-export.ts`, and `/api/admin/eval-datasets/export/route.ts`**
  - In `packages/db/src/queries/training-dataset.ts`:
    - Add `toolNames?: string[];` to `ReviewedTrainingPair` and select `toolNames` via correlated subquery over `chat_tool_telemetry`.
  - In `apps/worker/src/jobs/dataset-export.ts`:
    - Map `toolCalls: (pair.toolNames ?? []).map((name) => ({ name, args: {} }))` when building `feedbackResults`.
    - Change `const rlcdEnabled = (process.env.RLCD_EXPORT_ENABLED ?? 'true') !== 'false';` so `jev-rlcd.jsonl` is written by default unless explicitly disabled (`RLCD_EXPORT_ENABLED=false`).
  - In `apps/web/src/app/api/admin/eval-datasets/export/route.ts`:
    - Map `toolCalls: (pair.toolNames ?? []).map((name) => ({ name, args: {} }))`.
    - Build `rlcd = buildJevRlcdTrainingRecords(approved, { datasetVersion: version, annotations })`.
    - Best-effort write `dataset.jsonl`, `manifest.json`, and `jev-rlcd.jsonl` to `join(process.env.DATASETS_DIR ?? '/tmp/kestrel-datasets', version)` and best-effort call `publishTrainingDatasetToLangfuse(assembled, { datasetName: 'kestrel-training', description: `Governed eval training records — ${version}` })`.
    - Include `rlcdRecords: rlcd.length` in `provenance` and return `{ dataset: row, droppedNeedsReview: results.length - approved.length, rlcdRecordCount: rlcd.length }`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test test/dataset-export.test.ts && pnpm --filter @kestrel/ai test test/regime-memory-and-jev-export.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/db/src/queries/training-dataset.ts apps/worker/src/jobs/dataset-export.ts apps/web/src/app/api/admin/eval-datasets/export/route.ts apps/worker/test/dataset-export.test.ts
git commit -m "feat(db,worker,web): include tool names in feedback exports and unify Admin/worker RLCD export"
```

---

### Task 2: Unpack & Gate All 5 Jev Rubric Dimensions in `recordsToGateObserved()`

**Files:**
- Modify: `packages/ai/src/mastra-v2/evals/gate.ts:55-155`
- Test: `packages/ai/test/jev-verifier-and-scorers.test.ts`

**Interfaces:**
- Produces:
  - `JEV_RUBRIC_THRESHOLDS = { answerRelevancy: 0.5, noHallucination: 0.8, unbiasedScenarios: 0.8, nonToxic: 0.9 } as const` in `packages/ai/src/mastra-v2/evals/gate.ts`
  - `checkJevRubricRecord(record: ScoreRecord, minFaithfulness: number): { ok: boolean; failures: string[] }` in `packages/ai/src/mastra-v2/evals/gate.ts`

- [x] **Step 1: Write the failing test in `packages/ai/test/jev-verifier-and-scorers.test.ts`**

```typescript
import { recordsToGateObserved } from '../src/mastra-v2/evals/gate';

it('fails recordsToGateObserved when kestrel-jev-rubric has high faithfulness but low noHallucination or nonToxic in reason JSON', () => {
  const gate = recordsToGateObserved([
    {
      id: 's1',
      scorerId: 'kestrel-jev-rubric',
      runId: 'run-1',
      entityId: 'agent-1',
      score: 0.98, // faithfulness is high
      reason: JSON.stringify({
        faithfulness: 0.98,
        answerRelevancy: 0.9,
        noHallucination: 0.35, // hallucinated!
        unbiasedScenarios: 0.95,
        nonToxic: 0.99,
        provider: 'opencode-free',
      }),
      createdAt: new Date(),
      source: 'LIVE',
    },
  ]);

  expect(gate.passed).toBe(false);
  expect(gate.observed.overallPassRate).toBe(0);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test test/jev-verifier-and-scorers.test.ts`
Expected: FAIL (`gate.passed` was `true` because `recordsToGateObserved` only checked `record.score >= 0.95`)

- [x] **Step 3: Implement `checkJevRubricRecord` in `packages/ai/src/mastra-v2/evals/gate.ts`**
  - Export `JEV_RUBRIC_THRESHOLDS = { answerRelevancy: 0.5, noHallucination: 0.8, unbiasedScenarios: 0.8, nonToxic: 0.9 } as const`.
  - Implement `export function checkJevRubricRecord(record: ScoreRecord, minFaithfulness: number): { ok: boolean; failures: string[] }`:
    - Check `record.score >= minFaithfulness`.
    - If `record.reason` starts with `{`, parse JSON and check `answerRelevancy >= JEV_RUBRIC_THRESHOLDS.answerRelevancy`, `noHallucination >= JEV_RUBRIC_THRESHOLDS.noHallucination`, `unbiasedScenarios >= JEV_RUBRIC_THRESHOLDS.unbiasedScenarios`, and `nonToxic >= JEV_RUBRIC_THRESHOLDS.nonToxic`.
  - In `recordsToGateObserved`, when `record.scorerId === 'kestrel-jev-rubric'`, delegate `pass(record)` to `checkJevRubricRecord(record, effectiveThresholds.minOverallPassRate).ok` and attach any rubric failures to `assertions` on the synthesized case.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/ai test test/jev-verifier-and-scorers.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/mastra-v2/evals/gate.ts packages/ai/test/jev-verifier-and-scorers.test.ts
git commit -m "fix(ai): gate all five Jev rubric dimensions in recordsToGateObserved"
```

---

### Task 3: Commit Tracked `eval-baseline.json` & Fix `eval-gate.ts` Baseline Path

**Files:**
- Create: `packages/ai/src/eval/eval-baseline.json`
- Modify: `packages/ai/scripts/eval-gate.ts:45-55`
- Test: `packages/ai/test/eval-baseline.test.ts`

**Interfaces:**
- Creates `packages/ai/src/eval/eval-baseline.json` conforming to `EvalBaselineArtifact` (`schemaVersion: 'kestrel.eval-baseline.v1'`)
- Updates `DEFAULT_BASELINE_PATH` in `packages/ai/scripts/eval-gate.ts` to `fileURLToPath(new URL('../src/eval/eval-baseline.json', import.meta.url))`

- [x] **Step 1: Write the failing test in `packages/ai/test/eval-baseline.test.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEvalBaseline } from '../src/eval/baseline';

it('ships a valid committed eval-baseline.json artifact in packages/ai/src/eval/', () => {
  const path = fileURLToPath(new URL('../src/eval/eval-baseline.json', import.meta.url));
  const raw = readFileSync(path, 'utf8');
  const parsed = parseEvalBaseline(raw);
  expect(parsed).not.toBeNull();
  expect(parsed?.schemaVersion).toBe('kestrel.eval-baseline.v1');
  expect(parsed?.observed.overallPassRate).toBeGreaterThanOrEqual(0.95);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test test/eval-baseline.test.ts`
Expected: FAIL (`ENOENT: no such file or directory, open '.../packages/ai/src/eval/eval-baseline.json'`)

- [x] **Step 3: Create `packages/ai/src/eval/eval-baseline.json` and update `packages/ai/scripts/eval-gate.ts`**
  - Create `packages/ai/src/eval/eval-baseline.json`:
    ```json
    {
      "schemaVersion": "kestrel.eval-baseline.v1",
      "generatedAt": "2026-10-29T00:00:00.000Z",
      "runCount": 50,
      "recordCount": 100,
      "observed": {
        "overallPassRate": 0.98,
        "averageCitationScore": 0.95
      }
    }
    ```
  - In `packages/ai/scripts/eval-gate.ts`, update `DEFAULT_BASELINE_PATH` to `fileURLToPath(new URL('../src/eval/eval-baseline.json', import.meta.url))` and update the comment referencing the path.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/ai test test/eval-baseline.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/eval/eval-baseline.json packages/ai/scripts/eval-gate.ts packages/ai/test/eval-baseline.test.ts
git commit -m "fix(ai): add tracked eval-baseline.json and fix eval-gate default path"
```
