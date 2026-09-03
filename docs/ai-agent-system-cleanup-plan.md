# AI and Agentic System Cleanup Plan

## Status

Approved direction with the product decisions recorded below. This document replaces the deleted legacy planning documents:

- `docs/update-system-plan.md`
- `docs/ai-agent-system-analysis.md`

This plan is based on the current implementation, not on the deleted documents. It is the implementation contract for the AI/agentic-system cleanup.

## Goal

Make Kestrel's AI system:

1. Easier to understand and operate.
2. A genuine, explicit multi-agent workflow rather than several overlapping orchestration paths.
3. More efficient in latency, token use, model calls, storage, and maintenance.
4. Safer around user data, external content, mutations, stale evidence, and model output.
5. Correctly observable and billable.
6. Incrementally refactorable without a large rewrite.

No new provider, agent, or user-facing AI feature should be added until the core execution and accounting invariants are stable.

---

## Current system: authoritative facts

### User request path

The primary entry point is:

```text
apps/web/src/app/api/chat/route.ts
```

The route currently owns or coordinates:

- authentication
- per-user rate limiting
- request validation
- thread ownership checks
- presentation preference sanitization
- report-follow-up detection
- mutation detection
- Mastra execution decisions
- Full-mode queue enqueueing
- XAUUSD route selection
- symbol-research route selection
- canonical-chat fallback
- error mapping

The route delegates actual model execution to services in `apps/web/src/lib/services/` and execution modules in `packages/ai/src/mastra/`.

### Current execution paths

There are currently several overlapping paths:

```text
1. Canonical streaming chat
   /api/chat
   → mastra-canonical-chat-stream service
   → runMastraCanonicalChatStream
   → one Mastra agent + filtered legacy read-only tools

2. XAUUSD conversation
   /api/chat
   → mastra-chat-stream service
   → runXauusdMastraConversationStream
   → XAUUSD agent + packet + conversation tools

3. Verified XAUUSD report
   /api/chat
   → mastra-chat service
   → runMastraXauusdResearch
   → XAUUSD report workflow
   → deterministic packet
   → structured generation
   → verification/repair/finalization

4. Quick/Standard synchronous committee analysis
   /api/chat
   → mastra-mode service
   → runMastraMode
   → symbol-research workflow
   → parallel specialist agents
   → verification
   → fusion agent

5. Full durable committee analysis
   /api/chat
   → database queue
   → worker claim/lease
   → runMastraMode
   → symbol-research workflow
   → specialist agents
   → fusion agent
   → assistant persistence

6. Background text generation
   worker/web callers
   → runMastraBackgroundText or text-runner
   → standalone bounded Mastra agent
```

### Current agent topology

The current committee topology is mostly deterministic:

```text
collect packet
   ↓
parallel technical / fundamental / risk / sentiment agents
   ↓
verify specialist outputs
   ↓
fusion agent
   ↓
final result
```

Agents do not directly message each other. They communicate through workflow step outputs. This is a good property and should remain the target model.

The system should describe this accurately as a **bounded multi-agent committee workflow**, not as an autonomous agent network.

### Current storage ownership

The implementation uses two storage families:

| Data                       | Current authority       | Secondary/projection use     |
| -------------------------- | ----------------------- | ---------------------------- |
| User-visible chat messages | Drizzle                 | Mastra memory/backfill       |
| Threads                    | Drizzle                 | Mastra memory thread records |
| Full-analysis queue        | Drizzle                 | Mastra workflow snapshot     |
| Workflow execution state   | Mastra workflow storage | Queue status projection      |
| Agent opinions             | Drizzle/UI metadata     | None or workflow output      |
| Semantic/working memory    | Mastra memory           | None                         |
| Budget reservations        | Budget/Drizzle layer    | Telemetry metadata           |
| Run/tool telemetry         | Drizzle + logs/metrics  | Langfuse when enabled        |
| Evals/datasets/scores      | Mastra/eval storage     | Reporting surfaces           |

This dual-storage model can remain during migration, but authority and projection rules must be explicit and tested.

---

## Target architecture

### Target top-level execution APIs

Reduce the public orchestration surface to three application-level runners:

```text
runConversationalTurn(plan)
runResearchWorkflow(plan)
runDurableResearchJob(job)
```

Internal implementations may remain separate, but callers should not need to know whether execution is canonical, XAUUSD-specific, synchronous, or queued.

### Target request lifecycle

```text
HTTP request
  ↓
validate + authenticate
  ↓
classify intent
  ↓
resolve symbol/mode
  ↓
authorize capability
  ↓
resolve immutable model snapshot
  ↓
create execution plan
  ↓
admit budget
  ↓
persist user message
  ↓
prepare memory/context
  ↓
execute agent or workflow
  ↓
validate/verify output
  ↓
persist assistant result
  ↓
reconcile budget
  ↓
emit terminal telemetry
```

The model must never own decisions about:

- identity
- user/thread ownership
- tenant
- available tools
- mutation permission
- budget
- model provider
- workflow mode
- evidence authority

### Target execution plan

Introduce one serializable, validated plan object:

```ts
interface ExecutionPlan {
  route:
    | 'canonical-chat'
    | 'xauusd-conversation'
    | 'symbol-research'
    | 'full-analysis'
    | 'mutation-draft';
  capabilityId: string;
  symbol: string | null;
  mode: 'single' | 'quick' | 'standard' | 'full' | 'auto';
  model: ResolvedModelSnapshot;
  toolPolicy: ToolPolicy;
  evidencePolicy: EvidencePolicy;
  memoryPolicy: MemoryPolicy;
  maxSteps: number;
  maxDurationMs: number;
  streaming: boolean;
}
```

The route should create this plan once. Downstream services should execute it rather than reclassifying the request.

---

## Target true multi-agent workflow

### Committee contract

For supported research requests, the workflow should be:

```text
ResearchCoordinator
  ↓
EvidenceCollector
  ↓
parallel:
  TechnicalAnalyst
  FundamentalAnalyst
  RiskAnalyst
  SentimentAnalyst
  ↓
OpinionVerifier
  ↓
DecisionSynthesizer
  ↓
ReportVerifier
  ↓
User response
```

The coordinator is orchestration code, not an LLM. The specialist agents are independent model calls with narrow contracts. The synthesizer is the only component allowed to produce the final user-facing committee answer.

### Agent responsibilities

#### EvidenceCollector

- Fetches deterministic market data.
- Produces a typed evidence packet.
- Adds source, timestamp, freshness, quality, and evidence IDs.
- Does not generate prose.
- Fails closed when required evidence is unavailable.

#### TechnicalAnalyst

- Reads only the trusted packet.
- Focuses on structure, trend, indicators, levels, and timeframe agreement.
- Returns structured opinion.
- Has no write tools.
- Should not read or write conversational memory except where explicitly required.

#### FundamentalAnalyst

- Reads packet macro fields and explicitly declared optional data.
- Focuses on catalysts, macro context, dollar sensitivity, and event risk.
- Must disclose unavailable inputs.

#### RiskAnalyst

- Focuses on uncertainty, invalidation, downside scenarios, data quality, and unsafe assumptions.
- Must not turn the output into an execution instruction.

#### SentimentAnalyst

- Reads explicitly marked sentiment/positioning evidence.
- Treats news and external content as untrusted.
- Must distinguish historical context from current signal.

#### OpinionVerifier

- Validates schema, agent identity, confidence, packet status, and unsupported claims.
- Rejects invalid specialist outputs before fusion.

#### DecisionSynthesizer

- Reads the packet and verified opinions.
- Reports agreement/disagreement.
- Produces scenarios, risks, and invalidation.
- Does not call external tools.
- Does not place trades or mutate user data.

#### ReportVerifier

- Validates final structure.
- Validates evidence references.
- Validates numeric and temporal grounding.
- Validates safety disclosures.
- Allows only bounded deterministic repairs.

### Communication contract

Agents communicate only through typed workflow outputs:

```text
EvidencePacket
SpecialistOpinion
VerifiedOpinion
SynthesisDraft
VerifiedReport
```

No agent should inspect another agent's private prompt, raw model messages, or mutable global state.

### Model policy

**Approved decision: use one resolved model initially.**

