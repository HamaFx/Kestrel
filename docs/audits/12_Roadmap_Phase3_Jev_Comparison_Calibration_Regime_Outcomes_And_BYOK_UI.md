# Phase 3 Implementation Plan: Jev Multi-Symbol Calibration, 4h Regime Outcome Memory & BYOK Settings UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining gaps in Kestrel's **Jev System One** and memory architecture: calibrate every symbol in multi-symbol comparison workflows (`comparison-workflow`) with `scorePacketWithJev` and `enrichPacketForUser`, add a dedicated `positioning_bias` question to `scorePacketWithJev` for the `sentiment` desk, update `memory_embeddings` (`kind: 'market_regime'`) with realized 4-hour price outcomes (`OUTCOME_4H`, `MFE`, `MAE`) inside `opinion-calibration.ts`, prevent Settings BYOK save/import actions from wiping `opencode`/`liquid`/`typesafe`/`finnhub` keys, and add the **Jev Decision Model Keys** card to Settings → API Keys (`Decision 4A`).

**Architecture:** In `packages/ai/src/committee/comparison-workflow/collect-step.ts` and `specialist-steps.ts`, run `enrichPacketForUser` and `scorePacketWithJev` per symbol and store a `jevCalibrationsBySymbol` map on `requestContext` so each compared symbol's desk pass blends its own calibrated Jev anchor. Extend `scorePacketWithJev` (`jev-packet-scorer.ts`) with a `positioning_bias` choice question used by `deskJevConfidence(calibration, 'sentiment')`. In `apps/worker/src/jobs/opinion-calibration.ts`, compute 4-hour `resolution4h`, `mfePct`, and `maePct` from the already-loaded `candles_1m` slice and update the matching `memory_embeddings` (`kind = 'market_regime'`) row. In `apps/web/src/app/(app)/settings/`, preserve non-`PROVIDER_IDS` keys on `ByokPayload` and add a client component `JevDecisionKeysCard` + server action `updateJevApiKeysAction`.

**Tech Stack:** TypeScript, Mastra v2, Drizzle ORM, Next.js Server Actions, React 19, Vitest.

**Spec:** `docs/audits/09_Kestrel_Logging_Debugging_Telemetry_Jev_And_Training_Master_Audit.md` (Decision 4A, Phase 3)

## Global Constraints

- **Untrusted Prose Security Invariant:** `buildDeterministicNumericPacketState` (`jev-packet-scorer.ts`) must never include `newsHeadlines` or free-form external prose when scoring `positioning_bias`; use only deterministic numeric COT positioning (`dealerNet`, `assetNet`, `leveragedNet`, `otherNet`) and macro series.
- **BYOK Preservation Invariant:** `updateApiKeysAction` (`_actions-api-keys-save.ts`) and `importKeysAction` (`_actions-api-keys-transfer.ts`) must preserve `opencode`, `liquid`, `typesafe`, and `finnhub` keys from `oldDecrypted` (and allow importing them from encrypted backup payloads) so saving chat LLM keys never erases decision-model or market-data keys.
- **Zero-Key Graceful Degradation:** If no Jev key is configured, `scorePacketWithJev` returns `null` and both single-symbol and multi-symbol workflows continue with uncalibrated LLM confidence.

## Review Focus

