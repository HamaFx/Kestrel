# Kestrel AI & Agentic System Remediation Plan

**Date:** August 24, 2026  
**Status:** Approved implementation blueprint  
**Scope:** AI agents, Mastra workflows, routing, tools, memory, guardrails, evidence, budgets, worker orchestration, persistence, evaluation, observability, and UI transport.

## Architectural decisions

The following decisions were confirmed before implementation:

- **Full-analysis queue:** The database queue is authoritative. Mastra workflow snapshots are projections for progress, tracing, and debugging only.
- **Guardrails:** Use strict behavior in production for research paths, with controlled degradation only where explicitly allowed.
- **Full-analysis model policy:** Snapshot the exact model and provider at enqueue time. Do not automatically fail over to another provider or model.
- **Mode compatibility:** Preserve the public `Single` mode API, but separate its internal Conversation, Quick, Standard, and Verified Report contracts.
- **System actions:** Use a closed allowlist. Reject unregistered actions before execution.
- **Cost accounting:** Use one run-level ledger covering primary and internal AI calls.

## Audit baseline

The audit covered:

- AI model/provider resolution and BYOK
- Semantic and keyword routing
- Canonical chat
- XAUUSD conversation and verified-report paths
- Single, Quick, Standard, and Full modes
- Specialist committee workflows
- Durable Full-analysis queue and worker execution
- Mutation confirmation workflows
- Tool registry, tool filtering, adapters, telemetry, and timeouts
- Memory, semantic recall, working memory, and history backfill
- Guardrails and prompt-injection handling
- Evidence packets, report verification, and citation enforcement
- Budgets, cost accounting, retries, leases, and recovery
- Evals, scorers, quality gates, persistence, and observability
- UI streaming and assistant-message persistence
- Relevant tests and typechecking

### Baseline verification

- `pnpm typecheck`: passed
- Web tests: 996 passed
- AI tests: 1249 passed, 1 failed
- The failing AI test is a real storage connection-precedence defect in `packages/ai/test/mastra-v2-storage.test.ts`.
- Tests also emit repeated Vite/esbuild warnings that `ES2024` is not recognized as a target.

---

# Implementation plan

## Phase 0 — Freeze contracts and create shared primitives

Before changing behavior:

1. Define canonical run lifecycle states:
   - `created`
   - `running`
   - `completed`
   - `aborted`
   - `failed`
   - `canceled`
   - `expired`

2. Define one `AiRunContext` containing:
   - `runId`
   - `userId`
   - `threadId`
   - requested mode
   - symbol scope
   - model/provider snapshot
   - deadline
   - budget handle
   - guardrail status

3. Define one finalization API with:
   - exactly-once telemetry completion
   - exactly-once budget reconciliation/release
   - exactly-once assistant persistence
   - interruption/error marker handling

4. Define one capability/tool-policy source of truth and derive:
   - active tools
   - capability metadata
   - plan gating
   - test expectations
   - documentation identifiers

### Primary files

- `packages/ai/src/`
- `packages/shared/src/ai/`
- `packages/ai/src/mastra/capabilities.ts`
- `packages/ai/src/tool-context.ts`

---

## Phase 1 — P0 correctness fixes

### 1. Make the DB queue authoritative

Change:

- `packages/ai/src/mastra-v2/workflows/full-analysis.ts`
- `apps/worker/src/jobs/multi-agent-analysis.ts`
- `apps/web/src/app/api/chat/route.ts`

Rules:

- DB enqueue failure returns an API error.
- Mastra projection failure does not reject an already-created DB job.
- Worker claims only DB queue rows.
- Polling reads DB first.
- Mastra snapshots are rebuilt from DB when missing.
- Remove contradictory “Mastra source of truth” comments and fallback semantics.
- Add a projection-repair job.

### 2. Snapshot the exact Full-analysis model

At enqueue, persist:

- resolved model ID
- provider ID
- provider/model configuration identifier
- model catalog version, if available

At execution:

- use exactly that model
- do not silently fail over
- terminal error must disclose model unavailability
- retries reuse the same model snapshot

If the model cannot be resolved at enqueue, reject before creating the job.

### 3. Fix connection precedence

Centralize the resolver and enforce:

```text
DIRECT_URL
POSTGRES_URL_NON_POOLING
POSTGRES_PRISMA_URL
DATABASE_URL
POSTGRES_URL
```

Update Mastra and DB consumers to use the same helper.

### 4. Lock down system actions

Replace:

```ts
action: string
params: Record<string, unknown>
```

with a registry containing:

- action ID
- parameter schema
- authorization rule
- timeout
- audit label
- confirmation summary
- executor

Unregistered actions are rejected during extraction and again during confirmation.

### 5. Fix scheduler timeout cleanup

- retain timeout handles
- clear them in `finally`
- prevent stuck-job cleanup from deleting active ownership state
- use execution IDs/fencing instead of only `_runningJobs`
- do not allow a second run while an old timed-out execution may still be working

