# Kestrel AI/Agentic System Audit — 2026-08-24

## Scope

Reviewed the web chat boundary, canonical Mastra chat, XAUUSD research, Quick/Standard/Full workflows, memory, model/BYOK resolution, tools, external-content handling, mutation workflows, budgets, persistence/outbox, worker queue execution, observability/evals, tenancy, tests, and build/type health.

## Verification

- `pnpm typecheck` — passed across all 9 packages.
- `pnpm --filter @kestrel/ai test -- --run` — 139 files / 1,254 tests passed.
- `pnpm --filter @kestrel/web test -- --run` — 108 files / 997 tests passed.
- Remediation verification: focused AI/web/worker suites, package builds, and repository typecheck pass.

## Remediation status

The following audit findings have been implemented after the initial audit:

- Mutation authorization now requires a server-issued, HMAC-verified approval bound to user, thread, mutation, expiry, and input digest; confirmation and cancellation routes use the verified proof.
- Full-analysis queue payloads are strictly bounded and validated at enqueue, claim, and HTTP boundaries.
- Full-analysis budget admission distinguishes permanent quota rejection from retryable budget infrastructure failures and provider/execution failures.
- Canonical chat uses strict guardrails when external retrieval tools are exposed.
- External retrieval content is normalized, bounded, and labeled as untrusted data across web search, news, and calendar tool paths, with adversarial regression coverage.
- Custom instructions are bounded, sanitized, and restricted to presentation preferences rather than arbitrary system policy.
- Streaming emits durable terminal persistence status so generated output is distinguishable from persisted output.
- Semantic-routing cache keys hash the complete normalized prompt instead of truncating it to 200 characters.

The remaining findings below are still open unless explicitly marked otherwise; atomic queue-plus-budget admission, complete turn-by-turn projection reconciliation, and production-like concurrency/restart testing remain follow-up work. Auxiliary usage markers, workflow-status normalization, telemetry degradation health signals, alert polling, and quality-gate contracts are implemented; deployment-specific alert delivery and startup policy remain operational follow-up. Durable memory-backfill coordination, model-resolution convergence, mutation execution idempotency, capability registration, typed outbox replay validation, owned message queries, and web-search freshness/provider-attempt metadata are implemented in the current remediation batches.

## Executive assessment

The system is substantially hardened and has a good architecture:

- Database-owned Full-analysis queue authority.
- Explicit user/thread/resource scoping.
- Read-only Mastra tool allowlists.
- Separate mutation confirmation workflows.
- BYOK model resolution with circuit breakers.
- Durable idempotent persistence and outbox recovery.
- Strong workflow lease handling.
- Native Mastra memory with per-user resources.
- Structured research packets and verification.
- Extensive unit and integration test coverage.

The largest remaining risks are runtime correctness, safety consistency, cost accounting, and operational contracts across layers.

## Priority findings

### P0 — Full-analysis worker budget admission is not atomic with queue claiming (partially remediated; architectural follow-up)

**Files:** `apps/worker/src/jobs/multi-agent-analysis.ts`, `packages/ai/src/mastra-v2/workflows/full-analysis.ts`, `packages/ai/src/budget-reservation.ts`

The worker claims a queue item and only later reserves budget. A quota rejection is therefore treated as an execution failure rather than an explicit admission decision and can consume worker capacity or end in the wrong queue state.

**Status:** Quota exhaustion is now terminal and user-visible, while budget-store failures remain retryable and provider/execution failures preserve existing retry handling. A fully atomic claim-plus-reservation transaction remains deferred because the current budget ledger and queue use separate package-level transactions; quota handling is terminal-safe and reservation failures are retryable.

### P0 — Mutation policy has an authorization gap around `confirmed` (remediated)

**File:** `packages/ai/src/mastra/mutation-policy.ts`

`evaluateMastraMutation()` trusts a plain `confirmed: boolean`. The central policy API does not require verification of approval identity, mutation, user/thread, input digest, expiry, or single-use state. A future caller can accidentally bypass the stronger token workflow.

