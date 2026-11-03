# Phase 2: Pure 4-Desk Multi-Agent Committee, JEV Removal & Direct SSE Streaming

> **Goal:** Simplify Kestrel's AI engine (`@kestrel/ai`) to its purest, fastest, highest-quality multi-agent architecture **without any quality loss**:
>
> 1. Rip out the external JEV (`/v1/systemone`) decision-model layer and Brier opinion calibration.
> 2. Remove the redundant Critique and Debate LLM waves that cause specialist groupthink and add 8 extra LLM calls.
> 3. Enforce a **strict 4-of-4 Hard Gate** where all 4 specialist desks (`technical`, `fundamental`, `risk`, `sentiment`) run in parallel with their dedicated domain tools and playbooks, and **all 4 must pass deterministic verification** before the Conflict-Aware Fusion Synthesizer answers.
> 4. Stream `full` committee runs **directly over SSE** in `/api/chat` (`runMastraModeChatStream`) and delete the complex `full_analysis_queue` database polling system.

---

> **Status:** Complete (2026-11-03). Depends on Phase 1.

## Overview of Tasks

- [x] **Task 2.1:** Delete `packages/ai/src/jev/` and all JEV hooks across routing, RAG, guardrails, packet scoring, and web settings UI.
- [x] **Task 2.2:** Simplify the Committee Workflow into the **Pure 4-Desk Pipeline** (`collect-packet` → `4 parallel specialists` → `4/4 hard verify gate` → `conflict-resolving fusion`) and delete Critique, Debate, and Brier calibration.
- [x] **Task 2.3:** Stream `full` Committee runs directly over SSE (`runMastraModeChatStream`) and delete `full_analysis_queue`, `/api/chat/analysis-jobs/*`, and the worker `multi-agent-analysis` job.

---

## Task 2.1: Remove the JEV (`/v1/systemone`) Subsystem End-to-End

### Why

JEV was added as an experiment to score packets (`jev-packet-scorer.ts`), gate deliberation (`jev-consensus-gate.ts`), prune tools (`tool-pruner.ts`), rerank RAG (`rag-quarantine.ts`), and classify turns (`turn-router.ts`) via external TypeSafe / Liquid AI / OpenCode endpoints. In practice:

- It overrides 70% of each specialist LLM's confidence score with an external model's guess (`JEV_CONFIDENCE_BLEND_WEIGHT = 0.7`).
- It adds up to 3 extra network calls per turn and requires extra API keys (`OPENCODE_API_KEY`, `TYPESAFE_API_KEY`, `LIQUID_API_KEY`) that open-source self-hosters do not have.
- Kestrel's deterministic calculators and primary BYOK LLMs already handle routing, tool selection, and numeric verification natively.

### Files to Delete

- `packages/ai/src/jev/` (entire directory: `client.ts`, `types.ts`, `calibration.ts`, `resolve-endpoint.ts`, `turn-router.ts`, `tool-pruner.ts`, `guardrail-processor.ts`, `rag-quarantine.ts`, `semantic-verifier.ts`, `index.ts`)
- `packages/ai/src/barrels/jev.ts`
- `packages/ai/src/committee/jev-packet-scorer.ts`
- `packages/ai/src/committee/jev-calibration-block.ts`
- `packages/ai/src/committee/jev-consensus-gate.ts`
- `packages/ai/src/mastra-v2/evals/scorers/jev-scorers.ts`
- `apps/web/src/app/(app)/settings/api-keys/_components/jev-decision-keys.ts`
- `apps/web/src/app/(app)/settings/api-keys/_components/jev-decision-keys-card.tsx`
- All `packages/ai/test/*jev*.test.ts` files (`jev-client.test.ts`, `jev-turn-router.test.ts`, `jev-tool-pruner-and-guardrail.test.ts`, `jev-verifier-and-scorers.test.ts`, `jev-rag-quarantine.test.ts`, `committee-jev-packet-scorer.test.ts`, `committee-jev-consensus-gate.test.ts`)

### Files to Update (Remove JEV Imports & Branches)

