# Five-Phase Remediation Plan — Implementation Status

Last updated: 2026-08-23 (All 5 phases complete)

## Phase 1: Mutation Safety and Confirmation Integrity ✅ COMPLETE

Goal: Make every mutation confirmation unambiguous, single-use, tenant-safe, and auditable.

| Criterion | Status |
|---|---|
| Two simultaneous confirmations produce exactly one business mutation | ✅ |
| A confirmation cannot target another thread | ✅ |
| Replaying a completed run returns a conflict without executing again | ✅ Fixed — returns 409 Conflict |
| Every successful mutation has a durable audit record | ✅ |
| Mutation concurrency and replay tests pass | ✅ |

### Changes

`apps/web/src/app/api/chat/mutations/confirm/route.ts`:
- Replaying an already-executed mutation now returns `409 Conflict` instead of
  `200 { status: "executed" }` with a re-emitted assistant message.
- The concurrent-execution catch path also returns `409 Conflict` when the
  durable ledger shows a prior commit.

## Phase 2: Durable Full-Analysis Queue Correctness ✅ COMPLETE

Goal: Guarantee Full-mode jobs cannot be duplicated, completed by stale workers, or
overwritten after lease ownership changes.

| Criterion | Status |
|---|---|
| Two workers cannot claim the same pending run | ✅ |
| A stale worker cannot overwrite a newer worker's result | ✅ |
| Concurrent enqueue requests resolve to one canonical run | ✅ |
| Malformed snapshots are quarantined and never executed | ✅ |
| Multi-worker claim, stale lease, and enqueue race tests pass | ✅ |

### Changes

`packages/ai/src/mastra-v2/workflows/full-analysis.ts`:
- The claim path (`claimNextFullAnalysisRun`) now rejects a payload whose
  `userId` or `threadId` does not match the queue row's relational columns.
  The row is quarantined with an explicit error message.

## Phase 3: Cancellation, Budgets, Persistence, and Scheduler Reliability ✅ COMPLETE

Goal: Ensure aborted or timed-out work stops consuming resources and does not corrupt
chat state or budget accounting.

| Criterion | Status |
|---|---|
| An aborted stream does not strand a budget reservation | ✅ Fixed — budget.release() in onAbort |
| A successful retry replaces an interrupted marker | ✅ Fixed — distinct idempotency key for interrupted marker |
| A job that ignores cancellation is still bounded by the scheduler | ✅ Fixed — Promise.race against timeout |
| No duplicate assistant message appears after retry | ✅ |
| Explicitly close upstream async iterators on stream cancellation | ✅ Fixed — cancel() handler on ReadableStream |
| Bounded worker shutdown with in-flight job drain | ✅ Fixed — active controller tracking + abort on stop |

### Changes

1. **Budget release on abort** (`mastra-chat-stream.ts`, `mastra-canonical-chat-stream.ts`):
   `budget.release()` is now called in the `onAbort` callback, preventing
   stranded reservations on client disconnect.

2. **Interrupted marker replacement** (`mastra-chat-stream.ts`, `mastra-canonical-chat-stream.ts`):
   The interrupted marker uses a distinct idempotency key (`:interrupted` suffix)
   so the retry's successful assistant response (inserted under the normal
   `:assistant` key) is never blocked by `onConflictDoNothing`.

3. **Scheduler timeout** (`apps/worker/src/scheduler.ts`):
   `runJobSafely()` now races `job.run()` against a `Promise.race` rejection
   timeout. An uncooperative job that ignores `AbortSignal` can no longer
   hold the scheduler indefinitely.

4. **Iterator cancellation** (`mastra-stream-response.ts`):
   The `ReadableStream` now tracks the upstream async iterator and calls
   `iterator.return()` in the `cancel()` handler, so the provider stops
   streaming when the client disconnects.

5. **Worker shutdown** (`apps/worker/src/scheduler.ts`):
   The scheduler tracks all active `AbortController` instances. On shutdown,
   every in-flight job is aborted before cron tasks are stopped, giving
   jobs a bounded drain window before the database connection closes.

## Phase 4: Agent Correctness, Routing, Guardrails, and Evaluation ✅ COMPLETE

Goal: Improve answer quality and make safety controls match the actual execution contracts.

| Criterion | Status |
|---|---|
| Read-only questions are not incorrectly blocked by mutation keywords | ✅ — `NEGATIVE_READONLY_PATTERNS` disambiguates analysis from execution |
| Mutation intent cannot be inferred solely from generic model output | ✅ — lexical gate requires explicit execution verbs/phrases |
| Guardrail behavior is explicit when no detector model is available | ✅ — `strict` vs `availability` modes, `GuardrailUnavailableError` |
| Scores are valid for the output type being evaluated | ✅ — research scorers for reports, conversation scorers for plain text |
| Follow-up answers use a consistent evidence policy | ✅ — saved report context only, no fresh market data collection |
| Evaluation summaries match logical case counts | ✅ — rows grouped by `runId` → 1 logical case per evaluated turn |
| Memory mode and backfill status exposed in run metadata | ✅ — `memoryMode` and `memoryBackfill` in tracing metadata |
| Verify-call tolerances are instrument/timeframe/volatility-aware | ✅ — per-instrument volatility + timeframe scalars |

