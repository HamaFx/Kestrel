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

Implementation status for `docs/plans/kestrel-ai-agentic-audit-and-upgrade-plan.md`
(Phases 0–5), recorded here per §12 Rollout ("decisions.log updated per PR").

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