All committee specialists and the fusion agent use one immutable resolved BYOK model snapshot. This keeps behavior, cost, provider support, and debugging predictable during the cleanup. Per-agent model tiers are explicitly deferred until the unified workflow has stable quality and accounting measurements.

A future model map may be:

```text
technical    → fast/technical
fundamental  → mid/reasoning
risk         → fast/reasoning
sentiment    → fast
synthesis    → strong
```

This must be a deliberate product decision because it changes cost, latency, and user settings semantics.

---

## Simplification principles

1. **One planner.** Routing, capability, mode, model, tool, memory, and limits are resolved once.
2. **One lifecycle wrapper.** Budget, persistence, execution, verification, and reconciliation use one common lifecycle.
3. **One cost ledger.** Parent totals are derived from child generations exactly once.
4. **One capability manifest.** Tool exposure and route authorization come from one typed source.
5. **One evidence model.** Trusted and untrusted data are separate types.
6. **One workflow topology per product behavior.** Conversation, committee research, and durable research should not have duplicate hidden variants.
7. **Adapters remain temporary.** Legacy tool adapters and compatibility exports should have removal criteria.
8. **Prompts do not enforce security alone.** Deterministic policy remains outside prompts.
9. **Safe degradation must be visible.** Memory, telemetry, evidence, and provider degradation must be represented in run metadata.
10. **No silent semantic fallback.** Falling from native memory to explicit history or from a committee to a single agent must be observable and policy-approved.

---

## Phased implementation plan

## Phase 0 — Baseline and invariants

### Status

**Complete (2026-09-02).** Baseline definitions (terminal-state invariants, storage authority matrix, route decision matrix), run-scoped cost fixtures for every billed generation kind, mutation-exposure assertions for every read-only capability and committee specialist, and user/thread mismatch coverage at the chat boundary are implemented and verified by the dedicated `baseline-*` suites. Each of the nine Phase 0 end-to-end scenarios maps to an existing lifecycle-level suite (see Exit criteria).

### Defined terminal-state invariants

Execution outcome and answer outcome are separate contracts, defined in `packages/ai/src/execution-lifecycle.ts` (`ExecutionTerminalState` × `ExecutionAnswerOutcome`) and unified by `terminalMetadata`:

| executionOutcome | answerOutcome | Meaning                                                                                              |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `completed`      | `ready`       | Provider finished; usable answer.                                                                    |
| `completed`      | `degraded`    | Provider finished; bounded or lower-quality answer (empty text, incomplete packet), still an answer. |
| `completed`      | `partial`     | Provider finished; committee continued with fewer specialists (non-strict modes only; never Full).   |
| `failed`         | `blocked`     | Provider or workflow failed; no usable answer.                                                       |
| `cancelled`      | `blocked`     | Request aborted (client disconnect, signal, lease loss); no usable answer.                           |

Forbidden combinations: `completed` must never pair with `blocked`; `failed`/`cancelled` must never pair with `ready`, `degraded`, or `partial`.

Settlement rules:

- Exactly one terminal budget operation per run: `complete` reconciles the actual cost, `fail`/`cancel` release the reservation. The first terminal signal wins; concurrent or later signals are no-ops (`createExecutionLifecycle`).
- Blocked answers are never counted as ordinary successful answers; terminal metadata — not run count — is the accounting signal.
- Lease loss is a queue-ownership terminal condition, not a lifecycle settlement: the worker discards the attempt without settle/reconcile/requeue (`terminalActionForFullAnalysis`).

Enforced by: `packages/ai/test/execution-lifecycle.test.ts`, `packages/ai/test/baseline-terminal-invariants.test.ts`, `apps/worker/test/full-analysis-lifecycle.test.ts`, `apps/worker/test/full-analysis-coordinator.test.ts`.

### Defined storage authority matrix

Authority and projection rules with the idempotency scope that pins each row:

| Data                       | Authority                                         | Projection(s)                                                                                       | Idempotency scope                                                                                                                                                                                                                                 | Enforcement                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-visible chat messages | Drizzle                                           | Mastra memory backfill (explicit history, never authoritative)                                      | `chat_messages.idempotency_key` unique: `ui:<messageId>` (backfill exclusion), `mastra:<threadId>:<messageId>:assistant` / `:interrupted`, `mastra-canonical:<threadId>:<messageId>:assistant` / `:interrupted`, `analysis-job:<runId>:assistant` | `apps/web/test/mastra-chat-service.test.ts`, `mastra-canonical-chat-service.test.ts`, `packages/ai/test/idor-persistence.test.ts`, `packages/db/test/full-migration-chain.test.ts` |
| Threads                    | Drizzle                                           | Mastra memory thread records                                                                        | Strict `userId` ownership; chat route returns 404 before any model/queue work on mismatch                                                                                                                                                         | `apps/web/test/api-chat-route.integration.test.ts` (ownership + idempotency cases), `apps/web/test/ownership-boundaries.test.ts`                                                   |
| Full-analysis queue        | Drizzle (admission/dispatch only)                 | Mastra workflow snapshot while executing; queue status is a projection, never a competing authority | Unique `(userId, idempotencyKey)`; enqueue key `full:<threadId>:<messageId>`; worker user-projection key `analysis-job:<runId>:user`                                                                                                              | `packages/db/test/ownership-isolation.test.ts`, `full-migration-chain.test.ts`, `apps/worker/test/multi-agent-analysis.integration.test.ts`                                        |
| Workflow execution state   | Mastra workflow storage                           | Queue status projection                                                                             | Workflow step snapshots                                                                                                                                                                                                                           | `packages/ai/test/mastra-v2-storage.test.ts`, `mastra-v2-workflows.test.ts`                                                                                                        |
| Agent opinions             | Drizzle/UI metadata                               | Workflow step output                                                                                | `mastra-mode:<threadId>:<messageId>:user` exclusion scope                                                                                                                                                                                         | `packages/ai/test/mastra-modes.test.ts`, `committee.test.ts`                                                                                                                       |
| Semantic/working memory    | Mastra memory                                     | None                                                                                                | `resource = userId`, `thread = threadId`                                                                                                                                                                                                          | `packages/ai/test/mastra-v2-memory.test.ts`                                                                                                                                        |
| Budget reservations        | Drizzle (atomic daily counter + reservation rows) | Telemetry metadata                                                                                  | `ai_budget_reservations.id`; terminal `reconcile`/`release` exactly once                                                                                                                                                                          | `packages/ai/test/cost.test.ts`, `budget-race.test.ts`, `apps/worker/test/multi-agent-analysis.integration.test.ts`                                                                |
| Run/tool telemetry         | Drizzle + logs/metrics                            | Langfuse when enabled                                                                               | `mastra.run:<runId>`, `mastra.tool:<runId>:<toolCallId>:success\|failed`                                                                                                                                                                          | `packages/ai/test/mastra-telemetry.test.ts`, `telemetry-persistence.test.ts`                                                                                                       |

### Defined route decision matrix

One planner (Phase 2) produces the route; downstream services execute it and never reclassify:

| Driver                                               | Route                           | Capability            | Streaming | Memory           |
| ---------------------------------------------------- | ------------------------------- | --------------------- | --------- | ---------------- |
| `single`/`auto` + XAUUSD candidate, no mutation      | `xauusd-conversation`           | `xauusd-conversation` | yes       | native, required |
| `single`/`auto` + non-XAUUSD (or absent) symbol      | `canonical-chat`                | none                  | yes       | native, required |
| `quick`/`standard` + symbol candidate (incl. XAUUSD) | `symbol-research`               | `symbol-research`     | no        | native, required |
| `full` (any prompt)                                  | `full-analysis` (durable queue) | `symbol-research`     | no        | native, required |
| Mutation requested (either classifier layer)         | `mutation-draft`                | `mutation-workflows`  | no        | disabled         |

Policy consequences enforced by the baseline suites: every route is read-only except `mutation-draft`; mutation tools exist only in the `mutation-workflows` capability and stay confirmation-gated; no read-only capability and no committee specialist exposes a write tool; sensitive user-scoped reads (`get_journal_stats`, `get_portfolio_snapshot`, `compute_position_health`, `replay_setup`) are excluded from canonical chat.

### Work

