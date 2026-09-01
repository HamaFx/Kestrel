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

| Data | Current authority | Secondary/projection use |
|---|---|---|
| User-visible chat messages | Drizzle | Mastra memory/backfill |
| Threads | Drizzle | Mastra memory thread records |
| Full-analysis queue | Drizzle | Mastra workflow snapshot |
| Workflow execution state | Mastra workflow storage | Queue status projection |
| Agent opinions | Drizzle/UI metadata | None or workflow output |
| Semantic/working memory | Mastra memory | None |
| Budget reservations | Budget/Drizzle layer | Telemetry metadata |
| Run/tool telemetry | Drizzle + logs/metrics | Langfuse when enabled |
| Evals/datasets/scores | Mastra/eval storage | Reporting surfaces |

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

### Objectives

Establish current behavior and prevent refactoring from changing safety or billing semantics.

### Work

1. Add end-to-end tests for:
   - canonical streamed chat
   - XAUUSD conversation
   - verified report
   - Standard committee
   - Full committee
   - Full queue retry
   - lease loss
   - cancellation
   - duplicate request/idempotency
2. Add cost fixtures for:
   - single generation
   - specialist generation
   - fusion generation
   - title generation
   - semantic routing
3. Define terminal state invariants.
4. Define storage authority matrix.
5. Define route decision matrix.
6. Add test assertions that no mutation tool is exposed to read-only agents.
7. Add tests for tenant/user/thread mismatch.

### Exit criteria

- Existing behavior is covered at the lifecycle level.
- Cost discrepancies are measurable.
- Refactors can be compared against baseline traces and responses.

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
   - evidence policy
2. Generate or derive:
   - route authorization
   - tool exposure
   - Mastra component registry checks
   - UI capability metadata
   - telemetry labels
3. Separate tool categories:
   - public market data
   - user-scoped data
   - untrusted external data
   - internal verification
   - mutation tools
4. Make `read-only` and `sensitive-read` distinct policy concepts.
5. Add manifest integrity tests.

### Exit criteria

- No independently maintained tool allowlists for the same capability.
- New tools cannot become reachable without manifest changes and tests.
- Declared limits match runtime limits.

---

## Phase 5 — Normalize evidence and trust types

### Objectives

Make external content and trusted server evidence difficult to confuse.

### Work

1. Introduce separate types for:
   - trusted deterministic evidence
   - user memory
   - untrusted external content
   - model-generated claims
2. Require explicit conversion before untrusted data enters synthesis context.
3. Add content-size limits to all retrieval adapters.
4. Verify web-search SSRF protections.
5. Hash or redact prompt content in injection-detector logs.
6. Add provenance to every external result.
7. Make stale/partial/degraded status mandatory in synthesis inputs.

### Exit criteria

- Type and schema boundaries distinguish data trust.
- External content cannot be interpreted as workflow instructions.
- Retrieval timeouts and result limits are tested.

---

## Phase 6 — Consolidate committee workflow

### Objectives

Make the multi-agent system explicit and reusable.

### Work

1. Extract specialist definitions from the workflow file.
2. Create a reusable specialist runner.
3. Create a reusable fusion runner.
4. Use typed workflow outputs instead of broad `unknown` casts where practical.
5. Centralize specialist prompts and policy fragments.
6. Standardize specialist model metadata.
7. Ensure specialist memory is read-only by default.
8. Ensure only the fusion/output layer writes user-visible assistant messages.
9. Define partial-mode behavior explicitly:
   - Standard may continue on fundamental failure if policy allows.
   - Full must fail closed on required specialist failure.
10. Expose workflow progress once per stage.

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

- Quick/Standard/Full all use the same committee workflow.
- The only differences are specialist set, limits, and strictness.
- No duplicate orchestration implementation remains.

---

## Phase 7 — Unify XAUUSD and generic research composition

### Objectives

Reduce the special-case XAUUSD path while preserving its stronger report verification.

### Work

1. Treat XAUUSD as a configured research capability rather than a separate orchestration architecture.
2. Keep XAUUSD-specific packet collectors and tools behind the common evidence interface.
3. Use common conversation/report runners.
4. Make report verification a configurable output policy.
5. Preserve the XAUUSD follow-up behavior but make the follow-up mode explicit.
6. Remove duplicated memory, guardrail, scorer, and telemetry setup.

### Exit criteria

- XAUUSD-specific code contains domain logic, not duplicate orchestration logic.
- Conversation and report paths share common lifecycle and plan contracts.

---

## Phase 8 — Durable Full-mode integration

### Objectives

Make the durable queue a first-class execution mode of the same planner/workflow.

### Work

1. Serialize the execution plan and model snapshot into the queue payload.
2. Validate plan identity at worker claim time.
3. Use one budget ledger across enqueue and worker execution.
4. Define retry semantics by failure category.
5. Use the database queue only as a dispatch/admission mechanism during migration.
6. Make Mastra workflow state authoritative for execution status and step state.
7. Make lease loss terminal for the current worker attempt.
8. Ensure stale recovery cannot duplicate assistant messages or budget charges.
9. Add queue-to-Mastra dispatch and workflow state transition property tests.
10. Delete competing queue execution-state projections once Mastra authority is proven.

### Exit criteria

- Web and worker use the same research workflow and execution plan.
- Queue retries are idempotent.
- Lease loss cannot overwrite a requeued run.
- Budget reconciliation is exactly once.

---

## Phase 9 — Memory simplification

### Objectives

Make memory useful without making execution unpredictable.

### Work

1. Separate model-visible user preferences from runtime configuration.
2. Keep `resource = userId` and `thread = threadId`.
3. Make semantic recall policy capability-specific.
4. Make observational memory opt-in and independently budgeted.
5. Replace read-then-write working-memory initialization with an atomic or explicitly idempotent operation.
6. Make cross-process backfill correctness depend on durable uniqueness/idempotency, not only local maps.
7. Add memory degradation indicators to UI metadata and traces.
8. Define retention and pruning ownership clearly.

### Exit criteria

- Memory failures do not silently alter answer semantics.
- User preferences cannot be mistaken for system policy.
- Backfill is safe across multiple processes.

---

## Phase 10 — Remove compatibility complexity

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