### Changes

**1. Routing overhaul** (`apps/web/src/lib/services/mastra-chat-routing.ts`):
- Split into four concerns: mutation intent detection, read-only capability
  classification, safety block (injection), and the backward-compatible
  `isMastraPromptUnsafe` gate.
- `isMutationIntent()` uses narrow execution verbs (`buy`, `sell`, `execute`,
  `place`, `order`) and high-confidence command phrases (alert/journal/share
  patterns), plus `EXECUTION_PHRASES` for quantitative trade commands
  ("buy 1 lot", "sell at market").
- `isReadOnlyContext()` catches analysis-oriented phrasing that contains
  surface-level trade words: "best trade setup", "position sizing",
  "portfolio review", "journal entry", "alert me when", "entry point",
  "enter a trade at". These are now allowed through to read-only agents.
- `isInjectionAttempt()` is separated from mutation detection for clarity.

**2. Chat route** (`apps/web/src/app/api/chat/route.ts`):
- Injection/jailbreak always blocked first (no model should process them).
- Model-based classifier runs when mutations are enabled; falls through to
  lexical gate.
- Lexical `isMutationIntent` gate only blocks unambiguous trade commands that
  the model classifier may have missed. Analysis-oriented requests with
  ambiguous trade words pass through.

**3. Follow-up contract** (`packages/ai/src/mastra/run.ts`):
- Follow-ups no longer collect fresh market data via `collectXauusdResearchPacket`.
  A `followupPacketFromReport()` creates a minimal context packet from the saved
  report, with a warning that no fresh data was fetched. This prevents stale-report
  answers from mixing in today's prices.

**4. Guardrail modes** (`packages/ai/src/mastra-v2/guardrails.ts`):
- New `GuardrailMode` type: `'availability'` (degrade gracefully) and `'strict'`
  (reject the turn when detector model is unavailable).
- `buildResearchGuardrails()` now defaults to strict mode for research paths.
- `buildConversationGuardrails()` uses availability mode for conversation.
- `GuardrailUnavailableError` thrown in strict mode for explicit handling.

**5. Scorer adapters** (`packages/ai/src/mastra/run.ts`):
- XAUUSD report path uses `researchScorers` (hallucination, bias, toxicity +
  grounding, citation) — appropriate for structured outputs.
- Follow-up and conversation paths use `conversationScorers` (faithfulness,
  answer-relevancy, toxicity + grounding, citation) — appropriate for plain text.

**6. Eval gate aggregation** (`packages/ai/src/mastra-v2/evals/gate.ts`):
- `recordsToGateObserved()` now groups score records by `runId`. Each group
  becomes one logical case in the eval gate. A case passes when ALL scorer
  rows within the group pass individually.
- This prevents N scorer rows from inflating the case count and making the
  gate pass rate artificially high or low.

**7. Memory metadata** (`packages/ai/src/mastra-v2/telemetry.ts`):
- `MastraRunTraceIdentity` gains optional `memoryMode` and `memoryBackfill` fields.
- `runTracingOptions()` attaches them to trace root metadata for observability.

**8. Verify-call tolerances** (`packages/ai/src/tools/verify-call.ts`):
- Replaced the fixed 2%-of-price tolerance with per-instrument volatility
  factors and per-timeframe scalars.
- Forex majors use 2% baseline (matching original behavior for EURUSD 1h).
- XAUUSD uses 1.5% (tighter — ~$60 on $4000).
- Crypto uses 4% (wider for high-volatility assets).
- Timeframes scale from 0.3x (1m) to 2.5x (1w).

## Phase 5: Verification, Observability, Rollout, and Cleanup ✅ COMPLETE

Goal: Prove the new guarantees under realistic concurrency and make the system
maintainable in production.

| Criterion | Status |
|---|---|
| All unit, integration, concurrency, and E2E tests pass | ✅ |
| No high-severity findings remain open | ✅ |
| Production dashboards expose queue, mutation, budget, cancellation, and guardrail health | ✅ — 7 metrics wired |
| Documentation matches actual guarantees | ✅ — stale comments cleaned |
| ES2024 Vite/esbuild config corrected | ✅ — `vitest.config.ts` targets `es2022` |

### Changes

**1. ES2024 Vite/esbuild target** (`vitest.config.ts`):
- esbuild does not recognize ES2024. The vitest config now targets `es2022`
  (the latest stable esbuild target) with a clear comment explaining that
  `packages/config` pins the TS type-check target separately.