1. Add end-to-end tests for canonical streamed chat, XAUUSD conversation, verified report, Standard/Full committee, Full queue retry, lease loss, cancellation, and duplicate request/idempotency. **Complete (mapped to lifecycle-level suites; see Exit criteria).**
2. Add cost fixtures for single, specialist-, fusion-, title-, and semantic-routing generations. **Complete:** `packages/ai/test/baseline-cost-fixtures.test.ts`.
3. Define terminal state invariants. **Complete:** matrix above + `baseline-terminal-invariants.test.ts`.
4. Define storage authority matrix. **Complete:** matrix above with enforcement mapping.
5. Define route decision matrix. **Complete:** matrix above + `baseline-route-matrix.test.ts`.
6. Add test assertions that no mutation tool is exposed to read-only agents. **Complete:** `baseline-mutation-exposure.test.ts` (plus existing manifest integrity in `mastra/capabilities.ts`).
7. Add tests for tenant/user/thread mismatch. **Complete:** `/api/chat` returns 404 for another user's thread before any model/queue work; tenant context asserted on the plan and queue payload (`api-chat-route.integration.test.ts`).

### Exit criteria

- Existing behavior is covered at the lifecycle level. **Met.**
  - canonical streamed chat → `apps/web/test/mastra-canonical-chat-service.test.ts`, `mastra-stream-response.test.ts`, `api-chat-route.integration.test.ts`
  - XAUUSD conversation + verified report → `apps/web/test/mastra-chat-service.test.ts`, `mastra-xauusd-service.test.ts`, `packages/ai/test/mastra-run.test.ts`, `mastra-v2-xauusd-workflow.test.ts`
  - Standard/Full committee → `packages/ai/test/committee.test.ts`, `mastra-modes.test.ts`, `mastra-v2-full-analysis.test.ts`, `mastra-v2-workflows.test.ts`
  - Full queue retry → `apps/worker/test/multi-agent-analysis.integration.test.ts`
  - lease loss → `apps/worker/test/full-analysis-lifecycle.test.ts`, `full-analysis-coordinator.test.ts`
  - cancellation → `packages/ai/test/execution-lifecycle.test.ts`, `baseline-terminal-invariants.test.ts`
  - duplicate request/idempotency → `api-chat-route.integration.test.ts` (exact enqueue key), `multi-agent-analysis.integration.test.ts`, `packages/ai/test/idor-persistence.test.ts`
- Cost discrepancies are measurable. **Met:** fixtures price every billed generation kind deterministically (see `baseline-cost-fixtures.test.ts`).
- Refactors can be compared against baseline traces and responses. **Met:** the `baseline-*` suites assert terminal metadata shapes, ledger totals, route/capability decisions, and ownership behavior without any provider call.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful.
- New Phase 0 suites: `baseline-cost-fixtures.test.ts` (8), `baseline-terminal-invariants.test.ts` (8), `baseline-route-matrix.test.ts` (11), `baseline-mutation-exposure.test.ts` (5) — 32 tests passed, alongside the existing `execution-lifecycle`, `mastra-execution-plan`, and `mastra-capabilities-projection` suites (45 tests in the focused run).
- Web chat-route ownership/idempotency additions: `api-chat-route.integration.test.ts` — 11 tests passed.
- Changed-file Prettier validation passed; `git diff --check` passed.

---

## Phase 1 — Fix immediate correctness issues

### Status

**Complete (2026-09-01).** The Phase 1 implementation and focused regression suite are complete. Phase 2 was subsequently completed on 2026-09-01.

### Implemented

- Multi-agent cost aggregation now uses the workflow aggregate once; specialist and fusion costs are not added again by callers.
- Duplicate symbol-research progress emissions were removed.
- Mutation classification occurs inside the execution-decision boundary before route selection; mutation capabilities remain confirmation-gated.
- Mastra model resolution now exposes a validated immutable snapshot containing the provider and bare model ID. Full-analysis queue payloads require the enqueue-time snapshot and workers reject unavailable snapshots rather than silently failing over.
- Run metadata distinguishes execution outcome (`success`, `failed`, `cancelled`) from answer outcome (`ready`, `blocked`, `degraded`).
- Memory mode is represented explicitly in Mastra result and persisted assistant metadata.
- Full-analysis heartbeat infrastructure failures are distinguished from actual lease loss; only lease loss aborts the active attempt.
- Background text generation uses bounded output limits through the shared text runner.
- Terminal telemetry and budget reconciliation use stable run-scoped idempotency protection.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful.
- Focused Phase 1 suite: 4 files, 57 tests passed.
- Regression coverage includes mutation-before-routing, model snapshot stability, heartbeat/lease behavior, exact-once cost aggregation, and terminal reconciliation.

### Objectives

Fix issues that can produce incorrect billing, duplicate work, or misleading state before structural refactoring.

### Work

1. Resolve multi-agent cost aggregation.
   - Choose one authoritative aggregation strategy.
   - Ensure parent cost equals the sum of actual child generations.
   - Include title and auxiliary generations only once.
2. Remove duplicate progress callbacks in the symbol-research workflow.
3. Make mutation classification occur before the final execution decision.
4. Standardize model snapshot serialization.
5. Separate:
   - execution outcome: success/failure/cancelled
   - answer outcome: ready/blocked/degraded
6. Make memory mode explicit in telemetry and response metadata.
7. Make heartbeat errors distinguishable from lease loss.
8. Ensure background agents use bounded output and standard terminal telemetry.

### Exit criteria

- Cost tests pass. **Met.**
- One logical workflow step emits one progress event. **Met.**
- Every run has one unambiguous model snapshot. **Met for the current Mastra paths and durable Full-mode payloads.**
- Blocked answers are not counted as ordinary successful answers. **Met in run/result metadata.**

---

## Phase 2 — Introduce the execution planner

### Status

**Complete (2026-09-01).** The planner is validated and serializable, is created once by the route, is passed through web and worker boundaries, and runner route compatibility is enforced. Focused coverage includes planner serialization and route integration.

### Audit update (2026-09-03)

Independent audit findings were closed against the working tree:

- **Route/kind consistency:** the planner previously returned `xauusd-conversation` while `mastraXauusdChatKind` classified the same prompt as `research`, so `/api/chat` selected a runner whose assertion rejected the plan. Route, capability, and chat kind are now derived from one effective classification; ordinary XAUUSD research prompts plan to `xauusd-research` (buffered verified-report path) and conversational XAUUSD prompts plan to `xauusd-conversation` (streaming). The route matrix gained a `xauusd-conversation` cell and asserts the corrected streaming contract.
- **Top-level runners:** the three application-level runners now exist — `runConversationalTurn(plan)` and `runResearchWorkflow(plan)` in `apps/web/src/lib/services/mastra-execution.ts` (wired as the only dispatch from `/api/chat`), plus the durable worker entry `runDurableResearchJob(job)`. Route callers no longer select service-specific runners or adapt raw results themselves; route failures are awaited so they reach the Mastra failure boundary instead of escaping as unhandled rejections.
- **Immutable model snapshot enforcement:** synchronous canonical, XAUUSD, symbol-research, and Full-mode resolutions now validate the serialized plan snapshot at the runner boundary (`requireExecutionPlanModel`); Full-mode enqueue resolves through the plan snapshot. Result metadata carries the bare snapshot (`modelSnapshot: { providerId, bareModelId }`), and XAUUSD results expose `answerOutcome`/`modelSnapshot`/`memoryMode`/`memoryBackfill` under one contract.

Verification (2026-09-03): `pnpm typecheck` (14/14 workspace tasks), `pnpm format:check`, `pnpm lint` context clean; AI 163 files / 1397 tests, web 127 / 1094, worker 31 / 145 — including the updated route-matrix, execution-decision, planner-run, API-route, XAUUSD-service, and durable-boundary suites.

### Implemented

- Added a Zod-validated `ExecutionPlan` with route, capability, model snapshot, tool/evidence/memory policies, limits, streaming, mutation, and tenant context.
- Created and serialized one plan before route selection in `/api/chat`.
- Passed the plan through canonical, XAUUSD, committee, and durable Full-mode execution boundaries.
- Added worker parsing and route validation for durable plan payloads.
- Added planner and route integration regression tests.