- `packages/ai/src/index.ts` (remove `export * from './barrels/jev'`)
- `packages/ai/src/committee/single-workflow/collect-step.ts` & `packages/ai/src/committee/comparison-workflow/collect-step.ts` (remove `scorePacketWithJev` call; return the deterministic packet directly)
- `packages/ai/src/committee/specialist-runner/runner.ts` (use the LLM's own `opinion.confidence` directly without `blendSpecialistConfidence`; remove `verifySemanticDisclosureWithJev` while keeping deterministic `verifyMastraOpinion`)
- `packages/ai/src/committee/verifier.ts` (inline `packetNeedsDisclosure` / `hasNegatedDisclosure` deterministic regex checks directly in `verifier.ts` so `verifier.ts` has zero dependency on `jev/`)
- `packages/ai/src/committee/prompts/specialist.ts` (remove `jevCalibrationBlock`)
- `packages/ai/src/mastra-v2/planning/router.ts`, `packages/ai/src/routing/semantic.ts`, `packages/ai/src/mastra-v2/mutation/mutation-detect.ts` (use the existing deterministic + LLM router without `evaluateJevTurnRouting`)
- `packages/ai/src/mastra-v2/agents/canonical/setup.ts` (remove `pruneToolsWithJev`; use the domain tool allowlist directly)
- `packages/ai/src/mastra-v2/guardrails.ts` (remove `createJevGuardrailProcessor`; keep deterministic prompt-injection and indirect-content guardrails)
- `packages/ai/src/models/rag/memory.ts`, `packages/ai/src/models/rag/search.ts`, `packages/ai/src/tools/web-search/tool.ts` (remove `quarantineAndRerankSnippets` JEV call; keep deterministic sanitization `sanitizeExternalText`)
- `apps/web/src/app/(app)/settings/api-keys/page.tsx` & `apps/web/src/app/(app)/settings/_actions/api-keys-save.ts` (remove `JevDecisionKeysCard` and `JEV_DECISION_KEY_KEEP`)
- `packages/shared/src/env/schema/` (remove `OPENCODE_API_KEY`, `TYPESAFE_API_KEY`, `LIQUID_API_KEY`, `JEV_BASE_URL`)

### Verification

- Run `pnpm knip` and `pnpm check:fast`. Ensure `rg "jev" packages/ apps/` returns zero matches.

---

## Task 2.2: Pure 4-Desk Committee Pipeline (Remove Critique, Debate & Brier Calibration; Keep Hard 4/4 Gate)

### Target Architecture

Every `full` committee run must execute this exact 4-stage Mastra workflow graph:

1. **`collect-packet` (Deterministic):** Pre-fetches live price, multi-timeframe candles (`1D`, `4H`, `1H`, `15M`), mathematical indicators, session levels, FRED macro series, CFTC COT positioning, and news in parallel. Fails closed if the packet is blocked.
2. **`parallel(technical, fundamental, risk, sentiment)` (4 Independent Specialist Desks):**
   - Each desk runs in parallel with its dedicated domain playbook (`SPECIALIST_SKILL_PLAYBOOKS`) and read-only toolset (`SPECIALIST_DESK_TOOL_NAMES`).
   - Each desk produces a structured `OpinionSchema` (`bias`, `confidence`, `reasoning`, `details.keyLevels`, `details.invalidation`, `details.missingEvidence`).
   - Each desk's output is verified by deterministic `verifyMastraOpinion` (every number must match the packet or tool outputs; max 1 automatic retry if verification fails).
3. **`verify` (Strict 4-of-4 Hard Gate):**
   - Checks all 4 required desks (`['technical', 'fundamental', 'risk', 'sentiment']`).
   - **Hard Rule:** All 4 agents **must** succeed (`marker?.ok === true`). If even 1 agent fails or fails verification after its retry, `createSingleVerifyStep` (and comparison verify) immediately throws `MastraModeStrictFailureError(failedAgents)` and aborts before Fusion. Never return a 3-of-4 partial answer.
4. **`fusion` (Conflict-Aware Synthesis):**
   - `synthesizeCommitteeAnswer` (`packages/ai/src/committee/synthesizer/synthesis.ts`) receives the deterministic packet + all 4 verified specialist opinions.
   - Update `packages/ai/src/committee/prompts/fusion.ts` so the Fusion Synthesizer explicitly performs cross-desk conflict resolution:
     - Highlight where the 4 desks align.
     - Explicitly surface and adjudicate any disagreement between desks (e.g., Technical is bullish on structure while Fundamental/Risk flags yield headwinds or an upcoming CPI release) using equal, unmanipulated desk weights.
   - Verify the final synthesized report with `verifyFusionAnswer`.

### Files to Delete

- `packages/ai/src/committee/critique/` (entire directory: `run-critique.ts`, `run-debate.ts`, `schemas.ts`, `readers.ts`, `errors.ts`, `types.ts`, `index.ts`)
- `packages/ai/src/committee/critique-steps.ts`
- `packages/ai/src/committee/prompts/critique.ts`
- `packages/ai/src/committee/calibration-weights.ts`
- `packages/ai/src/committee/opinion-persistence.ts`
- `apps/worker/src/jobs/opinion-calibration.ts`
- `apps/worker/src/jobs/opinion-calibration-regime.ts`
- `apps/worker/test/opinion-calibration.test.ts`

### Files to Modify

- `packages/ai/src/committee/single-workflow/workflow.ts`:
  - Chain `.then(collectPacketStep).parallel(asParallelSteps(specialistSteps)).then(verifyStep).then(fusionStep).commit()`.
  - Remove `critiqueStep` and `debateStep`.
- `packages/ai/src/committee/single-workflow/verify-step.ts`:
  - Assert that for `mode === 'full'`, all 4 specialists (`technical`, `fundamental`, `risk`, `sentiment`) have `marker?.ok === true`; otherwise throw `MastraModeStrictFailureError`.
- `packages/ai/src/committee/single-workflow/fusion-step.ts`:
  - Read the 4 verified specialist opinions directly and pass them to `synthesizeCommitteeAnswer`.
- `packages/ai/src/committee/types/mode.ts`:
  - Update `committeeProgressStages(mode)` to return `['collect-packet', ...SPECIALISTS_BY_MODE[mode], 'verify', 'fusion']`.
- `packages/ai/src/committee/prompts/fusion.ts`:
  - Remove `calibrationWeights` / Brier weight formatting and strengthen the prompt instructions for synthesizing conflicts across the 4 independent desks.

### Verification

- Run `pnpm --filter @kestrel/ai test` and verify that:
  1. `full` mode runs all 4 desks in parallel followed by `verify` and `fusion`.
  2. If any 1 of the 4 desks fails in `full` mode, `MastraModeStrictFailureError` is thrown and `fusion` is never called.

---

## Task 2.3: Stream `full` Committee Runs Directly Over SSE & Retire `full_analysis_queue`

### Why

Previously, `full` mode took 45–90s because of JEV + 4 Specialists + 4 Critiques + 4 Debates + Fusion, so `apps/web/src/app/api/chat/_lib/run-dispatch.ts` shunted `executionPlan?.route === 'full-analysis'` into the `full_analysis_queue` Postgres table for the background worker to poll.
With the Pure 4-Desk pipeline (1 parallel wave of 4 desks + 1 Fusion call), `full` mode completes in ~8–15s and streams live stage progress (`collect-packet` → `technical` / `fundamental` / `risk` / `sentiment` → `verify` → `fusion`) **directly over SSE** using the existing `runMastraModeChatStream` in `apps/web/src/lib/services/mastra/chat/mastra-mode.ts`!

### Files to Modify

- `apps/web/src/app/api/chat/_lib/run-dispatch.ts`:
  - Route `executionPlan?.route === 'full-analysis'` (and `symbol-research` when `mode === 'full'`) directly to `runResearchWorkflow` → `runMastraModeChatStream` with `mode: 'full'`.
- `packages/ai/src/mastra-v2/planning/router.ts`:
  - Ensure `full` mode symbol research resolves to `symbol-research` (or `multi-symbol-research` when 2–3 symbols are named) with `mode: 'full'`, rather than requiring a separate async queue route.
- `apps/web/src/components/chat/` (inspect any UI polling hook for `/api/chat/analysis-jobs` and remove dead polling code, since `runMastraModeChatStream` already emits `data-agent-progress` and `data-multi-agent-meta` directly on the chat SSE stream!).

### Files to Delete

- `apps/web/src/app/api/chat/_lib/full-analysis-enqueue.ts`
- `apps/web/src/app/api/chat/analysis-jobs/` (entire route directory)
- `packages/ai/src/mastra-v2/workflows/full-analysis-*.ts` (`full-analysis-claim.ts`, `full-analysis-lifecycle.ts`, `full-analysis-types.ts`, etc.)
- `apps/worker/src/jobs/multi-agent-analysis/` and `apps/worker/src/jobs/full-analysis-coordinator.ts`
- `packages/db/src/queries/full-analysis-queue/` and `packages/db/src/schema/ai/full-analysis-queue.ts` (add a migration dropping `full_analysis_queue` and `agent_opinions` if no longer needed)

### Verification

- Run `pnpm check:fast`, `pnpm check:route-security`, and `pnpm knip`.
- Verify that selecting `Full` mode in the chat UI streams live desk progress events over SSE and renders the final 4-desk synthesized report directly in the chat thread.

---

## Implementation Notes (2026-11-03)

- **Zero JEV references:** `rg -i "jev" packages apps` returns no matches. The decision model, its env keys (`OPENCODE_API_KEY`, `TYPESAFE_API_KEY`, `LIQUID_API_KEY`, `JEV_BASE_URL`), BYOK fields, metrics, scorers, settings card, and tests are gone.
- **Deterministic indirect-content screen:** retrieval and web-search paths keep the deterministic `quarantineExternalText` floor through `mastra-v2/packets/snippet-screen.ts`. Online paraphrases that only a model detector recognizes are no longer caught; this is the accepted trade-off of removing the external detector.
- **4-of-4 hard gate:** `verify` now treats a missing specialist marker as a failure, not just an explicit `ok === false`, so an absent desk can never produce a partial answer.
- **Opinion history vs. Brier calibration:** `committee/opinion-persistence.ts` (the calibration writer) is deleted. A thin `committee/opinion-history.ts` keeps one best-effort `agent_opinions` row per desk for the settings usage page's per-agent cost/latency attribution. Nothing grades those rows.
- **Direct streaming:** `full` resolves to `symbol-research` (or `multi-symbol-research`) with `mode: 'full'`; the plan no longer carries a `full-analysis` route. Both modes stream over `runMastraModeChatStream`.
- **Queue retirement:** `/api/chat/analysis-jobs/*`, `full-analysis-enqueue`, the worker `multi-agent-analysis` job, the DB query layer/schema, retention of terminal rows, and the queue health/SLI probes are deleted. Migration `0123_drop_full_analysis_queue.sql` drops the table.
- **Verification:** `pnpm check:guards` 7/7, `pnpm knip` 0 findings, `pnpm check:fast` 31/31 tasks; ai 1636, db 102, worker 320, web 1516 tests pass.