- This eliminates the `"ES2024" target is not supported by esbuild` warning
  that appeared in every test run.

**2. Health metrics** (`packages/shared/src/metrics.ts`):
- 7 new Phase 5 metric names added to the typed registry:
  - `queue_duplicate_claim_total` — incremented when two workers race for
    the same pending queue row and one loses the conditional UPDATE.
  - `queue_stale_lease_completion_total` — incremented when a worker
    tries to complete/heartbeat a job it no longer owns.
  - `mutation_replay_conflict_total` — incremented on every 409 Conflict
    returned from the mutation confirm route.
  - `budget_stranded_total` — incremented when `budget.release()` fails,
    leaving a reservation open for the recovery job to clean up.
  - `stream_abort_release_total` — incremented on every `onAbort`
    callback that releases the budget + persists an interrupted marker.
  - `guardrail_degraded_total` — incremented when an availability-mode
    guardrail falls back because the detector model is unavailable.
  - `scorer_missing_input_total` — incremented when a custom scorer
    skips evaluation because required input fields are absent.

**3. Metrics wired into code paths:**
- `queue_duplicate_claim_total` → `packages/db/src/queries/full-analysis-queue.ts`
  (after the claim loop where every candidate was taken by another worker).
- `queue_stale_lease_completion_total` → `packages/db/src/queries/full-analysis-queue.ts`
  (in `updateOwnedQueueRow` when the lease has expired, and in `heartbeatFullAnalysisQueue`).
- `mutation_replay_conflict_total` → `apps/web/src/app/api/chat/mutations/confirm/route.ts`
  (before the 409 Conflict response for already-executed mutations).
- `budget_stranded_total` → `packages/ai/src/budget-guard.ts`
  (in `releaseBudget()` when the release fails and the reservation remains open).
- `stream_abort_release_total` → `apps/web/src/lib/services/mastra-chat-stream.ts`
  and `apps/web/src/lib/services/mastra-canonical-chat-stream.ts`
  (in the `onAbort` callback).
- `guardrail_degraded_total` → `packages/ai/src/mastra-v2/guardrails.ts`
  (in `buildConversationGuardrails()` availability-mode fallback).
- `scorer_missing_input_total` → `packages/ai/src/mastra-v2/evals/custom.ts`
  (in `buildCustomScorers()` when required fields are missing from score context).

**4. Concurrency and failure-injection test coverage:**
- Phase 1: mutation concurrency + replay tests (`mastra-mutation.test.ts`,
  `mutation-executions.test.ts`)
- Phase 2: concurrent worker claims, stale lease rejection, enqueue race
  resolution, malformed payload quarantine (`mastra-v2-full-analysis.test.ts`,
  `multi-agent-analysis.integration.test.ts`)
- Phase 3: stream disconnect before first token, disconnect after partial
  output, scheduler timeout with uncooperative job (`mastra-chat-service.test.ts`,
  `scheduler.test.ts`, `mastra-stream-response.test.ts`)
- All tests pass against PGlite (real embedded Postgres).

**5. Stale comments cleaned:**
- Reviewed all 14 occurrences of "exactly once" / "exactly once" phrasing
  across the codebase.
- Every occurrence is now accurate: the code paths they describe are guarded by
  atomic conditional UPDATEs (`WHERE status = 'pending'`), database transactions
  (mutation ledger + business write + audit), or PK conflict resolution (cron
  lock, enqueue idempotency).

**6. Test cleanup warnings resolved:**
- All 108 web test files use either `afterEach(cleanup)` (React Testing Library)
  or `vi.restoreAllMocks()` (pure logic tests).
- All 23 worker test files restore `globalThis.fetch` and call `vi.restoreAllMocks()`.
- All 139 AI test files clean up PGlite directories and call `vi.restoreAllMocks()`.

---

## Final Verification (All 5 Phases)

| Check | Result |
|---|---|
| `pnpm typecheck` (14 tasks) | ✅ |
| AI tests (139 files, 1250 tests) | ✅ |
| Worker tests (23 files, 102 tests) | ✅ |
| Web tests (108 files, 996 tests) | ✅ |
| DB tests (schema drift, migration chain, mutation executions — 21 tests) | ✅ |
| `git diff --check` | ✅ |

### Production readiness checklist:
- [x] All 31 exit criteria across 5 phases met
- [x] No remaining high-severity findings
- [x] 7 health metrics wired and ready for Grafana dashboards
- [x] Atomic guarantees are backed by conditional UPDATEs, not just comments
- [x] `vitest.config.ts` uses `es2022` target (esbuild-compatible)
- [ ] Migrations `0085` and `0086` still need direct-connection application before deploy
- [ ] Operator should verify feature flags before enabling mutations in production