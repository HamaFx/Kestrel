# Decisions Log — Kestrel AI & Agentic Audit

> Append-only. Each decision: date, decider, question, choice, rationale.

## 2026-10-10 — Q1 Model diversity — Decider: Owner — Decision: Quality over cost, always

**Choice:** Per-specialist distinct models, all top-tier quality. No cost optimization.

**Rationale:** Owner stated "every time to be same like not reduce quality for cost always quality."
This overrides the cost-optimized tier mapping (fast/balanced) originally proposed.

**Implication for plan:**
- Phase 1 task 1.1 / Phase 3 task 3.1: map becomes `{ technical: top-tier, fundamental: top-tier, risk: top-tier, sentiment: top-tier }` — same quality tier, diversity via prompt/model family, not via cheaper models.
- Example: if BYOK is `claude-sonnet` / `gpt-5`, all 4 specialists use that tier. If user wants diversity, they get it via distinct specialist prompts + optionally distinct top-tier families (e.g. technical=Claude, fundamental=GPT) — never by downgrading to `small`/`flash`/`mini` for cost.
- Circuit breaker (Phase 1.6) still needed — if top-tier provider fails, fail closed (per Q3), not fallback to cheap model.

---

## 2026-10-10 — Q2 Committee modes — Decider: Owner — Decision: Two modes only — `single` and `full`

**Choice:** Collapse 4 modes (`single`/`quick`/`standard`/`full`) → 2 modes (`single` + `full`).

**Rationale:** Owner: "just two modes full and single."

**Implication for plan:**
- `quick` and `standard` are removed. `SPECIALISTS_BY_MODE` becomes:
  ```ts
  single: ['technical']
  full: ['technical', 'fundamental', 'risk', 'sentiment']
  ```
- `MODE_POLICY` has only two entries. `single` remains read-only single-desk; `full` is the 4-desk committee.
- UI: `ChatTopBar` mode selector → two options (or toggle). `Landing` copy updated: "Single = instant read, Full = 4-desk committee."
- Migration: `MastraAnalysisModeSchema = z.enum(['single','full'])` — add compat shim that maps legacy `quick`→`single`, `standard`→`full` for 1 release so old queue rows don't break, then remove.
- `apps/web` route branching simplifies: `if (mode==='full') → durable queue else → single path`.

---

## 2026-10-10 — Q3 Strict failure — Decider: Owner — Decision: Strict everywhere — any agent failure = full failure, no partial answers

**Choice:** `strict: true` for both `single` and `full`. `continueOnPartialFailure: false` for all.

**Rationale:** Owner: "if any agent fails i want all to fail i want true answer not deprecated answer."

**Implication for plan:**
- `MODE_POLICY` updated: both modes `strict:true`.
- `committee/workflow.ts:verify` step always throws `MastraModeStrictFailureError` if any `failedAgents.length > 0` — no partial fusion.
- Fusion verifier (Phase 1.4) failure also becomes terminal (throw, not degraded prefix) — a hallucinated fusion is a failed run, not a partial answer.
- UX: `AgentDeliberation` never shows partial; on failure, user sees `MastraModeStrictFailureError` with `failedAgents` list + retry button. No "3/4 desks completed" banner.
- Deadline handling (Phase 1.7): timeout still produces `failedAgents` → strict failure → user retries, not partial.

---

## 2026-10-10 — Q4 Budget / daily limits — Decider: Owner — Decision: Remove daily caps — quality always, no limits

**Choice:** Daily budget cap is removed as a blocking gate. Cost is tracked (for observability/billing), never enforced.

**Rationale:** Owner: "i dont want max daily use or limits like that i want full quality always."

**Implication for plan:**
- Phase 1.3 `budget.ts` facade keeps `acquireBudget` for ledger/cost accounting, but `tryReserveBudget` no longer throws `BudgetExceededError` — it always returns `{ ok:true }`. `MAX_DAILY_USD` env remains for reporting but is not enforced.
- `apps/web/src/app/api/chat/route.ts` budget-exceeded 429 branch is removed (or gated behind `ENFORCE_BUDGET=false` default).
- `cost.ts` rate table + `estimateCostUsd` + `generationLedger` all kept — `admin` usage dashboard still shows spend, just never blocks.
- **Warning logged:** operator cost is now unbounded per user. Recommend adding `admin` alerts (Phase 5) when spend exceeds thresholds, even if not blocking.

---

## 2026-10-10 — Q5 Packet cache — Decider: Auditor (owner delegated: "choose what you think is best") — Decision: 30s fresh-only cache, in-memory + Redis when available

**Choice:** Option A: 30s TTL, `fresh` only, `stale`/`degraded` never cached. In-memory LRU by default; Redis if `REDIS_URL` set.