1. `scorePacketWithJev` backward compatibility in `packages/ai/src/committee/jev-packet-scorer.ts`: adding `positioning_bias` increases the Jev batch from 4 to 5 questions; update `JevPacketCalibration` (`positioningBias?: JevChoiceAnswer`) and `deskJevConfidence(calibration, 'sentiment')` to return `calibration.positioningBias?.confidence ?? calibration.calibratedConfidence` so existing test fixtures that construct a 4-field `JevPacketCalibration` object still work without breaking.
2. Multi-symbol `jevCalibrationsBySymbol` in `packages/ai/src/committee/comparison-workflow/`: `collect-step.ts` must store `Record<string, JevPacketCalibration>` under `requestContext.set('jevCalibrationsBySymbol', calibrationsBySymbol)` (and set `jevCalibration` for the primary symbol), and `runSpecialistGeneration` (`specialist-runner/runner.ts`) must check `requestContext.get('jevCalibrationsBySymbol')?.[args.symbol]` before falling back to `requestContext.get('jevCalibration')`.
3. 4-hour regime outcome backfill in `apps/worker/src/jobs/opinion-calibration.ts`: compute `mfePct = ((maxHigh4h - entry) / entry) * 100` and `maePct = ((minLow4h - entry) / entry) * 100` (using candle closes/highs/lows in `[entryMs, entryMs + HORIZON_MS]`), and update `memory_embeddings.text` and `memory_embeddings.meta` where `user_id = row.userId AND tenant_id = row.tenantId AND kind = 'market_regime' AND symbol = symbol AND occurred_at BETWEEN row.createdAt - 5m AND row.createdAt + 5m` (once per `(userId, messageId)`).
4. `updateApiKeysAction` in `apps/web/src/app/(app)/settings/_actions-api-keys-save.ts`: read `oldDecrypted` BEFORE building the final `keys: ByokPayload` to persist, and carry forward `finnhub`, `opencode`, `liquid`, and `typesafe` from `oldDecrypted` unless explicitly overridden in `formData`.
5. `JEV_PROVIDER_IDS = ['opencode', 'liquid', 'typesafe'] as const`: export from `@kestrel/shared/byok` (`packages/shared/src/byok.ts`) so both `importKeysAction` and `updateJevApiKeysAction` validate against a single canonical tuple without adding them to chat `PROVIDER_IDS`.

---

### Task 1: Add `positioning_bias` to `scorePacketWithJev` & Calibrate Multi-Symbol Comparison Workflows

**Files:**
- Modify: `packages/ai/src/committee/jev-packet-scorer.ts:55-260`
- Modify: `packages/ai/src/committee/comparison-workflow/collect-step.ts:28-95`
- Modify: `packages/ai/src/committee/specialist-runner/runner.ts:75-100`
- Test: `packages/ai/test/committee-jev-packet-scorer.test.ts`

**Interfaces:**
- Modifies `JevPacketCalibration` in `packages/ai/src/committee/jev-packet-scorer.ts`:
  - Adds optional `positioningBias?: JevChoiceAnswer`
  - Updates `deskJevConfidence(calibration, 'sentiment')` to return `calibration.positioningBias?.confidence ?? calibration.calibratedConfidence`
- Updates `createComparisonCollectStep` in `packages/ai/src/committee/comparison-workflow/collect-step.ts` to call `enrichPacketForUser` and `scorePacketWithJev` for each healthy symbol packet and store `jevCalibrationsBySymbol` on `requestContext`.

- [x] **Step 1: Write the failing tests in `packages/ai/test/committee-jev-packet-scorer.test.ts`**

```typescript
it('includes positioning_bias in scorePacketWithJev and uses it for the sentiment desk confidence', async () => {
  // Mock fetchImpl returning technical_bias, fundamental_bias, positioning_bias,
  // volatility_regime, and setup_clarity.
  // Assert deskJevConfidence(calibration, 'sentiment') equals positioning_bias.confidence.
});

it('calibrates each healthy symbol packet in createComparisonCollectStep and stores jevCalibrationsBySymbol', async () => {
  // Run comparison collect step for ['XAUUSD', 'EURUSD'] with a mock Jev endpoint
  // and assert requestContext.get('jevCalibrationsBySymbol') has entries for both symbols.
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test test/committee-jev-packet-scorer.test.ts`
Expected: FAIL (`positioning_bias` not requested; `createComparisonCollectStep` does not set `jevCalibrationsBySymbol`)