**Status:** The boolean authorization path was removed. Confirmation now requires HMAC verification and the durable mutation execution ledger atomically commits the business write, audit record, and idempotent result.

### P1 — Generic canonical chat does not apply strict guardrail mode (remediated)

**Files:** `packages/ai/src/mastra/canonical-chat.ts`, `packages/ai/src/mastra-v2/guardrails.ts`

Canonical chat uses availability/rewrite guardrails. If the detector model is unavailable, the agent continues with only Unicode normalization. The deterministic route regex is narrow, and canonical chat has access to external retrieval tools.

**Status:** Canonical chat now selects strict guardrail behavior when external retrieval is available; availability mode remains limited to explicitly lower-risk internal-only paths.

### P1 — External-content safety is mostly model-instructional (envelope/quarantine remediated)

**Files:** `packages/ai/src/mastra/external-content.ts`, `packages/ai/src/mastra/read-only-tools.ts`, `packages/ai/src/tools/web-search.ts`, `packages/ai/src/mastra/news-tool.ts`, `packages/ai/src/mastra/calendar-tool.ts`

HTML/control sanitization and untrusted labels are good, but natural-language prompt injection remains in content. `wrapExternalContent()` is not visibly universal, and retrieved content is still placed in the model context.

**Recommendation:** Define one external-data envelope, detect suspicious content, quarantine or mark it, and never place raw external content in system instructions. Add adversarial retrieved-content tests.

### P1 — Memory backfill race is only process-local (remediated)

**File:** `packages/ai/src/mastra-v2/context.ts`

`backfillInFlight` protects only one Node process. Multiple Vercel instances or worker/web processes can perform the same read-then-write migration concurrently. Partial backfills cannot be detected and repaired.

**Status:** Remediated with the durable `memory_backfill_state` marker, lease-based atomic claim, copied-through timestamp, and ID-based reconciliation for interrupted copies.

### P1 — Mastra memory and Drizzle message persistence are not explicitly synchronized (partially remediated; reconciliation follow-up)

**Files:** `apps/web/src/lib/services/mastra-canonical-chat-stream.ts`, `packages/ai/src/mastra/canonical-chat.ts`, `packages/ai/src/mastra-v2/context.ts`

Drizzle is written explicitly, while Mastra memory synchronization relies on implicit agent behavior. Stream failure can leave stores divergent.

**Status:** Durable backfill coordination, ID-based reconciliation, and durable `memory_projection_state` checkpoints are implemented. Full turn-by-turn projection reconciliation after every interrupted stream remains follow-up work.

### P1 — Streaming exposes complete-looking answers before durable finalization

**File:** `apps/web/src/lib/services/mastra-canonical-chat-stream.ts`

The client receives all text before assistant persistence, budget reconciliation, and terminal status complete. Persistence failure can therefore look like success.

**Recommendation:** Emit a final `turn-complete` event with `persisted`, `persistence-failed`, or `interrupted` status. Make the UI distinguish generated from durable output.

### P1 — Budget reservations need stronger stranded-spend guarantees

**Files:** `packages/ai/src/budget-reservation.ts`, `packages/ai/src/budget-guard.ts`

The idempotent handle behavior is good, but crashes and partial provider failures can strand reservations. Recovery needs enough durable data to reconcile actual usage rather than merely release the estimate.

**Recommendation:** Implement a reservation ledger state machine with run/model/provider, token usage, actual cost, terminal outcome, and heartbeat metadata.

### P1 — Model resolution is inconsistent across paths (substantially remediated)

**Files:** `packages/ai/src/model-chat.ts`, `packages/ai/src/mastra/mode-runner.ts`, `apps/worker/src/jobs/multi-agent-analysis.ts`, `packages/ai/src/model-resolution.ts`

Canonical chat resolves by routing domain, while mode/worker paths default or validate through technical-tier resolution. Fallback behavior is not represented by one contract.