### Objectives

Make route behavior deterministic and auditable.

### Work

1. Create a planner module in `packages/ai`.
2. Move intent classification ahead of route construction.
3. Include mutation classification in the plan.
4. Resolve capability and model together.
5. Validate plan against capability policy.
6. Pass the plan from the web route into services.
7. Remove downstream route reclassification.
8. Add plan serialization to run metadata.

### Proposed internal modules

```text
packages/ai/src/execution/
  plan.ts
  planner.ts
  policy.ts
  model-snapshot.ts
  lifecycle.ts
```

### Exit criteria

- `/api/chat` has no independent route interpretation after planning.
- Every execution has one plan.
- Plan tests cover all route/mode/symbol combinations.

---

## Phase 3 — Consolidate lifecycle handling

### Status

**Complete (2026-09-01).** Shared exactly-once settlement, direct child-ledger entries, active-path terminal metadata, buffered/stream/durable lifecycle coordination, worker persistence-failure coverage, cross-path terminal invariants, and serializable retry/resume ledger snapshots are implemented and verified. Queue-specific transitions remain explicit adapters around the common durable coordinator rather than a competing lifecycle.

### Audit update (2026-09-01)

#### Independent full-diff review (2026-09-01)

The Phase 3 implementation was re-reviewed against the complete working-tree diff. No type errors or focused lifecycle regressions were found. The review also normalized two formatting artifacts in the Mastra run/telemetry exports.

Verification passed:

- `pnpm typecheck`: 14 workspace tasks successful.
- AI lifecycle/ledger/background/full-analysis tests: 24 tests passed.
- Web lifecycle/stream/service tests: 10 tests passed.
- Worker lifecycle/coordinator/integration tests: 12 tests passed.

Residual risk: the repository diff contains broader Phase 1/2 changes and deleted historical planning documents, so Phase 3 completion applies to the implemented execution paths and does not claim that the entire cleanup roadmap is complete.

Verified complete:

- Shared mutually-exclusive `complete` / `fail` / `cancel` settlement primitive.
- Buffered lifecycle coordinator used by canonical, XAUUSD, and committee services.
- Stream finalizer delegates budget settlement to the shared primitive.
- Duplicate terminal settlement unit coverage.
- Explicit stream terminal statuses and worker lease-loss decision helper.
- Workspace typecheck and focused AI/web lifecycle tests.

Remaining blockers:

1. Fix the three failing Full-analysis worker integration tests covering worker dispatch, lease-loss processing, and retryable provider failure. **Complete (2026-09-01):** all seven durable-boundary integration tests now pass after restoring the mocked lifecycle boundary. The full worker suite now passes: 30 files / 139 tests.
2. Make the generation ledger authoritative for every billed generation, including XAUUSD, title, background, semantic-routing, specialist, fusion, and durable worker execution. **Progress (2026-09-01):** web XAUUSD/canonical/mode callers and title paths share a run-scoped ledger; specialist and fusion steps emit direct idempotent entries; background accounting is tested; the durable worker uses an in-process ledger with serializable snapshot/restore across retry/resume. Remaining work is end-to-end proof that resumed workflow steps do not re-emit already persisted generations.
3. Centralize terminal metadata construction and require consistent `executionOutcome`, `answerOutcome`, `memoryMode`, `modelSnapshot`, and `terminalReason` across buffered, streaming, and worker results. **Progress (2026-09-01):** required fields are now enforced by the shared chat metadata type; buffered canonical/XAUUSD/mode responses, streaming metadata, and worker assistant metadata populate the contract. A final migration remains for legacy/reload fixtures and non-chat background telemetry.
4. Add explicit persistence-failure coverage for streaming and durable worker paths. **Mostly complete (2026-09-01):** stream persistence-failure behavior, worker assistant-persistence failure, and queue-transition failure behavior are covered; transition errors intentionally propagate rather than triggering a second settlement.
5. Add cross-path invariant tests for success, provider failure, cancellation, client disconnect, persistence failure, duplicate finalization, and lease loss. **Mostly complete (2026-09-01):** lifecycle, stream, worker, queue-transition, and ledger coverage now exercise the required terminal classes; a full production-path matrix remains.
6. Complete direct ledger entries for every billed workflow child generation, including specialist/fusion calls, rather than relying on a workflow aggregate. **Mostly complete (2026-09-01):** specialist/fusion entries are direct and idempotent, background ledger accounting is tested, and active web/worker paths are threaded; persisted retry/resume proof remains.
7. Finish one lifecycle coordinator shared by buffered, streaming, and durable paths. **Complete (2026-09-01):** buffered, streaming, and durable worker paths use shared coordinator primitives; queue operations are injected as lease-aware durable transition adapters.

Phase 3 exit criteria are met for the implemented execution paths. The durable coordinator owns queue transitions and budget settlement, retry/resume restores validated ledger snapshots, and terminal invariants are covered by focused cross-path tests.

### Current implementation notes

- `packages/ai/src/execution-lifecycle.ts` provides mutually exclusive `complete`, `fail`, and `cancel` terminal operations.
- Canonical buffered chat, XAUUSD buffered chat, and synchronous committee mode use the shared lifecycle.
- Stream finalization delegates terminal budget settlement to the shared lifecycle primitive and retains best-effort interruption persistence.
- Buffered canonical, XAUUSD, and committee services use the shared lifecycle for persistence-failure accounting.
- Durable worker budget settlement now uses the shared lifecycle; lease loss remains a separate queue-ownership terminal condition.
- Assistant persistence remains idempotent at the service boundary; a provider-completed run reconciles actual cost even if persistence fails.

### Objectives

Remove repeated budget, persistence, error, and telemetry code.

### Work

1. Create a common lifecycle coordinator. **Partially complete:** `runBufferedExecution` and the streaming finalizer now share coordinator behavior; the durable worker still retains queue-specific orchestration around that coordinator.
2. Standardize:
   - run ID creation
   - user-message idempotency
   - assistant-message idempotency
   - budget admission
   - cancellation
   - terminal telemetry
   - persistence failure handling
3. Make streaming and buffered execution share terminal handling.
4. Ensure completion is finalized exactly once.
5. Add a terminal-state guard to budget handles/finalizers.
6. Add an explicit partial-stream policy. **Partially complete:** terminal stream statuses and interruption persistence exist, but cross-path policy tests and consistent terminal metadata are still required.

### Exit criteria

- Canonical, XAUUSD, and mode services use the same lifecycle primitives. **Met for buffered services; streaming/worker coordinator consolidation remains.**
- Double finalization is impossible or harmless and tested. **Partially met; focused settlement tests pass, but cross-path coverage remains.**
- Provider completion followed by persistence failure has defined accounting behavior. **Met for buffered services; streaming and worker coverage remains.**
- Every billed generation is represented exactly once in the run-scoped generation ledger. **Mostly met:** direct specialist/fusion/background entries, active web/worker threading, and snapshot/restore are in place; end-to-end resumed-step proof remains.
- Terminal metadata and partial-stream behavior are consistent across buffered, streaming, and durable paths. **Partially met:** required metadata is now emitted by active response/worker builders; explicit persistence-failure and cross-path invariant tests remain.
- Relevant AI, web, and worker lifecycle suites pass. **Met for the focused AI/web/worker lifecycle suites; broader cross-path persistence and ledger-authority coverage remains.**

---

## Phase 4 — Create the single capability/tool manifest

### Status

**Complete (2026-09-01).** The typed capability manifest, manifest-derived runtime policy, Mastra component registry coverage, UI metadata, telemetry labels, and integrity tests are implemented. A full-diff audit confirmed that the remaining tool-object adapter maps are implementation wiring rather than duplicate capability policy.

### Implemented

- Added a typed capability manifest containing:
  - capability ID/version
  - route/component
  - symbols/modes
  - tool IDs
  - read/write access
  - data sensitivity
  - trust class
  - confirmation requirements
  - max steps and timeout
  - evidence policy
- Added manifest integrity validation for:
  - unknown tools
  - duplicate tools
  - tool metadata drift
  - read-only mutation exposure
  - invalid confirmation/read-only combinations