- [x] **Step 3: Implement `positioning_bias` in `jev-packet-scorer.ts` and per-symbol calibration in `comparison-workflow/collect-step.ts` + `specialist-runner/runner.ts`**
  - In `packages/ai/src/committee/jev-packet-scorer.ts`:
    - Add `positioning_bias` (`type: 'choice'`, criteria `{ bullish: 'COT positioning and macro flows favor upside', bearish: 'COT positioning and macro flows favor downside', neutral: 'Positioning is balanced, crowded, or unavailable' }`) to `questions` in `scorePacketWithJev`.
    - Add `positioningBias?: JevChoiceAnswer` to `JevPacketCalibration`, include `positioning_bias.confidence` in the 5-way `calibratedConfidence` mean, and update `deskJevConfidence` for `'sentiment'` to `return calibration.positioningBias?.confidence ?? calibration.calibratedConfidence;`.
    - Add `- Positioning bias: ${renderDistribution(calibration.positioningBias.probabilities)}` to `jevCalibrationBlock` when `calibration.positioningBias` is present.
  - In `packages/ai/src/committee/comparison-workflow/collect-step.ts`:
    - For each `[entrySymbol, rawPacket]` in `packets`, if `userId` is present on `requestContext`, enrich via `await enrichPacketForUser(rawPacket, userId, signal)`.
    - For each healthy `[entrySymbol, packet]`, call `scorePacketWithJev(packet, { settings: deps.jevSettings ?? null, env: deps.jevEnv ?? null, signal, ledger: generationLedger, ledgerEntryId: `${runId}:packet-calibration:${entrySymbol}` })` in `Promise.all`, and store the resulting map on `requestContext` via `.set?.('jevCalibrationsBySymbol', calibrationsBySymbol)`.
  - In `packages/ai/src/committee/specialist-runner/runner.ts`:
    - Resolve `const bySymbol = requestContext.get('jevCalibrationsBySymbol') as Record<string, JevPacketCalibration> | undefined;` and `const jevCalibration = (args.symbol ? bySymbol?.[args.symbol] : undefined) ?? (requestContext.get('jevCalibration') as JevPacketCalibration | undefined);`, and copy `jevCalibration` onto `packetContext` so the specialist prompt receives the symbol-specific anchor.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/ai test test/committee-jev-packet-scorer.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/committee/jev-packet-scorer.ts packages/ai/src/committee/comparison-workflow/collect-step.ts packages/ai/src/committee/specialist-runner/runner.ts packages/ai/test/committee-jev-packet-scorer.test.ts
git commit -m "feat(ai): add positioning_bias Jev anchor and calibrate multi-symbol comparisons"
```

---

### Task 2: Backfill Realized 4-Hour Outcomes into `market_regime` Memory in `opinion-calibration.ts`

**Files:**
- Modify: `apps/worker/src/jobs/opinion-calibration.ts:70-290`
- Test: `apps/worker/test/opinion-calibration.test.ts`

**Interfaces:**
- Produces:
  - `computeRegimeOutcomeFromCandles(candles: readonly CandlePoint[], entryMs: number, exitMs: number): { resolution4h: 'bullish' | 'bearish' | 'range'; mfePct: number; maePct: number } | null` in `apps/worker/src/jobs/opinion-calibration.ts`
  - Updates `memory_embeddings` (`kind = 'market_regime'`) rows matching `(userId, tenantId, symbol)` around `row.createdAt` with the realized `OUTCOME_4H` line and `meta.outcome` JSONB.

- [x] **Step 1: Write the failing test in `apps/worker/test/opinion-calibration.test.ts`**

```typescript
import { computeRegimeOutcomeFromCandles } from '../src/jobs/opinion-calibration';