**Status:** A typed `resolveMastraModel` entry point now covers purpose, domain, explicit override, operator pin, and immutable worker snapshot; remaining legacy non-Mastra callers can migrate independently.

### P1 — Semantic routing adds an untracked model call (cache/accounting hook remediated)

**Files:** `packages/ai/src/routing.ts`, `packages/ai/src/semantic-routing.ts`, `packages/ai/src/mastra/canonical-chat.ts`

Semantic routing is on by default and calls an LLM before the main request. It is not visibly represented in the same budget/telemetry ledger. Its cache key uses only the first 200 characters.

**Recommendation:** Track semantic routing as a sub-call with usage/cost/cache metadata, reserve for it, and hash the full normalized prompt.

### P1 — Evals are not one uniform terminal quality gate

**Files:** `packages/ai/src/mastra-v2/evals/scorers.ts` and report workflow files

Deterministic citation, grounding, and sampled LLM judge scorers have different availability and enforcement semantics. Missing judge models disable scoring, while grounding is not uniformly attached to generic agent maps.

**Status:** Citation and grounding enforcement is present, with a durable machine-readable quality-result schema now available; wiring every evaluator and normalizing mandatory/advisory policy remains follow-up work.

### P1 — Full-analysis queued message parts are arbitrary unknown data (remediated)

**File:** `packages/ai/src/mastra-v2/workflows/full-analysis.ts`

`userMessageParts: z.unknown()` and the route's `parts: z.array(z.unknown())` allow malformed or oversized nested values into durable worker processing.

**Recommendation:** Define and apply a strict bounded message-parts schema before queue persistence and worker execution.

### P1 — User custom instructions are injected into the system prompt

**Files:** `apps/web/src/app/api/chat/route.ts`, `packages/ai/src/mastra/canonical-chat.ts`

`X-AI-Prefs` content is inserted into system instructions. Labels do not make arbitrary text non-instructional.

**Recommendation:** Validate into a narrow presentation-preferences schema and pass it as separately delimited data or a user-level message. Reject safety/tool/scope directives.

### P1 — Entitlement filtering uses multiple policy sources (registry introduced)

**Files:** `packages/ai/src/mastra/canonical-chat.ts`, `packages/ai/src/tools/by-domain.ts`, `packages/ai/src/mastra/capabilities.ts`

The effective tool set is produced by intersecting a domain registry and a read-only set. These can drift as tools are added.

**Status:** The capability registry and component registry now provide a typed reviewed source for Mastra capabilities. Legacy domain filtering remains for the staged migration boundary and is not yet fully eliminated.

### P2 — `listMessages()` relies on a separate ownership pre-check (remediated)

**File:** `packages/ai/src/persistence/message-persistence.ts`

The initial ownership check protects the subsequent query, but the message query itself has no owner predicate and is fragile under refactoring.

**Status:** `listMessages(userId, threadId)` now applies the ownership predicate within the message query itself.

### P2 — Persistence outbox replay relies on casts instead of operation schemas (remediated)

**File:** `packages/ai/src/persistence-recovery.ts`

Several operation payloads are cast directly to target types. Invalid rows can retry repeatedly or reach unexpected write code.

**Status:** Replay uses operation-specific Zod validation; malformed payloads are moved directly to dead-letter state rather than retried indefinitely.

### P2 — Web-search cache lacks explicit age/freshness metadata (remediated)

**File:** `packages/ai/src/tools/web-search.ts`

The process-local cache is acceptable for performance, but cached results do not expose age and may be presented as current.

**Status:** Web-search output now includes cache timestamps/age and safe provider-attempt metadata.

### P2 — Provider fallback attribution is incomplete (remediated)

**File:** `packages/ai/src/tools/web-search.ts`

Only the successful provider is returned; failed attempts, attempt latency, and possible provider cost are not fully represented.

**Status:** Web-search responses now expose bounded provider attempt status, latency, and sanitized error metadata; durable cost attribution remains deferred.

### P2 — Workflow status names differ across layers (remediated)