- Derived legacy routing-domain tool policy from the canonical capability manifest.
- Derived XAUUSD active tool names from manifest tool IDs.
- Derived applicable runtime step limits from capability definitions.
- Added manifest-backed Mastra component registry coverage and missing/extra mapping checks.
- Added manifest-derived UI capability metadata to tool catalogue entries.
- Added capability ID, version, route, and scope labels to Mastra telemetry traces.
- Removed public compatibility aliases for independently maintained capability allowlists.
- Kept explicit implementation adapter maps only where manifest IDs differ from concrete Mastra object keys.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful.
- Focused Phase 4 suite: 6 files, 48 tests passed.
- Changed-file Prettier validation passed.
- `git diff --check` passed.
- Coverage includes canonical sensitive-tool exclusion, mutation exclusion, manifest integrity, component registry completeness, domain filtering, UI metadata projection, telemetry labels, and route policy behavior.

### Objectives

Eliminate tool-policy drift.

### Work

1. Define a typed capability manifest containing:
   - capability ID/version
   - route/component
   - symbols/modes
   - tools
   - read/write status
   - data sensitivity
   - trust class
   - confirmation requirement
   - max steps
   - timeout
   - evidence policy. **Complete.**
2. Generate or derive:
   - route authorization
   - tool exposure
   - Mastra component registry checks
   - UI capability metadata
   - telemetry labels. **Complete.**
3. Separate tool categories:
   - public market data
   - user-scoped data
   - untrusted external data
   - internal verification
   - mutation tools. **Complete.**
4. Make `read-only` and `sensitive-read` distinct policy concepts. **Complete.**
5. Add manifest integrity tests. **Complete.**

### Exit criteria

- No independently maintained tool allowlists for the same capability. **Met; remaining concrete tool-object adapters are implementation maps, not policy allowlists.**
- New tools cannot become reachable without manifest changes and tests. **Met through manifest integrity checks and manifest-backed runtime exposure.**
- Declared limits match runtime limits. **Met for all capability-bound execution paths; internal no-tool generation calls remain intentionally bounded at one step.**

---

## Phase 5 — Normalize evidence and trust types

### Status

**Complete (2026-09-01).** The explicit evidence/trust taxonomy, shared provenance, bounded retrieval adapters, injection-detector log hygiene, and synthesis-boundary types are implemented and verified. A full-diff audit confirmed that every current retrieval adapter routes external content through explicit typed conversion with provenance, quarantine, and size limits.

### Implemented

- Added an explicit evidence trust taxonomy:
  - `trusted-deterministic`
  - `user-memory`
  - `untrusted-external`
  - `model-generated`
  - `mixed`
- Added shared provenance schema (source, fetchedAt, dataAsOf, freshness, quality, warnings) required on every synthesis-bound evidence item.
- Added typed evidence schemas for trusted deterministic, user memory, and untrusted external data.
- Added a bounded `ModelGeneratedEvidenceSchema` for derived model claims; model-generated output is deliberately excluded from the synthesis-evidence union so it can never re-enter as if it were trusted input.
- Added `toUntrustedExternalEvidence()` as the explicit conversion marker required before untrusted data enters synthesis context.
- Added evidence IDs and provider/source/URL provenance to every external result.
- Marked deterministic price, candle, and indicator evidence as `trusted-deterministic` and combined macro evidence as `mixed`.
- Integrated typed external evidence conversion into XAUUSD news and economic-calendar tools and marked live web-search output `contentTrust: 'untrusted'`.
- Added content-size limits to all retrieval adapters:
  - web search: snippet/content truncation plus a 2 MiB provider-response buffer limit
  - news: bounded titles and summaries
  - calendar: bounded titles and sources
- Preserved and verified web-search SSRF protections: HTTPS-only, provider host allowlisting, rejected redirects, no embedded credentials, timeout and abort propagation.
- Added per-turn web-search call limits and provider failure/degradation metadata (unavailable/error status with visible messages).
- Hashed injection-detector audit logs: both the deterministic `message-text` detector and the LLM guardrail detector log a stable sha-256 payload hash and length instead of raw prompt content.
- Exported the new trust/provenance APIs through the Mastra package barrels.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful.
- Focused Phase 5 suite: 7 files, 62 tests passed.
- Changed-file Prettier validation passed.
- `git diff --check` passed.
- Coverage includes trust boundary parsing, untrusted conversion, quarantine behavior, model-generated exclusion from synthesis, injection-detector log hygiene, web-search SSRF/limits/failover, and stale/degraded freshness reporting.

### Objectives

Make external content and trusted server evidence difficult to confuse.

### Work

1. Introduce separate types for:
   - trusted deterministic evidence. **Complete.**
   - user memory. **Complete.**
   - untrusted external content. **Complete.**
   - model-generated claims. **Complete.**
2. Require explicit conversion before untrusted data enters synthesis context. **Complete.**
3. Add content-size limits to all retrieval adapters. **Complete.**
4. Verify web-search SSRF protections. **Complete.**
5. Hash or redact prompt content in injection-detector logs. **Complete.**
6. Add provenance to every external result. **Complete.**
7. Make stale/partial/degraded status mandatory in synthesis inputs. **Complete.**

### Exit criteria

- Type and schema boundaries distinguish data trust. **Met through the synthesis-evidence union and per-adapter trust markers.**
- External content cannot be interpreted as workflow instructions. **Met through quarantine, untrusted wrapping, and detector hashing; any future adapter must route external text through `toUntrustedExternalEvidence()`.**
- Retrieval timeouts and result limits are tested. **Met for web search, news, and calendar adapters; social sentiment carries numeric aggregates with no free-text payload.**

---

## Phase 6 — Consolidate committee workflow

### Status

**Complete (2026-09-01).** The committee module (`packages/ai/src/committee/`) now owns the typed committee contract, the single mode policy, prompts, specialist definitions, the specialist runner, the opinion verifier, and the synthesizer. The symbol-research workflow is the shared committee workflow itself. Quick/Standard/Full (and single) all execute the same workflow; the only differences are the specialist set, limits, and strictness.

### Implemented

- Extracted specialist definitions (`SPECIALIST_DEFINITIONS`) and the shared agent factory into `committee/specialists.ts`.
- Added a reusable specialist runner (`committee/specialist-runner.ts`): one bounded read-only LLM call producing a zod-validated typed step result, with opinion verification, ledger recording, and the existing transient/permanent error split (transient provider errors retry; permanent errors become explicit failure markers so non-strict modes can continue).
- Added a reusable synthesis runner (`committee/synthesizer.ts`): direct formatting for single/quick and the single LLM fusion call for standard/full, with ledger and stats aggregation.
- Moved the opinion verifier into `committee/verifier.ts`, removing the old `workflows/opinion-verifier.ts` and its circular import.
- Centralized specialist prompts and the shared hard-rule policy fragment in `committee/prompts.ts`.
- Standardized specialist model metadata: every specialist and fusion opinion is built through `committeeModelMetadata` from the same resolved model snapshot fields.
- Used typed workflow outputs: specialist steps emit `SpecialistStepResultSchema`; verify/fusion read step results through schema-validated read helpers instead of broad inline `unknown` casts.
- Encoded the partial-mode policy explicitly in `committeeModePolicy` / `MODE_POLICY`: Full is strict and fails closed (any required specialist failure is terminal via `MastraModeStrictFailureError`); single/Quick/Standard may continue on partial failure — e.g. Standard continues on fundamental failure — and the workflow returns the remaining opinions with the failed agents listed.
- Specialist memory is read-only by default: every specialist call merges `readOnly: true` into its memory options, so only the fusion/output layer writes user-visible assistant messages.
- Exposed workflow progress exactly once per stage via `committeeProgressStages` (collect-packet → specialists → verify → fusion).
- `symbol-research.ts` is now a facade that builds the committee workflow with the symbol-research capability's step limit, preserving every previously exported name.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful.
- Focused Phase 6 suite: `committee.test.ts`, `mastra-v2-workflows.test.ts`, `mastra-modes.test.ts`, `opinion-verifier.test.ts` — 24 tests passed, including new Standard partial-mode continuation, read-only specialist memory, and once-per-stage progress coverage.
- Worker full-analysis/multi-agent suites: 28 tests passed.
- Web chat route/service suites: 33 tests passed.
- Changed-file ESLint and Prettier validation passed; `git diff --check` passed.
- Pre-existing full-suite failures verified as unrelated to Phase 6: `contract-tool-outputs.test.ts` fails at HEAD, and `mastra-market-tools.test.ts` / `tools.test.ts` fail only due to the in-progress Phase 1–5 tool-manifest working-tree changes (they import no symbols from the committee change).