it('computes 4-hour resolution4h, mfePct, and maePct from candles_1m and patches market_regime memory', () => {
  const t0 = 1_700_000_000_000;
  const h4 = t0 + 4 * 60 * 60 * 1000;
  const candles = [
    { t: t0, c: 2000 },
    { t: t0 + 60_000, c: 2020 }, // +1.0% MFE
    { t: t0 + 120_000, c: 1995 }, // -0.25% MAE
    { t: h4, c: 2015 }, // +0.75% close > 0.3% neutral band -> bullish
  ];
  const outcome = computeRegimeOutcomeFromCandles(candles, t0, h4);
  expect(outcome).toEqual({
    resolution4h: 'bullish',
    mfePct: 1,
    maePct: -0.25,
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test test/opinion-calibration.test.ts`
Expected: FAIL (`computeRegimeOutcomeFromCandles is not exported`)

- [x] **Step 3: Implement `computeRegimeOutcomeFromCandles` and `patchRegimeMemoryOutcome` in `apps/worker/src/jobs/opinion-calibration.ts`**
  - Export `computeRegimeOutcomeFromCandles(candles: readonly CandlePoint[], entryMs: number, exitMs: number)`:
    - Find `entry = closeAtOrBefore(candles, entryMs)` and `exit = closeAtOrBefore(candles, exitMs)`. If either is null or `entry <= 0`, return `null`.
    - Slice window candles with `c.t >= entryMs && c.t <= exitMs` (including `entry` and `exit` in the min/max).
    - Compute `maxClose = Math.max(entry, exit, ...windowCandles.map(c => c.c))` and `minClose = Math.min(entry, exit, ...windowCandles.map(c => c.c))`.
    - Compute `mfePct = Number((((maxClose - entry) / entry) * 100).toFixed(2))` and `maePct = Number((((minClose - entry) / entry) * 100).toFixed(2))`.
    - Determine `resolution4h`: if `Math.abs(exit - entry) <= entry * 0.003` → `'range'`, else if `exit > entry` → `'bullish'`, else `'bearish'`.
  - Add `async function patchRegimeMemoryOutcome(db: DbClient, row: OpinionRow, symbol: string, outcome: NonNullable<ReturnType<typeof computeRegimeOutcomeFromCandles>>): Promise<void>` that updates `schema.memoryEmbeddings` where `userId = row.userId`, `tenantId = row.tenantId`, `kind = 'market_regime'`, `symbol = symbol`, and `occurredAt` within $\pm 10$ minutes of `row.createdAt` (appending `\nOUTCOME_4H=${outcome.resolution4h}(MFE=${outcome.mfePct >= 0 ? '+' : ''}${outcome.mfePct}%,MAE=${outcome.maePct}%)` if `text` does not already contain `OUTCOME_4H`, and merging `{ outcome }` into `meta`), deduplicated per `row.messageId` in the batch.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/worker test test/opinion-calibration.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/opinion-calibration.ts apps/worker/test/opinion-calibration.test.ts
git commit -m "feat(worker): backfill realized 4h outcomes into market_regime embeddings"
```

---

### Task 3: Preserve Non-Chat BYOK Keys & Add Jev Decision Model Keys UI Card (`Decision 4A`)

**Files:**
- Modify: `packages/shared/src/byok.ts:34-90`
- Modify: `apps/web/src/app/(app)/settings/_actions-api-keys-save.ts:40-155`
- Modify: `apps/web/src/app/(app)/settings/_actions-api-keys-transfer.ts:120-165`
- Modify: `apps/web/src/app/(app)/settings/actions.ts`
- Create: `apps/web/src/app/(app)/settings/api-keys/_components/jev-decision-keys-card.tsx`
- Modify: `apps/web/src/app/(app)/settings/api-keys/page.tsx:140-200`
- Test: `apps/web/test/settings-actions.test.ts`

**Interfaces:**
- Produces:
  - `JEV_PROVIDER_IDS = ['opencode', 'liquid', 'typesafe'] as const` and `type JevByokProviderId = (typeof JEV_PROVIDER_IDS)[number]` in `packages/shared/src/byok.ts`
  - `updateJevApiKeysAction(formData: FormData): Promise<SaveKeysResult>` in `apps/web/src/app/(app)/settings/_actions-api-keys-save.ts` (re-exported from `apps/web/src/app/(app)/settings/actions.ts`)
  - `<JevDecisionKeysCard initialKeys={{ opencode: boolean; liquid: boolean; typesafe: boolean }} />` in `apps/web/src/app/(app)/settings/api-keys/_components/jev-decision-keys-card.tsx`

- [x] **Step 1: Write the failing test in `apps/web/test/settings-actions.test.ts`**

```typescript
it('preserves opencode, liquid, typesafe, and finnhub keys when updateApiKeysAction saves chat provider keys', async () => {
  // Seed oldSettings.aiApiKeys with encryptByok({ google: 'old-g', opencode: 'oc-free-1', liquid: 'lq-1', finnhub: 'fh-1' })
  // Call updateApiKeysAction with formData containing google='new-g'
  // Decrypt the saved aiApiKeys and assert opencode === 'oc-free-1', liquid === 'lq-1', finnhub === 'fh-1', and google === 'new-g'.
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/web test test/settings-actions.test.ts`
Expected: FAIL (`opencode`, `liquid`, and `finnhub` were wiped when `updateApiKeysAction` constructed a fresh `ByokPayload`)

- [x] **Step 3: Preserve non-chat keys in `_actions-api-keys-save.ts` & `_actions-api-keys-transfer.ts`, and add `JevDecisionKeysCard`**
  - In `packages/shared/src/byok.ts` (and re-export in `packages/shared/src/encryption.ts` + `packages/shared/src/index.ts`):
    - Export `export const JEV_PROVIDER_IDS = ['opencode', 'liquid', 'typesafe'] as const; export type JevByokProviderId = (typeof JEV_PROVIDER_IDS)[number];`.
  - In `apps/web/src/app/(app)/settings/_actions-api-keys-save.ts`:
    - Load `oldDecrypted` first; preserve `finnhub`, `opencode`, `liquid`, and `typesafe` from `oldDecrypted` on `keys` so saving chat LLM keys never deletes them.
    - Add `export async function updateJevApiKeysAction(_prevState: SaveKeysResult, formData: FormData): Promise<SaveKeysResult>` that updates `opencode`, `liquid`, and `typesafe` on `ByokPayload` (leaving chat `PROVIDER_IDS` and `finnhub` untouched; an empty string clears that Jev key while `***KEEP***` or untouched fields preserve existing values, or standard password input with current value prefilled like `ApiKeyCard`).
  - In `apps/web/src/app/(app)/settings/_actions-api-keys-transfer.ts`:
    - Allow `...PROVIDER_IDS, ...JEV_PROVIDER_IDS, 'finnhub'` in `importKeysAction`.
  - Create `apps/web/src/app/(app)/settings/api-keys/_components/jev-decision-keys-card.tsx` rendering inputs for:
    - **OpenCode Console (`jev-1.13-free`)** — Free `$0.00 / $0.00` System One endpoint (`https://opencode.ai`)
    - **Liquid AI (`d1-ultra` / `d1.1`)** — Tiered decision models (`$0.02–$0.042 / 1M` input, `$0` output)
    - **TypeSafe AI (`jev-latest`)** — Direct `/v1/systemone` endpoint (`$0.042 / 1M` input, `$0` output)
  - Render `<JevDecisionKeysCard decrypted={decrypted} />` in `apps/web/src/app/(app)/settings/api-keys/page.tsx` right above `<MarketDataConfig />`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/web test test/settings-actions.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/byok.ts packages/shared/src/encryption.ts packages/shared/src/index.ts apps/web/src/app/\(app\)/settings/ apps/web/test/settings-actions.test.ts
git commit -m "feat(web,shared): preserve Jev/market BYOK keys on save and add Jev Decision Model Keys UI"
```