DB uses `complete`, Mastra uses `success`, APIs use `complete`, and workflows also expose `ready`/`blocked`.

**Status:** Added a shared workflow status vocabulary with typed API and Mastra adapters. Existing legacy payloads are normalized at boundaries; migration of every historical status field remains incremental.

### P2 — Report repair loop semantics need clearer invariants

**File:** `packages/ai/src/mastra-v2/workflows/xauusd-report.ts`

The bounded repair loop now uses the explicit `MAX_REPAIR_ATTEMPTS` name and has exact-count regression coverage.

**Recommendation:** Rename to `MAX_REPAIR_ATTEMPTS` and test exact generation counts for every success/failure/abort path.

### P2 — Failed-run telemetry often reports zero usage

**Files:** `packages/ai/src/mastra/canonical-chat.ts`, `packages/ai/src/mastra/mode-runner.ts`, `packages/ai/src/mastra/run-telemetry.ts`

Provider failures after partial work can be recorded with zero tokens/tool calls, causing undercounted cost and incomplete reliability metrics.

**Status:** Durable telemetry now carries auxiliary-call kinds and an explicit `usageKnown` marker; remaining provider-specific incremental usage extraction is follow-up work.

### P2 — Observability failures are swallowed too broadly (partially remediated)

**Files:** `packages/ai/src/mastra/run-telemetry.ts`, `packages/ai/src/mastra-v2/telemetry.ts`

Non-blocking exporters protect requests but can hide systemic integration failures.

**Status:** Added process-level telemetry degradation state, `metrics_flush_failed_total` signals, authenticated health exposure, and cron-based alert polling/delivery. Startup validation and deployment-specific alert configuration remain operational follow-up.

### P2 — Tests are broad but need more production-like coverage

The suite includes adversarial external-content, migration-idempotency, mutation concurrency, memory reconciliation, model-resolution, workflow-repair, and telemetry-health coverage; true multi-process/restart tests remain operational follow-up.

**Recommendation:** Add real Mastra/PGlite storage tests, HTTP provider mock tests, multi-process concurrency tests, stream abort tests, payload fuzzing, external-content adversarial tests, and restart/recovery tests.

## Component summary

### Web/API boundary

Strengths: auth wrapper, bounded body, ownership checks, rate limiting, timeout, Full-mode queueing, mutation separation, injection checks, sanitized production errors.

Risks: arbitrary message parts, custom-instruction injection, raw enqueue error concatenation, duplicated prior-report reads, module-load rate-limit configuration.

### Routing

Strengths: hard vision signal, deterministic fallback, semantic timeout, rationale telemetry.

Risks: extra untracked model call, truncated cache key, quoted user text in classifier prompt, uncalibrated confidence.

### Canonical agent

Strengths: explicit read-only allowlist, DI DB token, bounded tool iterations, memory resource scoping, tracing, citation scorer.

Risks: availability-mode guardrails, system-prompt custom preferences, broad casts, inconsistent context on memory outage, duplicated tool policy.

### XAUUSD research

Strengths: domain restriction, structured packets, verification, repair, numeric claim/evidence requirements, strict Full behavior.

Risks: inconsistent grounding enforcement, report/context size and status translation, zero usage on failures.

### Memory

Strengths: user resource scope, thread scope, BYOK embeddings, bounded backfill, durable lease marker, ID-based partial migration reconciliation, observational memory restricted to worker.

Risks: stale working memory, model-editable preferences, embedding cost visibility, outage-dependent context behavior, and incomplete turn-by-turn projection reconciliation.

### Tools/external data

Strengths: Zod contracts, aborts, provider fallback, URL protocol restriction, contentTrust markers, bounded calls.

Risks: semantic prompt injection remains, uneven wrapper use, cache age absence, fallback cost attribution.

### Mutations

Strengths: no mutation tools in read-only agents, disabled-by-default flag, HMAC tokens, expiry, timing-safe comparison, durable single-use execution ledger, atomic business-write/audit/result transaction, and cancellation audit records.