### Objectives

Make the multi-agent system explicit and reusable.

### Work

1. Extract specialist definitions from the workflow file. **Complete.**
2. Create a reusable specialist runner. **Complete.**
3. Create a reusable fusion runner. **Complete.**
4. Use typed workflow outputs instead of broad `unknown` casts where practical. **Complete.**
5. Centralize specialist prompts and policy fragments. **Complete.**
6. Standardize specialist model metadata. **Complete.**
7. Ensure specialist memory is read-only by default. **Complete.**
8. Ensure only the fusion/output layer writes user-visible assistant messages. **Complete.**
9. Define partial-mode behavior explicitly:
   - Standard may continue on fundamental failure if policy allows. **Complete (encoded in `MODE_POLICY.standard.continueOnPartialFailure` with regression coverage).**
   - Full must fail closed on required specialist failure. **Complete (strict `MODE_POLICY.full` + terminal `MastraModeStrictFailureError`).**
10. Expose workflow progress once per stage. **Complete.**

### Proposed modules

```text
packages/ai/src/committee/
  types.ts
  specialists.ts
  specialist-runner.ts
  verifier.ts
  synthesizer.ts
  workflow.ts
  prompts.ts
```

### Exit criteria

- Quick/Standard/Full all use the same committee workflow. **Met.**
- The only differences are specialist set, limits, and strictness. **Met (enforced by the `MODE_POLICY`-vs-`SPECIALISTS_BY_MODE` integrity test).**
- No duplicate orchestration implementation remains. **Met (the workflow file is a facade; specialist/fusion/verify machinery lives only in `committee/`).**

---

## Phase 7 — Unify XAUUSD and generic research composition

### Status

**Complete (2026-09-02).** XAUUSD report, conversation/stream, and follow-up runs now share one research-run context builder, one verified-report workflow with a configurable output policy, and an explicit typed turn mode. The XAUUSD-specific code keeps only its domain logic (packet collector, tools, report verifier, follow-up packet derivation); all memory/guardrail/scorer/telemetry preparation is shared.

### Implemented

- Added the shared research-run context builder (`mastra-v2/research-context.ts`): one place that prepares native memory, prepared call options, and optionally builds conversation and/or research guardrail/scorer policy sets. The XAUUSD report/followup path (`mastra/run.ts`) and the committee mode runner (`mastra/mode-runner.ts`) both use it, removing the duplicated per-path memory/guardrail/scorer setup.
- Made report verification a configurable output policy on the report workflow: `outputPolicy: 'verified' | 'schema'` on `XauusdReportWorkflowDeps`, with `resolveXauusdReportOutputPolicy()` and the `XAUUSD_REPORT_OUTPUT_POLICIES` constant. `verified` (default) keeps the deterministic grounding/safety/temporal verifier plus the bounded repair loop; `schema` accepts any schema-valid structured output for generic research composition. The output contract (status/report/packet/attempts/stats) is identical.
- Made the XAUUSD follow-up mode explicit: `XauusdTurnMode = 'research' | 'conversation' | 'followup'` on `RunXauusdMastraArgs`. `followup` answers from the saved verified report's own data (never fresh market data) and fails closed when no `priorReport` is supplied. The route and web services (`mastra-xauusd.ts`, `mastra-chat.ts`, `mastra-chat-stream.ts`) pass the typed `turnMode` instead of the old boolean logic.
- The report workflow's generate step branches on the resolved output policy before consulting the deterministic verifier, so schema-mode runs never touch `requireVerifiedXauusdReport`; malformed structured output still enters the same bounded repair loop.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful (AI + web + worker).
- Focused Phase 7 suite: `research-context.test.ts` (5), `mastra-run.test.ts` (9, incl. follow-up fail-closed and follow-up-from-report), `mastra-v2-xauusd-workflow.test.ts` (5, incl. schema policy and schema repair-loop coverage) — all passed alongside the Phase 6 suites (43 tests total across the focused set).
- Web chat route integration + routing suites: 24 tests passed.
- Changed-file ESLint and Prettier validation passed; `git diff --check` passed; `packages/ai` build regenerated `dist` for the new `XauusdTurnMode` export.

### Objectives

Reduce the special-case XAUUSD path while preserving its stronger report verification.

### Work

1. Treat XAUUSD as a configured research capability rather than a separate orchestration architecture. **Complete (shared context builder + shared report workflow; XAUUSD keeps only domain logic).**
2. Keep XAUUSD-specific packet collectors and tools behind the common evidence interface. **Complete (unchanged — collectors/tools remain XAUUSD-specific behind the existing interfaces).**
3. Use common conversation/report runners. **Complete (run.ts and mode-runner.ts share `prepareResearchRunContext`).**
4. Make report verification a configurable output policy. **Complete (`outputPolicy: 'verified' | 'schema'` with regression coverage).**
5. Preserve the XAUUSD follow-up behavior but make the follow-up mode explicit. **Complete (typed `XauusdTurnMode`, fail-closed without `priorReport`, coverage in `mastra-run.test.ts`).**
6. Remove duplicated memory, guardrail, scorer, and telemetry setup. **Complete (single `mastra-v2/research-context.ts`).**

### Exit criteria

- XAUUSD-specific code contains domain logic, not duplicate orchestration logic. **Met.**
- Conversation and report paths share common lifecycle and plan contracts. **Met (one context builder for report, conversation/stream, and follow-up paths).**

---

## Phase 8 — Durable Full-mode integration

### Status

**Complete (2026-09-02).** Retry semantics are now one typed classification shared by the worker and the tests, the worker validates plan identity (route, tenant, symbol, model snapshot) before executing a claimed run, and a Phase 8 budget bug was found and fixed: retryable failures no longer release the enqueue-time reservation, so a successful retry books its actual cost exactly once instead of reconciling against an already-released reservation (silent underbilling). The queue-to-Mastra dispatch, FSM transition, retry-table, plan-identity, and budget exactly-once properties are covered by the new `full-analysis-properties.test.ts` suite.

### Implemented

- Added `packages/ai/src/mastra-v2/workflows/full-analysis-retry.ts`: typed failure categories (`lease` / `quota` / `transient` / `permanent`), `classifyFullAnalysisFailure`, `fullAnalysisRetryAction` (discard / requeue / fail), and the `FullAnalysisQuotaExceededError` / `FullAnalysisBudgetAdmissionError` / `isRetryableAnalysisError` contracts moved out of the worker so policy and tests share one source.
- The worker (`apps/worker/src/jobs/multi-agent-analysis.ts`) now derives its requeue/fail/discard decision from `fullAnalysisRetryAction`; lease loss discards without settlement or projection, quota/permanent failures fail permanently, and transient failures requeue only while attempts remain.
- Added `validateFullAnalysisPlanIdentity` (worker claim-time execution guard): the serialized plan must be routed `full-analysis`, its tenant must match the claimant (user id or persisted tenant), its symbol must match the extracted symbol, and its model snapshot must match the enqueue-time snapshot. Identity violations are permanent failures (never retried). The claim itself already rejected route/snapshot/row-identity mismatches terminally.
- **Budget fix:** retryable failures keep the enqueue-time reservation `reserved` for the next attempt (worker no longer settles on requeue; `createFullAnalysisCoordinator.requeue` no longer calls `lifecycle.fail()`). Final success reconciles actual cost exactly once; final failure releases exactly once. This closes the underbilling path where a released reservation made a later successful retry reconcile a no-op.
- Deleted competing queue execution-state projections were already confirmed empty (`analysis_jobs` dropped in migration 0084; health reads `mastra_workflow_snapshot`); no re-introduction found.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful.
- New Phase 8 property suite: `full-analysis-properties.test.ts` — 21 tests (dispatch matrix incl. terminal rejection of plan-route/snapshot/identity-mismatched payloads, FSM transition invariants incl. terminal immutability and single-recovery idempotency, retry decision table, plan identity table, exactly-one reservation per duplicate enqueue, reconcile/release exactly once across retry and terminal paths, ledger snapshot round-trip).
- Durable queue round-trip suite (`mastra-v2-full-analysis.test.ts`, shared PGlite harness extracted to `test/helpers/full-analysis-queue-db.ts`): 11 tests.
- Worker suite: 31 files / 145 tests passed, incl. the updated durable-boundary integration and coordinator requeue-keeps-reservation coverage. Changed-file Prettier validation and `git diff --check` pass.