**Rationale:** Per Q1+Q3+Q4 quality-first: never serve stale data as if it were fresh. Fresh-only caching is pure win (burst deduplication at market open) with zero quality loss.

**Implication for plan:** Phase 2.1 as written (Option A). No change needed.

---

## 2026-10-10 — Q6 Cross-critique — Decider: Auditor (owner: "speed is not that important, choose best quality") — Decision: Enabled by default for `full`

**What cross-critique is (plain English):**
Today specialists work in parallel and never talk to each other. Technical says "bullish," risk says "invalidation at 2040" — but risk never saw technical's levels. Cross-critique adds one round where each specialist reads the others' reasoning and writes a short critique + revised confidence. Fusion then sees both opinions *and* critiques, so it can surface disagreements ("technical bullish but risk flags invalidation — committee split 3-1") instead of silently picking one side.

Cost: +4 LLM calls per Full run (~$0.03, +2–3s latency). Since you said speed is not important and quality always wins, this is enabled.

**Decision:** `ENABLE_COMMITTEE_CRITIQUE=true` by default for `full` only. Single mode unchanged (1 desk, nothing to critique).

---

## 2026-10-10 — Q7 Full-mode modelOverride — Decider: Auditor (owner: "choose whats best") — Decision: Serialize modelOverride to durable queue (engineering fix)

**What this is (plain English):**
Full mode is durable: web enqueues a job, worker claims it later. Today if you pick a specific model (e.g. "use gpt-5") and then choose Full, the web rejects you with `400 INVALID_MODEL_OVERRIDE` — your model pick is ignored. The fix is to serialize your model choice onto the queue row so the worker uses your exact model when it runs.

**Decision:** Phase 1.8 as written — `FullAnalysisQueueRow.modelIdOverride` + `providerIdOverride`, worker resolves from queue row. If BYOK key missing on worker, fail closed with clear message ("Model override unavailable for durable Full — run as Single instead").

---

## 2026-10-10 — Q8 Observational memory — Decider: Pending — Needs owner confirmation

**What observational memory is (plain English):**
A background system where the AI watches your past conversations and quietly rewrites a "working memory" note about your preferences (e.g. "user prefers risk-first style, default symbol XAUUSD"). It uses extra LLM calls in the background (cost `~$0.004 × 2` per message, ~$0.008/turn) that you never see. It's off by default today.

**Current plan assumption (pending your answer):**
- Keep it **OFF** for `apps/web` (Vercel — short-lived, not suited for background work).
- Enable only on the durable `full` worker path if you explicitly opt in (`ENABLE_MASTRA_OBSERVATIONAL_MEMORY=true` on worker env).
- No cost surprise until you enable it.

**Question for you:** Do you want the AI to learn/remember your preferences across threads (observational memory ON for full), or do you prefer no background learning (keep OFF)? Reply `Q8 ON` or `Q8 OFF`.

---

## 2026-10-10 — Q9 Migration cadence — Decider: Owner — Decision: One PR (atomic)

**Choice:** Single PR for `mastra/` → `mastra-v2/` strangler migration.

**Rationale:** Owner: "one pr"

**Implication for plan:**
- Phase 4 becomes one atomic PR (not 5 incremental). Higher risk, cleaner history. Mitigate with:
  - Feature flag `PHASE4_MIGRATED` so revert is one env var.
  - Barrel re-exports kept for 1 release if needed, but since it's one PR, we can just move and update all imports atomically.
  - This PR must be reviewed with `pnpm typecheck` + `pnpm test:ai --run` + `pnpm build:packages` green before merge — no partial.

---

## 2026-10-11 — Audit upgrade plan implementation — Decider: Implementing agent — All phases landed

Implementation status for the superseded audit plan (Phases 0–5), recorded
here per §12 Rollout ("decisions.log updated per PR"). The plan file itself was
removed on 2026-10-12 and superseded by `docs/plans/kestrel-ai-agentic-audit-v2.md`;
this entry is retained because the v2 audit re-verifies these phases.

### Phase 0 — Decisions & Prep
- Feature flags in `packages/shared/src/env.ts` + `.env.example`:
  `PHASE2_PACKET_CACHE`, `PHASE3_MODEL_DIVERSITY`, `ENABLE_COMMITTEE_CRITIQUE`,
  `PHASE3_STRUCTURED_FUSION`, `ENFORCE_BUDGET` (default `0`), `REDIS_URL`.
  (Originally also `PHASE1_UNIFIED_ROUTER`, `PHASE2_STREAM_PROGRESS`, and
  `PHASE4_MIGRATED`; removed in the review follow-up because nothing read them.)
- Baseline metrics snapshotted to `docs/archive/audit-2026-q1/baseline.md`
  (typecheck green; 161 files / 1357 tests green pre-change).