Risks: approval issuance/consumption coverage should still be tested across every future mutation route.

### Budgets

Strengths: atomic reservation, durable IDs, idempotent reconciliation/release, recovery job.

Risks: auxiliary-call accounting, unknown models, partial failures, stranded reservations, post-claim worker admission.

### Worker/queue

Strengths: DB authority, leases, heartbeat, abort on lease loss, stale recovery, conditional terminal writes, bounded polling.

Risks: budget after claim, regex error classification, false stuck health signals, projection N+1 recovery, projection failures only in logs.

### Persistence

Strengths: ownership predicates, idempotency, outbox, operation-specific replay schemas, dead-letter handling, redaction, and generated-but-not-persisted UX status.

Risks: DB outage loses outbox, nested sensitive fields, and additional projection/restart coverage remains desirable.

### Observability/evals

Strengths: run identity propagation, traces/logs/DB linkage, custom scorers, dataset exports, tool telemetry.

Risks: hidden exporter failures, zero usage on failures, inconsistent agent identity granularity, non-uniform quality gate, dual instrumentation drift.

### Testing/build

The test suite is strong, but production-like and adversarial tests are missing. Repeated Vite/esbuild warnings report an unrecognized `ES2024` target; jsdom canvas/localStorage warnings reduce signal quality.

## Remediation order

### Immediate

1. Replace mutation boolean confirmation with verified approval. **Done.**
2. Harden custom instructions. **Done.**
3. Strictly validate queued message parts. **Done.**
4. Make Full-analysis budget admission explicit. **Partially done; atomic reservation remains deferred.**
5. Add stream terminal persistence status. **Done.**
6. Add external-content adversarial tests and a uniform envelope. **Done.**

### Next

7. Unify model resolution. **Substantially done; legacy non-Mastra migration remains.**
8. Add durable memory-backfill markers. **Done.**
9. Track semantic routing/embedding/guardrail/title/scorer costs. **Deferred by request.**
10. Capture partial usage. **Deferred by request.**
11. Add outbox payload schemas. **Done.**
12. Normalize workflow statuses. **Core vocabulary/adapters done; repair-loop naming and boundary normalization complete; historical field migration remains incremental.**

### Operational hardening

13. Add telemetry degradation health signals. **Done at runtime/health endpoint; alert wiring/startup checks remain.**
14. Add production-like Mastra/PGlite restart tests. **Open.**
15. Add multi-process queue/memory concurrency tests. **Open.**
16. Fix ES2024 tooling warnings. **Open; tooling-only.**
17. Reduce test-environment noise. **Open; tooling-only.**

## Overall rating

| Area | Rating | Assessment |
|---|---:|---|
| Architecture | 8.5/10 | Clear boundaries and good Mastra migration |
| Authentication/tenancy | 8.5/10 | Strong scoping; direct owner predicates can improve |
| Read-only tool safety | 8/10 | Good allowlists; guardrail degradation matters |
| Mutation safety | 8.5/10 | Verified approval and durable idempotent execution ledger; broader route coverage remains |
| External-content safety | 7/10 | Good labels/sanitization; insufficient isolation |
| Workflow durability | 8.5/10 | Strong queue/lease/recovery design |
| Cost controls | 7.5/10 | Good reservations; auxiliary/partial accounting gaps |
| Memory | 8.5/10 | Correct scoping plus durable backfill coordination and reconciliation; projection convergence remains |
| Observability | 8.5/10 | Broad correlation plus degradation signals; alert wiring remains |
| Testing | 8.5/10 | Excellent breadth; adversarial/production gaps |
| Type/build hygiene | 7.5/10 | Typecheck clean; broad casts and warnings remain |

## Final verdict

This is a production-oriented system, not a fragile prototype. The main remaining risk is policy and contract drift across layers: strict versus availability guardrails, domain-aware versus technical model resolution, boolean versus token mutation authorization, implicit versus explicit memory synchronization, and incomplete auxiliary-call cost accounting.

The next phase should make these contracts singular, typed, durable, and observable.