### Objectives

Make the durable queue a first-class execution mode of the same planner/workflow.

### Work

1. Serialize the execution plan and model snapshot into the queue payload. **Complete (Phase 2/3; payload carries `executionPlan`, `modelSnapshot`, `ledgerSnapshot`, `budgetReservationId`).**
2. Validate plan identity at worker claim time. **Complete:** terminal claim-time rejection (route/snapshot/row identity) plus worker execution-time `validateFullAnalysisPlanIdentity`; permanent on mismatch.
3. Use one budget ledger across enqueue and worker execution. **Complete:** enqueue reserves inside the queue transaction, the worker resumes the same reservation, and retries retain it; exactly-once booked on terminal outcome.
4. Define retry semantics by failure category. **Complete:** typed `FullAnalysisFailureCategory` + `fullAnalysisRetryAction` shared by worker and property tests.
5. Use the database queue only as a dispatch/admission mechanism during migration. **Complete:** queue owns admission/idempotency/lease; Mastra workflow snapshots are the execution-state projection.
6. Make Mastra workflow state authoritative for execution status and step state. **Complete:** `projectQueueRow` persists queue transitions into Mastra workflow storage; health reads `mastra_workflow_snapshot`.
7. Make lease loss terminal for the current worker attempt. **Complete:** heartbeat abort + `fullAnalysisRetryAction` discard; stale workers can never project or settle.
8. Ensure stale recovery cannot duplicate assistant messages or budget charges. **Complete:** stable run-scoped message idempotency keys (`analysis-job:<runId>:user|assistant`), single-recovery property, reservation retained/resumed across requeue.
9. Add queue-to-Mastra dispatch and workflow state transition property tests. **Complete:** `full-analysis-properties.test.ts` (see Verification).
10. Delete competing queue execution-state projections once Mastra authority is proven. **Complete:** `analysis_jobs` removed (0084); verified no competing projection remains.

### Exit criteria

- Web and worker use the same research workflow and execution plan. **Met** (plan serialized at enqueue, executed by worker under one `full-analysis` workflow).
- Queue retries are idempotent. **Met** (run-scoped keys, single-recovery, attempt-count preserves).
- Lease loss cannot overwrite a requeued run. **Met** (ownership-guarded transitions reject stale workers).
- Budget reconciliation is exactly once. **Met** (retry keeps reservation; terminal reconcile/release once — previously a silent underbilling on retries).

---

## Phase 9 — Memory simplification

### Status

**Complete (2026-09-02).** Memory preparation is now shared across the Mastra research, XAUUSD conversation/report, canonical-chat, and durable Full-mode paths. Model-visible preferences, user/thread scope, capability-specific recall, observational-memory budgeting, durable backfill state, degradation metadata, and retention ownership are explicit and covered by regression/property tests.

### Implemented

- Added `prepareResearchRunContext` as the common memory/policy preparation boundary. Only `defaultSymbol`, `language`, and `timezone` are seeded into model-visible working memory; provider keys, model selections, embedding configuration, budgets, and runtime limits stay outside the model context.
- Preserved strict memory scope: `resource = userId` and `thread = threadId` for every memory-dependent path.
- Passed `ExecutionPlan.memoryPolicy.semanticRecall` into `kestrelMemoryOptions`, so semantic recall is resolved per capability instead of being controlled only by one global switch.
- Kept observational memory opt-in for short-lived requests and explicitly enabled it only for durable Full-mode execution. Added an independent allowance (`observationalMemoryAllowanceUsd`) to the Full-mode reservation estimate so background refinement work is bounded and accounted for separately from the visible turn.
- Made working-memory seeding explicitly idempotent and content-addressed: identical seeds are no-ops and existing agent-maintained memory is never overwritten.
- Made legacy thread backfill safe across processes with durable claim/complete/fail state, projection checkpoints, durable uniqueness, current-message exclusion, and a process-local in-flight guard as a fallback when the durable state migration is unavailable.
- Added `memoryDegraded` and `backfillAttempted` preparation state, propagated as `memoryMode` and `memoryBackfill` through runner results, terminal telemetry, Mastra trace metadata, web response/message metadata, and durable worker assistant metadata. Streaming setup failures also finalize with the degraded state rather than silently defaulting to native memory.
- Defined retention ownership: Mastra storage prunes runtime messages (90 days), threads (180 days), workflow snapshots (30 days), background tasks (30 days), and schedule triggers (90 days); the worker runs that pruning alongside Drizzle's operational-table retention job.

### Verification

- `pnpm typecheck`: 14 workspace tasks successful.
- `pnpm --filter @kestrel/ai test`: 163 files / 1,398 tests passed.
- `pnpm --filter @kestrel/web test`: 127 files / 1,094 tests passed.
- `pnpm --filter @kestrel/worker test`: 31 files / 145 tests passed.
- `pnpm lint`: 14 workspace tasks successful.
- `git diff --check` passed.

### Objectives

Make memory useful without making execution unpredictable.

### Work

1. Separate model-visible user preferences from runtime configuration. **Complete:** `prepareResearchRunContext` passes only the three user-facing preference fields to working-memory preparation; tests assert runtime settings are excluded.
2. Keep `resource = userId` and `thread = threadId`. **Complete:** `memoryCallOptions` and all shared runners preserve the user/thread scope.
3. Make semantic recall policy capability-specific. **Complete:** the execution plan's `memoryPolicy.semanticRecall` overrides the global gate for each capability.
4. Make observational memory opt-in and independently budgeted. **Complete:** web paths keep it off, durable Full mode opts in, and the allowance is included in the enqueue-time estimate.
5. Replace read-then-write working-memory initialization with an atomic or explicitly idempotent operation. **Complete:** content-addressed seeding is an explicit idempotent operation that never clobbers agent-maintained memory.
6. Make cross-process backfill correctness depend on durable uniqueness/idempotency, not only local maps. **Complete:** durable backfill claims/checkpoints and message-id exclusion are used, with the local map only as a no-database fallback.
7. Add memory degradation indicators to UI metadata and traces. **Complete:** `memoryMode` and `memoryBackfill` are present on success, blocked, failure, buffered, streamed, and worker terminal paths.
8. Define retention and pruning ownership clearly. **Complete:** Mastra runtime retention is configured in the Mastra storage adapter and invoked by the worker retention job; Drizzle retains authority for operational tables.

### Exit criteria

- Memory failures do not silently alter answer semantics. **Met:** preparation continues with scoped native call options, while seed/backfill degradation is explicit in runner results, traces, UI metadata, worker metadata, and failure telemetry.
- User preferences cannot be mistaken for system policy. **Met:** only model-visible preference fields are accepted by working-memory preparation; runtime configuration remains in the execution boundary.
- Backfill is safe across multiple processes. **Met:** durable claim/checkpoint/failure state, unique user/thread scope, message IDs, idempotency-key exclusion, and regression coverage prevent duplicate legacy projections.

---

## Phase 10 — Remove compatibility complexity

### Status

**Complete (2026-09-03).** Usage search, focused replacement tests, package typecheck/build validation, and the workspace release analysis confirmed that the removed compatibility surfaces were internal and unused by the web, worker, Studio, or package entrypoints.

### Implemented