### Phase 1 — Stabilize
- **1.1 Unified router** — `mastra-v2/planning/router.ts` (`routeUnified`); all
  lexical regexes single-sourced in `routing-keywords.ts`; the web boundary
  (`mastra-chat-routing.ts`) is now a deprecated re-export; `/api/chat` uses one
  classification pass (`injection`, `mutationKind`, route, model).
- **1.2 Guardrail mode from the manifest** — `guardrailPolicyForCapability`
  derives strict+block from `contentTrust: untrusted`; `plan.guardrail` carries
  it; `buildResearchGuardrails` no longer branches on `NODE_ENV`.
- **1.3 Budget facade (Q4)** — `budget.ts` (`acquireBudget`,
  `isBudgetEnforced`, `UNCAPPED_DAILY_USD`); reservations are ledger-only by
  default; 429 only under explicit `ENFORCE_BUDGET=true`.
- **1.4 Fusion verifier (Q3)** — `committee/fusion-verifier.ts`; one bounded
  repair; a second failure throws `MastraModeStrictFailureError(['fusion'])`.
- **1.5 Memory fallback** — canonical chat degrades to explicit history with
  `memoryMode: 'degraded'`; new persisted `data-memory-degraded` UI part.
- **1.6 Persistent circuit breaker** — `provider_circuit_state` table
  (migration 0097); L1 Map + write-through + 5s-throttled DB convergence;
  degrades to per-instance behavior when the DB is unavailable.
- **1.7 Deadline propagation (Q3)** — `COMMITTEE_DEADLINE_MS = 45s` on sync
  runs; deadline aborts become failed-desk markers / strict failures with a
  clear retry message; workers stay lease-governed.
- **1.8 Full-mode modelOverride (Q7)** — the 400 guard is gone; the override
  serializes through the execution plan's immutable model snapshot onto the
  durable queue payload; the worker resolves exactly that model (no
  failover); unresolvable overrides fail closed with
  `MODEL_OVERRIDE_UNAVAILABLE` (422). **Deviation (documented):** the queue
  row stores the override inside the existing `payload.modelSnapshot` instead
  of new `model_id_override` columns — durable serialization is equivalent and
  no DB migration was needed.
- **1.9 Two-mode collapse (Q2)** — `single` + `full` only
  (`MastraAnalysisModeSchema`); compat shims `quick→single`,
  `standard→full` (resolveMode, execution-plan parse, thread/settings PATCH,
  chat page, settings form); BodySchema accepts only `single|full`;
  `MODE_POLICY` is strict everywhere (Q3). **Deviation (documented):** legacy
  `auto` still resolves through the two-mode detector (never invents a third
  mode) instead of a flat `auto→single` map — this preserves smart routing
  while honoring the two-mode contract.

### Phase 2 — Performance
- **2.1 Packet cache (Q5)** — 30s fresh-only LRU + in-flight dedup + optional
  Redis mirror (`REDIS_URL`); fresh/complete packets only; blocked/stale
  never cached; deterministic indicator memo.
- **2.2 Zero-copy packet** — committee agents use instructions functions
  reading packet/opinions from `requestContext` (XAUUSD-agent pattern); the
  serialized packet string is computed once per run and shared by all desks.
- **2.3 Streaming committee progress (P1-8)** — `runMastraModeChatStream`
  opens the SSE response immediately and emits transient
  `data-agent-progress` snapshots per stage for both `single` and `full`.
  **Deferred (noted):** xauusd-report repair-attempt streaming was not
  converted; the durable Full path already persists progress.
- **2.4 Setup parallelization** — memory prep runs concurrently with routing;
  `mastra_setup_latency_ms{phase}` histogram added.

### Phase 3 — True multi-agent
- **3.1 Model diversity (Q1)** — `resolveModelForAgent` per committee agent;
  wired to the user's existing `agentModelOverrides` (technical /
  fundamental / risk / sentiment / decision) plus optional
  `MASTRA_COMMITTEE_MODELS` env JSON, gated by `PHASE3_MODEL_DIVERSITY`;
  unresolvable picks fall back to the primary top-tier model — never a
  cheaper tier.
- **3.2 Cross-critique (Q6)** — new `critique` stage for `full`
  (`collect → parallel(specialists) → critique → verify → fusion`), ON by
  default, `ENABLE_COMMITTEE_CRITIQUE=0` disables; structured
  `CritiqueSchema`; fusion receives opinions + peer reviews; critiques
  surface in the workflow snapshot and the mode result.
- **3.3 Structured fusion** — opt-in `PHASE3_STRUCTURED_FUSION`
  (`FusionAnswerSchema` + deterministic markdown rendering).

### Phase 4 — Atomic migration (Q9, one PR)
- **4.1** All 70 `mastra/*` modules moved under `mastra-v2/`
  (`agents/canonical`, `agents/xauusd{,/report,/tools}`, `packets`,
  `capabilities`, `planning`, `mutation`, `shared`); `src/mastra/` keeps the
  public barrel + one-release re-export shims; `docs/architecture.md`
  updated. Full suite green after the move.