---

## Phase 2 — Streaming and run-finalization redesign

Change:

- `packages/ai/src/mastra/canonical-chat.ts`
- `packages/ai/src/mastra/run.ts`
- `apps/web/src/lib/services/mastra-canonical-chat-stream.ts`
- `apps/web/src/lib/services/mastra-chat-stream.ts`
- `apps/web/src/lib/services/mastra-stream-response.ts`

Implement one `finalizeRunOnce()` path for:

- normal completion
- provider error
- client disconnect
- abort signal
- tool timeout
- route timeout
- persistence failure

Guarantees:

- `finishMastraRun()` executes once
- budget is reconciled or released once
- assistant message is persisted once
- interruption marker cannot race with successful assistant persistence
- completion promise is always observed
- underlying iterator/provider is canceled
- `onAbort()` runs from both signal and stream cancellation paths

Add a DB idempotency/terminal-state guard for finalization.

---

## Phase 3 — Mode-contract cleanup

Preserve the public `Single` API, but internally define the following contracts.

### Conversation

- streaming
- read-only
- current-data tools
- no verified-report contract

### Quick

- generalized research packet
- technical specialist
- deterministic lightweight output validation

### Standard

- technical and fundamental specialists
- explicit failed-specialist disclosures
- fusion synthesis

### Full

- durable DB queue
- four specialists
- exact model snapshot
- strict failure behavior
- progress reporting

### Verified Report

- XAUUSD only
- structured schema
- deterministic verification
- bounded repair
- no partial report

### Single compatibility mapping

- route legacy `single` requests to the correct internal contract
- document the distinction
- avoid routing current questions to stale-report follow-up based only on words such as “report” or “risk”

Use explicit report/message references for follow-ups rather than lexical inference wherever the client can provide them.

---

## Phase 4 — Capability, plan, and symbol security

Change:

- `packages/ai/src/mastra/capabilities.ts`
- `packages/ai/src/tools/by-domain.ts`
- `packages/ai/src/mastra/canonical-chat.ts`
- billing/user-settings access paths

Implement:

- user-derived plan tier, never environment-derived plan tier
- unknown or missing plans fail closed
- one capability-to-tool policy
- request-level allowed symbol scope
- every market tool validates requested symbol against that scope
- no mutation tools in read-only domains
- no `search_knowledge` in broad “always” lists unless explicitly authorized
- model override permissions enforced through the same policy layer

Add policy tests for:

- free users
- paid users
- unknown plans
- downgraded users
- cross-symbol requests
- missing request context

---

## Phase 5 — Guardrail unification

Create one shared prompt-safety pipeline for web, worker, Telegram, direct package calls, and background tasks.

Pipeline:

1. Unicode normalization
2. confusable and zero-width handling
3. control-character removal
4. role-marker detection
5. instruction-override detection
6. encoded-payload detection
7. deterministic policy result
8. optional LLM detector
9. strict/availability policy decision

Fix the doubled-escape regex issue in `isSafeSymbolResearchPrompt()`.

Policies:

- research and verified-report paths: strict
- Full worker: strict
- generic conversation: availability only if degraded status is recorded
- web and knowledge tools: disabled when required guardrails are unavailable
- external content never becomes executable instructions

Use structured model messages rather than interpolating user text into classifier prompts.

Fix semantic-routing cache keys to hash the normalized full input, not only the first 200 characters.

---

## Phase 6 — Tool execution and telemetry cleanup

Change:

- `packages/ai/src/tools/with-telemetry.ts`
- `packages/ai/src/mastra/legacy-tool-adapter.ts`
- `packages/ai/src/mastra/tool-telemetry.ts`
- `packages/ai/src/tools/by-domain.ts`

Implement one instrumentation boundary.

Ensure:

- no double telemetry
- one canonical tool ID
- one timeout controller
- remaining turn deadline passed to every tool
- timeout errors are stable
- ignored abort signals are observable
- detached promises cannot become unhandled rejections
- tools cannot execute after run finalization

---

## Phase 7 — Unified cost ledger

Change:

- `packages/ai/src/cost.ts`
- `packages/ai/src/budget-reservation.ts`
- telemetry persistence
- routing, guardrail, scorer, title, embedding, and workflow calls

Track every generation under the same `runId`:

- semantic routing
- prompt-injection detector
- primary model
- specialists
- fusion
- repair attempts
- scorers
- title generation
- observational memory
- embeddings where billable

Use:

- one admission reservation
- per-generation cost entries
- one run-level reconciliation
- exact model pricing
- conservative rejection for unknown or unpriced production models

Remove the production compatibility path that updates only the daily counter without a durable reservation ledger.

---

## Phase 8 — Memory correctness and provenance

Change:

- `packages/ai/src/mastra-v2/context.ts`
- `packages/ai/src/mastra-v2/memory.ts`
- embedding/backfill jobs
- Mastra storage metadata