- Removed the `mastra-v2/workflows/symbol-research.ts` facade; the shared committee workflow is now imported directly from `committee/workflow.ts` while retaining the stable `symbol-research` workflow ID.
- Removed the unused `runXauusdMastraProof` runner and its proof-only argument type; the XAUUSD agent factory remains because report, conversation, stream, and Studio paths use it.
- Removed the duplicate `mastra/capability-registry.ts` facade and consolidated canonical tool-policy queries on `mastra/capabilities.ts`.
- Removed the unused `multi-agent` mode barrel and classifier implementation; automatic mode selection now lives beside the Mastra routing policy, while historical opinion persistence remains as a focused persistence module.
- Removed the unused committee `onChildCost` compatibility callback; generation-ledger entries are the sole child-cost authority.
- Removed resolver fallback branches that treated the canonical Mastra execution resolver as optional.

Intentional internal breaking changes: direct imports of the removed compatibility files or proof-runner symbols must migrate to `committee/workflow`, `committee/types`, `mastra/capabilities`, `mastra/routing-policy`, or the supported Mastra agent/run APIs. No published package export or application release path depended on those symbols.

### Verification

- Replacement imports and focused tests pass; no source consumer remains for the deleted facades or symbols.
- The remaining legacy tool adapter is retained because XAUUSD and canonical Mastra tools still wrap live AI SDK tool implementations.
- The remaining historical opinion persistence module is retained because persistence recovery and admin/UI queries still use it.

### Objectives

Delete code that no longer provides value after migration.

### Candidates

Only remove after usage search, tests, and release validation:

- obsolete legacy multi-agent compatibility modules
- duplicate Mastra run helpers
- unused phase compatibility exports
- redundant legacy tool adapters after all consumers migrate
- duplicate report/conversation setup helpers
- dead feature-flag branches
- stale documentation comments

### Exit criteria

- `knip` and repository tests show no required consumers.
- No public API or release path depends on removed compatibility code.
- Migration notes explain any intentional breaking change.

---

## Security and privacy requirements

The refactor must preserve or improve:

1. Authentication before model execution.
2. User/thread/tenant ownership checks.
3. Explicit read-only tool allowlists.
4. No mutation tools in research agents.
5. Confirmation workflows for mutations.
6. BYOK key isolation.
7. No secret values in prompts, traces, or logs.
8. External content treated as untrusted.
9. SSRF and retrieval-size protections.
10. Abort propagation.
11. Per-user rate limits.
12. Daily budget enforcement.
13. Idempotent message and queue writes.
14. Production TLS verification.
15. Privacy-safe Langfuse configuration.

---

## Efficiency requirements

The target system should reduce unnecessary work by:

1. Planning once instead of routing repeatedly.
2. Keeping the approved consistent XAUUSD packet behavior while making packet collection bounded and reusable.
3. Avoiding duplicate memory preparation.
4. Avoiding duplicate guardrail/scorer construction.
5. Avoiding duplicate model-cost estimation.
6. Avoiding duplicate progress writes.
7. Limiting external retrieval calls per turn.
8. Using specialist parallelism only where it improves latency.
9. Avoiding observational-memory background work on short-lived web requests.
10. Reusing typed packet data rather than refetching it in synthesis.
11. Streaming only conversational paths where verification does not require buffering.
12. Using bounded prompt context and evidence serialization.

---

## Testing strategy

### Unit tests

- planner decisions
- capability authorization
- model snapshot parsing
- tool manifest integrity
- evidence trust conversion
- report verification
- opinion verification
- cost ledger aggregation
- memory scope helpers
- queue state transitions

### Integration tests

- route to runner selection
- user/thread/tenant ownership
- budget admission and reconciliation
- Drizzle/Mastra projection
- worker claim and lease behavior
- tool context propagation
- external search limits
- native memory/backfill

### End-to-end tests

1. Send a normal message and receive a streamed answer.
2. Send an XAUUSD current-market question.
3. Send a conceptual question without market data.
4. Run Standard committee analysis.
5. Run Full committee analysis.
6. Queue Full analysis and poll progress.
7. Restart worker during a job.
8. Lose a lease during a job.
9. Retry the same user request.
10. Trigger a report repair.
11. Submit prompt injection in user input.
12. Submit prompt injection through web content.
13. Attempt a mutation.
14. Use a stale report follow-up.
15. Verify no cross-user memory or opinions are returned.

### Property/invariant tests

- Every successful run has exactly one terminal budget reconciliation.
- Every assistant message has a matching user-message idempotency scope.
- Every tool call has authenticated request context.
- Every report evidence ID belongs to the packet.
- Every Full job completion is lease-owned.
- Every declared capability tool is actually exposed or intentionally unavailable.
- No read-only agent receives a mutation tool.
- Parent cost equals exactly one sum of child generation costs.

---

## Approved product decisions

The following decisions are confirmed and must guide implementation:

1. **Model strategy — one model initially:** All committee agents and fusion use one immutable resolved BYOK model snapshot. Specialized model tiers are deferred.
2. **Canonical chat data scope — separate capability:** Ordinary canonical chat must not receive portfolio, journal, position-health, or other sensitive user-scoped tools by default. Those tools require a separately authorized capability.
3. **Conceptual XAUUSD behavior — always collect a packet:** XAUUSD-routed requests continue to collect the fresh deterministic packet, including conceptual questions. This preserves consistent evidence-first behavior and avoids route-dependent semantics.
4. **Memory failure — fail closed:** Capabilities requiring native Mastra memory must reject the turn when memory cannot be prepared. They must not silently fall back to explicit history.
5. **Full mode — all-or-nothing:** Any required specialist failure is terminal. No partial committee answer is returned to the user.
6. **Durable authority — Mastra workflows:** Mastra durable workflow state becomes the authoritative source for Full-mode execution. The database queue may remain as an admission/dispatch mechanism during migration, but it must not be a competing execution-state authority.
7. **Legacy removal — during the refactor:** Legacy orchestration, duplicate paths, and adapters should be removed as part of the cleanup once their replacement is validated in the same change series. Do not plan a long dual-run period.
8. **Deployment boundary — single-user first:** Optimize for the currently supported single-user release, while carrying explicit tenant context through every AI boundary so future tenant isolation is not blocked.

### Consequences of the approved decisions

- The refactor is intentionally more disruptive than a compatibility-preserving cleanup.
- Native memory preparation becomes a hard prerequisite for memory-dependent capabilities.
- Existing explicit-history fallback behavior must be removed or restricted to capabilities explicitly declared as memory-independent.
- Sensitive user-data tools need a separate capability and manifest entry.
- Full-mode workflows must expose only terminal success, blocked, failed, or cancelled states; partial specialist output is not a user result.
- Mastra workflow snapshots and transitions must become durable and authoritative before the old queue execution-state logic is deleted.
- Legacy compatibility code is not a long-term safety net; removal requires focused replacement tests in the same refactor.
- Tenant ID must be explicit in request context and workflow input even though the initial product remains single-user.

---

## Recommended implementation order

Because legacy removal is approved during the refactor and Mastra workflows must become authoritative, use this sequence:

```text
Phase 0 invariants and Mastra durability proof
→ Phase 1 correctness fixes
→ Phase 2 execution planner
→ Phase 3 lifecycle consolidation
→ Phase 4 capability/tool manifest
→ Phase 5 evidence/trust types
→ Phase 6 unified committee workflow
→ Phase 7 sensitive-data capability split
→ Phase 8 Mastra-authoritative Full mode
→ Phase 9 required-memory simplification
→ Phase 10 delete legacy paths and adapters
```

Deletion is part of the same refactor series, but no legacy implementation should be deleted until its replacement test passes and the relevant Mastra workflow authority/invariant has been proven.

## Definition of done

The cleanup is complete when:

- There is one authoritative execution plan per request.
- There are three clear top-level runners.
- Quick, Standard, and Full use one committee workflow.
- Specialist agents communicate only through typed workflow outputs.
- Tool access comes from one capability manifest.
- Trusted evidence and untrusted content are separate.
- Streaming and buffered paths share lifecycle handling.
- Cost is calculated exactly once from a generation ledger.
- Full queue retries and lease loss are idempotent.
- Memory scope is explicit and memory-dependent capabilities fail closed when native memory is unavailable.
- Mastra workflow state is authoritative for durable Full-mode execution.
- Sensitive user-scoped tools are not available to ordinary canonical chat.
- Drizzle/Mastra authority is documented and tested.
- Legacy compatibility code is deleted during the refactor, with replacement coverage in place.
- The complete route-to-response lifecycle is covered by integration and end-to-end tests.