- **4.2 XAUUSD packet bridge** — `SymbolResearchPacket.xauusdExtension`
  (dollar index, real yields, breakeven inflation, USD events, news count);
  the committee's cached XAUUSD collection passes `includeMacro: true`; the
  fusion verifier grounds macro numbers. **Deviation (documented):** the
  verified XAUUSD report pipeline (§8 "strengths to preserve") keeps its own
  richer collector instead of being deleted — collapsing it onto the
  generic packet would regress the repo's strongest verification path
  (contradicts Q1); the bridge removes the packet-schema duplication.
- **4.3** Explicit `registerAllTools()` (idempotent) called at Mastra
  instance build + catalogue reads; category modules export register
  functions; no import side effects remain.
- **4.4** `OpinionSchema.details` typed envelope (keyLevels/assumptions/
  missingEvidence) with `catchall` backward compatibility.
- **4.5** `run.ts` decomposed — model pinning, request contexts, blocked
  stats, and the follow-up packet live in `agents/xauusd/context.ts`.

### Phase 5 — Advanced
- **5.1** Lightweight planner (`mastra-v2/workflows/planner.ts`): complexity
  gate, structured subtasks, degrades to a trivial plan on any failure.
  **Status: built and unit-tested, but not wired to any live chat or queue
  route.** No production caller invokes `runPlanner` or `plannerRequired`;
  they are exported only through the barrels. Wiring it into `/api/chat` is
  a separate decision because it adds a model call to every complex turn
  under the strict Q3 cost policy.
- **5.2** Cost-aware specialist skipping — **not implemented** (rejected
  under strict Q3, as the plan records).
- **5.3** Nightly eval gate: `packages/ai/scripts/eval-gate.ts` (pnpm
  `eval:gate`) + `.github/workflows/evals-nightly.yml` (3:00 UTC).
  **Semantics:** the gate compares observed score pass rates against the
  absolute thresholds in `DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS`
  (`recordsToGateObserved`). It does **not** compare against a stored main
  baseline, so the plan's "drop >5% vs main" wording is not implemented. A
  baseline store would need its own table and a main-branch artifact; the
  absolute gate was kept as the simpler, auditable alternative. It skips
  cleanly without `DATABASE_URL`/`POSTGRES_URL`, with no recent telemetry
  run ids, or with no score rows, and fails only on real regressions.
- **5.4** Committee step spans: `committee/step-spans.ts` records
  `committee_step_latency_ms` / `committee_step_cost_usd` histograms and a
  structured span log per stage (packetId, modelId, latency, cost); Mastra
  workflow snapshots already persist per-step state.
- **Q8 observational memory** — stays **OFF by default** everywhere pending
  the owner's ON/OFF answer (the plan's stated assumption).

### Review follow-up (2026-10-11)
- **Dead flags removed.** `PHASE1_UNIFIED_ROUTER`, `PHASE2_STREAM_PROGRESS`,
  and `PHASE4_MIGRATED` were declared but read nowhere. The unified router,
  streaming progress, and the mastra→mastra-v2 migration are unconditional
  code paths now, so their rollback is `git revert`. The Q9 rollback note
  for `PHASE4_MIGRATED` no longer applies.
- **Single flag parser.** `packages/shared/src/feature-flags.ts`
  (`readFeatureFlag`) is the only runtime reader of the five live flags
  (`PHASE2_PACKET_CACHE`, `PHASE3_MODEL_DIVERSITY`,
  `ENABLE_COMMITTEE_CRITIQUE`, `PHASE3_STRUCTURED_FUSION`, `ENFORCE_BUDGET`).
  It does not cache, so tests that mutate `process.env` still work.
- **Two-mode copy.** Landing hero, metrics strip, and FAQ item 02 describe
  Single (one technical desk) versus Full (four desks), and the FAQ now
  names the real desks (Technical, Macroeconomic, and so on) instead of
  nonexistent "Syndicate Arbiter" and "Macro Desk" labels.
- **Stale workflow header** in `committee/workflow.ts` now describes two
  modes instead of single/Quick/Standard/Full.
- **Not yet measured:** the plan's quantitative Definition-of-Done metrics
  (latency, cost, grounding rates) still need a live run. The pre-change
  baseline is in `docs/archive/audit-2026-q1/baseline.md`; no post-change
  numbers are recorded.

### Verification
- `pnpm build:packages` green; `pnpm --filter @kestrel/ai test` green;
  web + worker `tsc --noEmit` green; see the baseline doc for the pre-change
  reference (161 files / 1357 tests → 170+ files / 1400+ tests after the
  upgrade).

---