Implement:

- atomic per-thread backfill marker/lock
- stable source IDs
- preservation of validated UI message parts and metadata
- explicit report/evidence metadata during backfill
- user/resource isolation tests
- embedding model/version namespaces
- rebuild or invalidate recall when embedding model changes
- proof that working memory is shared across a user’s threads but not across users

---

## Phase 9 — Evidence, citation, and scorer correctness

Implement a common post-generation evidence processor for every user-facing path.

It should:

- inspect current-run tool calls only
- validate symbol and timeframe provenance
- distinguish observed facts from derived values and projections
- attach citation warnings before persistence
- persist warning metadata
- emit deterministic citation scores

Split scorers into:

- XAUUSD verified-report grounding
- generalized symbol-research grounding
- conversational citation/grounding

Do not attach `verifyXauusdReport()` to EURUSD, BTC, or generalized research.

Fix the evaluation gate so a quality gate cannot report “passed” while required cases fail. Separate transport status from quality status.

---

## Phase 10 — External content safety

For news, web, calendar, knowledge, and social data:

- sanitize HTML and scripts
- normalize Unicode
- cap title, snippet, and body sizes
- validate URL schemes
- detect instruction-like content
- preserve publication timestamps separately
- include trust labels
- avoid sending raw page bodies unless explicitly needed
- ensure external content cannot influence tool authorization or system policy

---

## Phase 11 — Maintainability consolidation

After correctness is stable, reduce duplicated runners into:

- `runConversationTurn`
- `runResearchWorkflow`
- `runMutationWorkflow`
- `runBackgroundGeneration`

Keep specialized configuration in adapters rather than duplicating:

- model setup
- memory setup
- guardrails
- scorers
- telemetry
- persistence
- abort handling

Isolate framework casts in typed integration modules and remove unnecessary `as never` usages.

---

## Phase 12 — Regression and failure-injection testing

Add tests for:

### Streaming lifecycle

- client cancellation invokes `onAbort`
- completion and abort race
- stream error after partial output
- provider hangs after abort
- `finishMastraRun()` exactly once
- budget reconcile/release exactly once
- interrupted marker does not block retry

### Full queue

- Mastra enqueue succeeds but DB projection fails
- DB enqueue succeeds but Mastra projection fails
- worker restart between claim and workflow start
- lease expires during a provider call
- stale worker tries to append an assistant message
- settings/model changes after enqueue
- queue payload includes model snapshot
- progress state transitions

### Plan gating

- actual free user
- actual paid user
- unknown plan
- missing plan
- environment variable cannot override user plan
- downgrade immediately takes effect

### Memory

- concurrent backfill
- duplicate backfill prevention
- full UI-parts preservation
- same-user cross-thread working memory
- cross-user isolation
- embedding model change

### Guardrails

- Unicode confusables
- zero-width instruction markers
- multilingual injection
- encoded payloads
- external news injection
- detector unavailable in strict mode
- detector unavailable in availability mode
- classifier prompt containing quotes and newlines

### Verification

- a claim supported by an unrelated tool fails
- symbol mismatch
- timeframe mismatch
- derived-value disclosure
- stale-packet report
- generalized-symbol scorer
- report-repair exact call count

### Operational behavior

- scheduler timeout handles are cleared
- timed-out workers cannot run concurrently with replacement workers
- queue retries do not multiply cost unexpectedly
- unknown model pricing fails safely
- all persistence failures enter recovery

Then run:

```bash
pnpm typecheck
pnpm --filter @kestrel/ai test -- --run
pnpm --filter @kestrel/web test -- --run
pnpm turbo run test -- --run
pnpm lint
pnpm --filter @kestrel/web build
```

---

# Completion criteria

The work is complete when:

- every Full job has exactly one authoritative DB lifecycle
- no accepted job can disappear because Mastra projection failed
- every run reaches exactly one terminal finalization
- aborts never become successes
- no budget reservation is double-released or silently omitted
- model/provider choice is reproducible for Full jobs
- unknown plans, actions, and symbols fail closed
- all user-facing AI paths apply the same evidence and citation policy
- generalized research does not use XAUUSD-only verification
- memory backfill is race-safe and provenance-preserving
- full test, typecheck, lint, and build checks pass

## Recommended execution order

1. Phase 0 contract primitives
2. Phase 1 P0 queue, storage, action, and scheduler fixes
3. Phase 2 streaming finalization
4. Phase 4 capability and security policy unification
5. Phase 5 guardrails
6. Phase 7 cost ledger
7. Phase 8 memory correctness
8. Phase 9 evidence and scoring
9. Phase 3 mode cleanup
10. Phase 6 tool instrumentation cleanup
11. Phase 10 external content safety
12. Phase 11 maintainability consolidation
13. Phase 12 complete regression and failure-injection suite

The implementation should be split into reviewable batches. Each batch must leave the repository type-safe and should include focused regression tests before the next batch begins.