## 2026-10-11 — Q8 Observational memory — Decider: Owner — Decision: OFF

**Choice:** Observational memory stays **OFF everywhere** (web and worker).

**Rationale:** Owner confirmed the recommended default after a plain-English
explanation: no background learning of user preferences, no extra background
cost. Personalization must come from explicit user settings, not inferred notes.

**Implication for plan:**
- `ENABLE_MASTRA_OBSERVATIONAL_MEMORY` remains unset/false in all environments;
  no deployment env file sets it.
- §5.x observational-memory work stays dormant (the allowance constant and
  plumbing exist but are inactive).
- To revisit later: set `ENABLE_MASTRA_OBSERVATIONAL_MEMORY=true` on the worker
  environment only (per the plan's original recommendation).
- This closes the last open question (§13) — Q1–Q9 are now all decided.

---

## 2026-10-12 — Audit v2 — Decider: Owner — Q1–Q4 answered

Issued alongside `docs/plans/kestrel-ai-agentic-audit-v2.md`. These answer the
four P0/UX decisions for the v2 plan. Q5–Q9 remain open.

### Q1 — Canonical evidence gating — Decision: BLOCK HARD (no answer)
When the canonical-chat answer fails `checkCanonicalEvidence`, the turn fails
with a clean user-facing refusal. No repaired or degraded answer is returned —
mirrors the committee's strict Q3 semantics. Implication: the evidence check
must be strengthened first (real numeric extraction + date/structural masking)
so benign numbers never cause a false block. Plan: Phase 1 task 1.3.

### Q2 — Model diversity default — Decision: KEEP OFF (opt-in only)
The 4 committee desks keep sharing one model by default; users opt in via
`PHASE3_MODEL_DIVERSITY` / `agentModelOverrides`. Do not change the default.
The fusion span still gets fixed to report the real per-agent model id when a
user has opted in. Plan: Phase 3 task 3.1 (now reduced to the span fix).

### Q3 — BYOK operator env-key fallback — Decision: YES, shared pool by design
Operator env API keys (OPENAI_API_KEY, …) continue to be merged into every
user's BYOK payload, including multi-user. This is intended, not a bug — do not
gate it. Only add advisory `operator_key_fallback_total{provider}` telemetry so
operator-paid spend is attributable. Plan: Phase 1 task 1.11.

### Q4 — Durable Full live progress — Decision: FIX PAYLOAD, stream per-desk
Fix the wrong-shaped `data-agent-progress` payload (currently crashes the chat
UI ~2s into every queued Full run) by moving `committeeProgressSnapshot` into
`@kestrel/ai` and using it from both web and worker. Plan: Phase 1 task 1.1.

### Still open (needs owner)
- Q5 planner: wire or delete (recommended: delete).
- Q6 XAUUSD convergence: keep verified-report pipeline, unify collection only
  (recommended; do not merge schemas).
- Q7 alert noise control: wire live now (recommended) or leave dormant.
- Q8 4-mode compat shim removal timing (recommended: Phase 4).
- Q9 stuck durable jobs: terminal error + Retry (recommended) vs longer polling.

---

## 2026-10-12 — Audit v2 implementation — Decider: Implementing agent (owner directive: complete all phases) — Phases 1–5 status + Q5–Q9 adopted recommendations

Owner directed full implementation of `kestrel-ai-agentic-audit-v2.md`. The
owner was not available mid-run for §13 Q5–Q9, so the plan's own recommended
answers were adopted and are listed below for confirmation/rollback. Q1–Q4
were answered directly by the owner (entry above).

### Adopted recommendations (pending owner confirmation — all reversible)
- **Q5 planner: DELETE.** `workflows/planner.ts` has no live caller (verified:
  only barrel exports reference `runPlanner`/`plannerRequired`). Removed in the
  Phase 4 cleanup batch. Rollback: `git revert` of the cleanup batch.
- **Q6 XAUUSD convergence: unify collection only.** The verified XAUUSD
  report pipeline and its richer evidence assembly are kept; the conversation
  paths move onto the shared 30s fresh-only cached collector with
  `includeMacro` so burst traffic shares one cache (Phase 2.1).
- **Q7 alert noise: wired live now.** `evaluateNoise` is called from
  `deliverAlert` with DB-persisted dedup/cooldown/quiet-hours state
  (`notification_noise_state`); suppressed deliveries are skipped, not
  fatal, and counted in `alert_noise_suppressed_total{reason}`.
- **Q8 4-mode shim removal: NOW (Phase 4).** `quick|standard` no longer
  normalize to `single|full`; routes reject them with clean 4xx. Consequence:
  any pre-collapse durable queue rows still carrying legacy modes fail with a
  clear parse error instead of silently re-mapping. No release shipped between
  the shim's introduction and its removal in this working tree.
- **Q9 stuck durable jobs: terminal error + client-side patience.** Client
  poll window raised 5min → 30min and only errors on terminal states
  (1.10); reservation recovery no longer steals reservations backed by a live
  queue lease (`recoverStaleBudgetReservations` gated on
  `full_analysis_queue` pending/running-with-lease, 1.11 heartbeat piece), so
  reconcile always applies actual cost. Worker-side dead-letter/Retry UX
  remains backlog (needs live queue observation).

### Phase 1 (all landed; full ai suite 1493 pass / 22 skip, web 1208 pass, worker 145 pass)
- **1.1 (Q4):** shared `committeeProgressSnapshot` in `@kestrel/ai`
  (`mastra-v2/shared/progress.ts`); worker stores the full `{agents,mode,status}`
  snapshot; UI + transport guard against a missing `agents` array. Crash test
  added (agent-deliberation renders nothing instead of throwing).
- **1.2 (P0-2):** one grounding helper (`committee/grounding.ts`); opinion
  verifier grounds every narrative number against packet evidence when the
  packet is ready; fusion verifier no longer launders specialist numbers
  (`opinionGroundedValues` bypass removed); single mode runs the same strict
  fusion verification. Scenario-projection wording stays exempt (window-based).
- **1.3 (Q1, P0-3):** `checkCanonicalEvidence` strengthened — shared
  narrative extractor with new date/slash-date/"in/since/by year" structural
  masking, percent claims excluded, price-band filter (decimals or ≥1000);
  "market tool used" separated from "value present in tool output"
  (`extractToolEvidence`); both canonical paths record `answerOutcome:'blocked'`
  then throw `CanonicalEvidenceBlockedError` (422 `EVIDENCE_UNVERIFIED` at the
  route). **Stream-path caveat:** tokens stream live before the gate runs at
  completion, so a blocked streamed turn shows the refusal as the final text
  and persists ONLY the refusal (never the unverified answer) — the turn
  reloads as a clean refusal. A fully-withheld stream would require buffering,
  which the plan forbids (live token streaming is a preserved strength).
- **1.4 (P0-4):** breaker wired into `finishMastraRun` terminal outcomes keyed
  by resolved model id; `isCircuitOpen` call sites pass model ids; DB
  `consecutive_failures` gains the L1 60s-window reset semantics; read/write
  key identity asserted in tests; `circuit_open_total{model}` emitted.
- **1.5 (P0-5):** rate table precedence inverted — catalog wins over
  `STATIC_RATES` (3 real collisions fixed incl. `google/gemini-3.5-flash`
  ~5× under-pricing); precedence tests added.
- **1.6 (P0-6):** model-authored label exemptions deleted from XAUUSD
  grounding; `NumericClaimSchema.role: 'observed' | 'projection'`; projections
  exempt from exact match only inside ±25% of the claim's cited evidence;
  scenario levels value-checked against their `evidenceIds` band;
  "Target 9999" fails with or without a label.
- **1.7 (P1-1):** each desk's critique prompt restates its own opinion as its
  initial position (labeled, data-not-instructions) so "confirm your position"
  is answerable.
- **1.8 (P1-3):** both fusion attempts (first + bounded repair) render through
  one helper; structured repair re-parses `repairResult.object` through
  `FusionAnswerSchema` + `renderFusionAnswer`; repaired text re-verified
  (second failure still terminal).
- **1.9 (P1-4):** XAUUSD conversation/report guardrails derive from
  `executionPlan.guardrail` (strict+block for untrusted capabilities) instead
  of the legacy rewrite+availability builder; route maps
  `GuardrailUnavailableError`→503 `GUARDRAIL_UNAVAILABLE` and Mastra
  `TripWire`→422 `INJECTION_BLOCKED`. Known residual: tripwires serialized at
  deep workflow step boundaries surface as 502 (noted by implementer).
- **1.10 (P1-6/7/9/11/12/14/15):** outbox conflict SET guarded by
  `WHERE status NOT IN ('processing','completed')`; thread delete cascades
  chat rows + backfill/projection/synopsis/embeddings + Mastra
  thread/messages/vectors in one transaction (resource rows deliberately
  kept — user-scoped working memory); packet-cache rollback passes
  `includeMacro`; follow-up safety uses parsed numeric sets + new order-intent
  verbs; injection regex catches `system:`/`developer:`/`ignore the above
  instructions`; poll cap 5min→30min with "still running" wording; transport
  unwraps `{error:{code,message}}` envelopes and the UI renders
  `error.error.message`.
- **1.11 (P1-5/8/16/17/18/21 + Q3):** macro news titles/summaries/event titles
  quarantined before parse (skipped + warning + degraded quality);
  `evaluateNoise` wired into `deliverAlert` with persisted state (fail-open on
  state read errors; keys recorded only after confirmed delivery); channel
  loop only short-circuits on `ok`, unconfigured channels skip;
  `xauusd-research` manifest fixed to the real hyphenated tool ids and the
  integrity check now asserts resolvability against actual registered tool
  ids; advisory `operator_key_fallback_total{provider}` + debug log on every
  operator-key merge (no gating, Q3); `recoverStaleBudgetReservations` gated
  on active-queue-lease absence.

### Phase 2–5 (landed or in flight at time of this entry)
- **2.3:** packet single-serialization verified across desks/retries by test
  (WeakMap keyed on the packet object; `contextWithPacket` stores by
  reference). **2.4:** XAUUSD setup emits `mastra_setup_latency_ms{phase}`
  (memory/guardrail) and the two conversation paths overlap packet collection
  with memory/guardrail prep via `Promise.all`; blocked-packet early-returns
  now report the real memory mode. **2.1/2.2:** XAUUSD conversation
  collection unified onto the cached collector (per Q6) and the Redis mirror
  write made fire-and-forget (never awaited on the request path).
- **3.1 (Q2):** fusion result exposes `fusionModelId/fusionProviderId`; the
  fusion span reports the real per-agent model when diversity is opted in
  (default stays OFF). **3.2:** typed `requestContext` handoff was already
  satisfied by the v1 zero-copy work + 1.7 (fusion reads typed
  packet/opinions/critiques; specialists read the typed packet) — recorded,
  no re-implementation. **3.3:** optional bounded debate round added behind
  `ENABLE_COMMITTEE_DEBATE` (default 0): after critique, each desk may revise
  once; revisions pass the same deterministic verification and a failed
  revision is a failed desk (Q3); fusion prefers revised opinions.
- **4.6 (Q8):** legacy 4-mode shim removed (see Q8 above). **4.7:** Views
  Terminal fake rows removed (WS:CONNECTED/~18ms/worker.state) — panel now
  shows only real chart + run-progress data. **4.8:** landing FAQ updated —
  "every number checked" sharpened to the true strict-failure behavior;
  fabricated per-desk model families replaced with the real default (one
  user-selected top-tier model shared by all desks, optional per-desk
  overrides, never a cheaper tier).
- **5.1:** eval gate gained a stored baseline artifact
  (`docs/archive/audit-v2/eval-baseline.json`, regenerate with
  `pnpm eval:gate -- --update-baseline`), fails on a >5% relative drop vs
  baseline (absolute thresholds still apply), and zero-scores-for-a-day now
  emits a loud CI `::warning::` (exits 1 with `--fail-on-empty`). Gate scripts
  are now typechecked (`scripts/**` added to tsconfig include). Baseline doc:
  `docs/archive/audit-v2/baseline.md`. **5.2:** metrics
  `committee_grounding_rejected_total{reason}`,
  `committee_opinion_verification_total`, `canonical_evidence_blocked_total`
  added (naming note: plan said `canonical_evidence_degraded_total`; Q1 made
  the outcome a block, so the metric is named `…blocked_total`); failure
  detail surfaced through the admin mastra-runs view. **5.3 (Q4):**
  non-blocking admin spend-threshold watch in System Health (never gates a
  turn).
- **4.1/4.2 (final batch):** the 71 `src/mastra/*` shims are deleted and
  barrels repoint at `mastra-v2` in one atomic change (tracked separately at
  the end of this session's log entries); `knip` findings reduced to zero
  (`@changesets/cli` devDep removed, css project files added) and the CI Knip
  step flips from report-only to blocking once the tree is green.

### Explicitly deferred (P2s without a phase task — backlog, needs owner triage)
- P2-7: fire-and-forget embed in `briefings/generate.ts` lacks `.catch`.
- P2-8: semantic-routing cost dropped when callers pass no ledger.
- P2-12: SignalR `subscribedSymbols` dedupe + worker health during rebuild.
- P2-14 (unless fixed by the budget collapse): `isBudgetEnforced()` memoized
  once per process.
- Manual smoke of §3.1 routes and live p95/cost/cache-hit measurements
  require a running deployment (no live DB in this environment); unit,
  typecheck, lint, route-security (111 routes), and full workspace suites are
  the verification basis here.

---

## 2026-10-12 — Audit v2 final gate — Decider: Implementing agent — Phases 4.1/4.2 atomic cleanup landed; full verification green

Follow-up to the entry above: the final Phase 4 batch and the whole-plan
verification gate are complete.

### 4.1 Shim layer removed (atomic)
- All 70 per-module re-export shims under `packages/ai/src/mastra/` deleted;
  365 import specifiers across 121 files repointed at `mastra-v2` directly.
  `src/mastra/index.ts` is now the only file there — the thin public barrel
  for the `@kestrel/ai/mastra` subpath (kept so web/worker imports are
  unchanged). `package.json` subpath `./mastra/routing-policy` repointed at
  `dist/mastra-v2/planning/routing-policy`. `dist/` rebuilt clean (the
  `dist/mastra/` dir now holds only the barrel). `docs/architecture.md`
  updated to match.

### 4.2 Dead modules deleted; knip blocking
- Deleted (with tests): `workflows/planner.ts` (Q5: DELETE — no live caller
  existed), `verification.ts` + `verification/regex.ts` (citation enforcer;
  the `CitationWarningPartView` UI component is deliberately KEPT — the live
  `data-verify-warning` part reuses it and historical messages still parse),
  `prompt/system.ts` (`LiveSnapshot` type moved to `context.ts`, its only
  live consumer), `token-estimate.ts`, `thread-state.ts`, `auxiliary-usage.ts`,
  `model-strategy.ts` (MODEL_ROUTER/TIER_TO_DOMAIN/routeModelByDomain — zero
  live callers), `util/concurrency.ts`, web dead services
  `mastra-{canonical-chat,canonical-response,mode-response,chat-routing}.ts`,
  and the buffered `runMastraModeChat`.
- knip: `@changesets/cli` devDep removed, css project files added to knip
  config, zero findings from the workspace root, and the CI Knip step flipped
  from report-only (`continue-on-error`) to **blocking**.

### Verification gate (all green)
- `tsc --noEmit`: shared, data, db, indicators, ai, web, worker — 0 errors.
- Full suites: ai 1381 passed / 22 skipped (Postgres-gated), web 1199 passed,
  worker 145 passed.
- `pnpm turbo run lint`: 14/14 packages, 0 errors (warnings pre-existing).
- `pnpm check:route-security`: 111 routes pass.
- `pnpm knip`: exit 0 from the repo root.
- Eval gate smoke: skip path exits 0 without DATABASE_URL; baseline compare +
  `--update-baseline` covered by unit tests (7/7).
- NOT runnable here (no live deployment): manual §3.1 route smoke, p95
  latency/cost/cache-hit measurements, and the eval baseline artifact itself
  (generate on main with real telemetry via
  `pnpm eval:gate -- --update-baseline`).

### Subagent infra note
Three long-running subagents died on API "Headers Timeout" errors mid-run
(debate tests, 4-mode shim, and an earlier attempt); all of their on-disk
edits were kept and their remaining tails were completed by the implementing
agent (4.6 leftover tests/comments, the 3.3 test suite, 4.4 retention tail,
lint fixes). Nothing was lost — edits land in the working tree as they are
made; only unwritten work is lost, and it was redone.

---

## 2026-10-14 — Audit v3 Owner Decisions (Hama)

- **Q8 (Specialist Agent Skills, Goals & Dedicated Tools):** Each of the 4 committee specialist agents (`technical`, `fundamental`, `risk`, `sentiment`) MUST have its own dedicated Skill Playbook, specific analytical goal, and domain-specific read-only toolset (`maxSteps: 3`) in addition to an enriched baseline `SymbolResearchPacket` for all symbols. Any numbers returned by a specialist's tool calls must be dynamically merged into the run's verified evidence ledger (`AllowedEvidenceSet`) so `verifyMastraOpinion` and `verifyFusionAnswer` remain 100% strict (`strict: true`) without false-positive blocks.
- **Q9 (Simple Non-Technical Language & Choosable Mode in Telegram/UI):** Use simple, plain-English trader language across Telegram and UI surfaces (no internal jargon like "Mastra committee", "canonical", or "packetId"). Users in Telegram must be able to choose between **Quick Check (1 Expert)** (`single`) and **Full Team Analysis (4 Experts)** (`full`) via command flags (`/analyze XAUUSD 1h quick|full`) or interactive Telegram inline buttons.
- **Q10 (Canonical Evidence Gate Self-Correction + Clean UI Replacement):** On ungrounded numbers in canonical chat, automatically run **1 silent self-correction pass** (instructing the agent to either call the appropriate market tool or rewrite using only verified numbers from the turn's evidence ledger). Only if the retry still fails verification, emit `data-evidence-blocked` so the live UI cleanly replaces the unverified text instead of concatenating the refusal message.
- **Q11 (Enable In-Chat `convene_committee` Tool):** Enable `convene_committee` in `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` and wire `conveneCommitteeTool` (`packages/ai/src/tools/system.ts`) to `runCommitteeWorkflow` so regular chat can summon the 4-expert team on demand and render `ConveneCommitteePart`.
- **Q12 (Enable Structured Fusion by Default):** Enable `PHASE3_STRUCTURED_FUSION` by default (`process.env.PHASE3_STRUCTURED_FUSION !== 'false'`) in `full` mode so every Full Team Analysis produces a verified, plain-English Bottom Line, Main Thesis, Bull/Base/Bear Scenario Table, Key Risks, and Invalidation Level.
