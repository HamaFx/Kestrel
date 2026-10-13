# Kestrel AI & Agentic Systems — Audit v2 & Upgrade Plan

> **For:** the implementing AI agent. Read this file top to bottom, execute phases in order.
> **Source audit date:** 2026-10-11/12 (fresh, code-verified).
> **Audited revision:** `main` @ `bb2cb51e` (monorepo: `apps/web`, `apps/worker`, `packages/{ai,data,db,indicators,shared}`).
> **Auditor stance:** every claim in `docs/`, the landing showcase, and inline comments was treated as a *claim to verify against code*. Findings below carry `file:line` evidence. Where the previous audit plan (removed from this repo on 2026-10-12; its history is in `docs/plans/decisions.log.md`) claimed a fix, this audit re-verified whether the fix actually ships and is reachable.
> **Relationship to prior plan:** the previous plan was *implemented* but several of its P0/P1 fixes were **built but never wired** or **implemented incorrectly**. This document supersedes it (the prior plan file has been deleted) and is the single source of truth for the next round of work.

---

## 1. Executive Summary & Verdict

### One-sentence verdict

Kestrel is **still only partially multi-agent**, and — more importantly — **several of the safeguards the product and docs promise do not actually execute on the user's path**. It is a well-structured fan-out/synthesize committee plus one tool-using single agent, wrapped in a genuinely solid durable queue, but the **grounding layer is circular (specialists trust themselves), the circuit breaker is unreachable dead code, and the durable Full progress payload crashes the chat UI**.

### Scores (1–10, 10 = excellent)

| Dimension | Score | Why |
|---|---|---|
| **True multi-agent depth** | **4/10** | `committee/workflow.ts` is real fan-out + one synthesis. Cross-critique exists but is asked to "confirm your position" *without showing the desk its own position*. Model diversity is off by default. No inter-agent messaging beyond one critique round. |
| **Correctness / grounding** | **3/10** | Specialist numeric grounding is circular (`verifier.ts` only checks numbers when the packet is *not* ready). Fusion trusts specialist numbers unconditionally. Canonical evidence check is advisory-only. Committee "verification" mostly does not verify. |
| **Stability** | **4/10** | Durable Full progress payload has the wrong shape and crashes the chat surface ~2s into every queued Full turn. Circuit breaker never opens. Long reservations can be released mid-flight. |
| **Performance** | **5/10** | Packet cache + indicator memo are real wins. But the XAUUSD path is uncached with divergent windows, indicator recompute still exists there, and Redis mirror writes are awaited on the request path. |
| **Maintainability** | **3/10** | Two generations still coexist (71 `src/mastra/*` shim files, 370-line `src/mastra/index.ts`), three budget modules, three routing entry points, a large inventory of dead exported modules, and 4-mode legacy values still accepted everywhere. |
| **Advanced / scale readiness** | **4/10** | Promising bones (workflow snapshots, generation ledger, capability manifest, atomic reservations) but the planner is unwired, the circuit breaker is decorative, evals are an absolute-threshold no-op with no baseline. |

### The fix in one paragraph

Wire the safety machinery that already exists: (1) fix the **wrong-shaped durable-Full progress payload** that crashes the UI; (2) make **specialist numeric grounding real** so the fusion verifier is no longer circular; (3) **gate** canonical answers on the evidence check instead of merely recording it; (4) **call** `recordModelFailure/Success` and use one key on read and write so the circuit breaker actually opens; (5) fix the **cost-table collision** that under-prices the default Google model ~5×; (6) fix the **XAUUSD label-exemption** that lets model-authored labels bypass grounding. Then collapse the shim layer, delete the dead modules, unify the legacy 4-mode shims, and give the eval gate a real baseline. Everything else is cleanup and performance.

---

## 2. Method & Coverage

**Read directly (not sampled):** `/api/chat/route.ts`; `committee/*` (`workflow`, `specialists`, `specialist-runner`, `synthesizer`, `critique`, `verifier`, `fusion-verifier`, `prompts`, `types`); `mastra-v2/planning/*` (`router`, `execution-plan`, `execution-decision`, `mode-runner`, `routing-policy`); `mastra-v2/capabilities/index.ts`; `mastra-v2/guardrails.ts`; `mastra-v2/packets/packet-cache.ts`; `mastra-v2/memory.ts`; `mastra-v2/agents/canonical/index.ts`; `mastra-v2/workflows/full-analysis.ts`; `budget.ts`; `model-circuit-breaker.ts`; `apps/web/src/lib/services/mastra-{mode,execution}.ts`; `apps/web/src/lib/chat-transport.ts`; `apps/web/src/components/chat/*` (top-bar, screen, agent-deliberation); `apps/worker/src/jobs/multi-agent-analysis.ts`; `.github/workflows/*`; `scripts/eval-gate.ts`.

**Delegated to subagents (code-verified, file:line evidence):** data/evidence packets + tools + caching; memory/persistence/ledger; model resolution/BYOK/budget/resilience; reasoning/grounding/guardrails/mutation; UI surfaces + worker + alerts/briefings/telegram; evals/observability/CI/reachability. All six returned evidence-backed reports; their P0s were re-verified directly by the lead auditor.

**Not exhaustively line-audited (flagged as follow-up):** every `apps/web/src/app/api/**` route individually; `packages/data` adapter failover internals; E2E Playwright suites; `loadtest/`. The implementing agent should re-verify the inventory in §11 at implementation time.

---

## 3. What the User Actually Sees

### 3.1 Two surfaces

- **Unauthenticated landing:** `landing-hero.tsx` (2-mode copy: "Single or Full committee"), `landing-desks.tsx`, `landing-stepper.tsx`, `landing-architecture.tsx` ("4-Desk Multi-Agent Deliberation Sandbox"), `landing-faq.tsx`. The FAQ (line 38) promises: *"Every number in the verdict is checked against market data and desk opinions before it reaches you."* **This claim is not true today** (see P0-2). The FAQ also names model routing ("Claude 3.7 Sonnet… Gemini 2.5 Flash… DeepSeek-R1") that the code does not implement (kestrel has a BYOK model picker, not per-desk hardcoded families).
- **Authenticated app:** `/chat` is the AI surface. `ChatTopBar` has a **2-option** mode selector (`MODE_LABELS = { single, full }`, `chat-top-bar.tsx:63-71`). `ChatScreen` renders `AgentDeliberation` when `showAgentOpinions && agentProgress` (`chat-screen.tsx:477-486`).

### 3.2 The three chat paths

| Trigger | Route | What happens | User-visible |
|---|---|---|---|
| Symbol-free prompt, or any mode without a detected symbol | `canonical-chat` | Streaming tool-using single agent (`agents/canonical/index.ts`) | Token stream + tool cards; `evidence` recorded but **never acted on** |
| Detected symbol + `mode=single` | `symbol-research` | Committee workflow, 1 technical desk, strict | SSE `data-agent-progress` snapshots (real) → final text |
| Detected symbol + `mode=full` | `full-analysis` | Durable queue → worker → same committee, 4 desks + critique | Queued JSON → poll loop → **progress payload shape mismatch (P0-1)** |
| `XAUUSD` + analysis phrasing + `mode=single` | `xauusd-research` | Separate verified-report pipeline | Buffered verified report with evidence IDs |

**Key UX findings (verified):**

1. **P0-1 — Durable Full crashes the deliberation panel.** The worker persists steps as `{ type:'data-agent-progress', data:{ step } }` (`full-analysis.ts:529-532`, fed by `multi-agent-analysis.ts:279-282`). The poller forwards `last.data` verbatim as `AgentProgress` (`chat-transport.ts:412-420`). `ChatScreen` passes `agentProgress.agents` into `AgentDeliberation` (`chat-screen.tsx:477-486`), which immediately calls `agents.some(...)` (`agent-deliberation.tsx:119`). `agents` is `undefined` for `{step:'technical'}` → **TypeError ~2s into every durable Full turn**, caught by the chat error boundary. The sync path (`services/mastra-mode.ts:61-96`) emits the *correct* `{agents,mode,status}` snapshot, so only durable Full is broken.
2. **P1 — Raw JSON error envelopes are shown to users.** `/api/chat` always returns JSON (`route.ts:82-84,104-112`). The AI SDK throws `new Error(await response.text())` on non-2xx, and `chat-screen.tsx:526` renders `error.message` verbatim. Rate-limit/budget/validation/502 errors display as literal `{"error":{"code":...}}`.
3. **P1 — "Full" can finish after the UI has already given up.** The poller aborts at `MAX_POLL_TIME_MS = 5*60_000` (`chat-transport.ts:310,480-487`) and shows "Background analysis timed out". The worker (90s lease, 3 attempts) can legitimately exceed 5 min and *later* persist the assistant message, which then appears silently on reload.
4. **P2 — Fake telemetry.** The Views → Terminal tab renders hardcoded `WS: CONNECTED`, `feed.latency ~18ms`, `worker.state IDLE` (`thread-views-dock.tsx:219-238`).
5. **P2 — 4-mode legacy still accepted.** `/api/chat/threads/[id]` and `/api/settings/analysis-mode` still parse `quick|standard|auto` and silently normalize (`threads/[id]/route.ts:36-42`, `services/settings.ts:47-59`). Intentional one-release shim, but it should be scheduled for removal.

---

## 4. What Agents Actually Do (Inventory)

| # | Component | Kind | File | Real agentic? | Tools? | Memory | Reachability |
|---|---|---|---|---|---|---|---|
| 1 | `kestrel-mastra-canonical-chat` | Agent | `mastra-v2/agents/canonical/index.ts` | Yes (single) | Yes (read-only allowlist) | read+write | **Live** (streamed) |
| 2 | committee `symbol-research` | Workflow (1 or 4 desks + critique + fusion) | `committee/workflow.ts` | Yes (fan-out + 1 critique round) | No (`toolChoice:'none'`) | read-only desks, fusion writes | **Live** (sync single path) |
| 3 | `full-analysis` durable | Queue wrapper | `mastra-v2/workflows/full-analysis.ts` + worker job | delegates to #2 | No | forced observational memory | **Live** (worker) |
| 4 | `xauusd-report` | Workflow (1 agent + repair) | `mastra-v2/workflows/xauusd-report.ts` | No (single + deterministic repair) | No | injected | **Live** |
| 5 | XAUUSD conversation | Agent | `mastra-v2/agents/xauusd/run.ts` + `text-runner.ts` | Yes (single) | Yes (XAUUSD tools) | read+write | **Live** |
| 6 | `mutation` | Workflow (suspend/resume) | `mastra-v2/workflows/mutation.ts` | No (deterministic) | No | No | **Live** |
| 7 | planner | Workflow | `mastra-v2/workflows/planner.ts` | Yes | No | No | **DEAD** — exported only, no live caller (`grep runPlanner` → barrels only) |
| 8 | `runMastraModeChat` (buffered) | Service | `services/mastra-mode.ts:112` | — | — | — | **Test-only** (`runMastraModeChatStream` is the live one) |
| 9 | `runMastraCanonicalChat` + `runMastraCanonicalChatService` | Agent/Service | `agents/canonical/index.ts:392`, `services/mastra-canonical-chat.ts` | — | — | — | **DEAD** (only the `…Stream` variant is routed) |

**Count:** 2 real standalone agents + 1 true multi-agent workflow + 3 single-agent workflows + 1 deterministic workflow + 1 dead planner + 2 dead services. **Only one path is genuinely multi-agent, and it is only reachable for one mode.**

---

## 5. Data Flow — End to End

### 5.1 Happy path (canonical)

```
Composer → useChat → createKestrelChatTransport (X-CSRF + X-AI-Prefs)
  → POST /api/chat (runtime nodejs, maxDuration 60, withAuth, withRateLimit ai_chat)
      parseJsonBody → getThread → resolveMode → getUserWithSettings
      → routeUnified (one classification pass: domain/symbol/injection/mutation/capability/model)
      → createExecutionPlan (reuses unified decision)
      → switch(route):
          full-analysis  → enqueueFullAnalysis (DB row + budget reservation) → {analysis-queued}
          xauusd-*       → runConversationalTurn / runResearchWorkflow
          symbol-research→ runMastraModeChatStream (SSE, live progress)
          canonical-chat → runMastraCanonicalChatStreamService (SSE token stream)
```

### 5.2 Evidence / trust boundaries

- Tools are registered **explicitly** (`registerAllTools`, `tools/index.ts:51`, called at `mastra-v2/instance.ts:96`) — side-effect-free. ✅
- Committee specialists are provably **tool-less and read-only** (`toolChoice:'none'`, `specialist-runner.ts:134-144`; `readOnlyMemoryOptions`). ✅
- **P1 — Untrusted macro content is not quarantined on the XAUUSD packet path.** `assembleXauusdMacroEvidence` runs `news.map(NewsArticleSchema.parse)` (`research-packet-macro.ts:121`) and stores raw titles/summaries, which flow into the agent's instructions (`agents/xauusd/model-context.ts:91`, `agent.ts:77,90`). The `quarantineExternalText` helper exists and is applied by the news/calendar *tools* but **not** on this path.
- **P2 — `xauusd-research` capability tool names are phantom.** The manifest lists underscore ids (`get_xauusd_research_packet`, `capabilities/index.ts:425-459`) but the real Mastra tool ids are hyphenated (`get-xauusd-research-packet`). The list is decorative; integrity check passes only because underscore names are whitelisted.

### 5.3 Packets & caching

- Packet cache is **fresh-only** and correct in spirit (`isFreshCacheablePacket`, `packet-cache.ts:113-121`; 30s TTL, 15s bucket, in-flight dedup). ✅
- **P1 — Rollback flag changes packet contents.** With `PHASE2_PACKET_CACHE=0`, the rollback branch calls `collectSymbolResearchPacket(symbol, signal)` with **no options** (`packet-cache.ts:200`), dropping `includeMacro` that the enabled path attaches (`:211-213`). Disabling the cache silently disables the XAUUSD macro bridge.
- **P1 — XAUUSD path is uncached and uses divergent windows.** `collectXauusdResearchPacket` has no cache wrapper and uses 200/200 windows (`research-config.ts:24-29`) vs the committee's 160/160 (`symbol-research.ts:38-43`), so the two pipelines cannot share the data-layer candle cache and the XAUUSD paths re-hit providers every turn.
- **P2 — Redis mirror write is awaited on the request path** (`packet-cache.ts:214-216,182`), contradicting its own "never affect the request path" comment; with `lazyConnect` to an unreachable host this can stall the response.
- **P2 — Broken regex / dead code:** `SYMBOL_PATTERN` uses `\b` inside a non-raw template (backspace, not word boundary) and is dead; `isSafeSymbolResearchPrompt` has a broken `\\s` regex; `RESEARCH_MACRO_GAP`, `'succeeded'` enum, `ModelGeneratedEvidenceSchema`, `CompactCandlesEvidence` are unused.

### 5.4 Persistence

- Authoritative split is clean: **Drizzle is authoritative** for chat/telemetry/budget; **Mastra is authoritative** for agent memory/snapshots (`shared/persistence-boundary.ts`). ✅
- **P1 — Outbox self-re-enqueue corrupts terminal state.** On replay, a failing write calls the same reporter with the identical `dedupeKey`, colliding with the outbox row being processed; `enqueuePersistenceFailure`'s conflict `SET` unconditionally writes `status='pending'` unless already `completed` (`persistence-outbox.ts:68-76`), clobbering `processing`. `markFailed` then matches zero rows, so `attempt_count`/lock do not advance via that path → rows strand as `pending` forever and never dead-letter.
- **P1 — Thread deletion never deletes Mastra memory.** `deleteThreadService` only deletes `chat_threads` (`thread-persistence.ts:232-244`); Mastra threads/messages and `memory_backfill_state`/`memory_projection_state` (no FK) survive, so "deleted" conversation content stays queryable for the retention window.
- **P2 — Memory degraded is surfaced only on canonical.** `data-memory-degraded` is emitted only in `mastra-canonical-chat{,-stream}.ts`; XAUUSD/mode paths set `memoryMode:'degraded'` in meta only, and **no UI component reads `memoryMode`** (grep returns nothing). Research-path users never see that recall is off.
- **P2 — Unbounded growth:** `memory.resources` is omitted from retention; `mastra_observational_memory` is excluded from retention but force-enabled on durable Full (`mode-runner.ts:275`); backfill/projection state tables grow per thread.
- **P2 — Title generation races + spend lost.** `updateThreadTitle` is an unconditional UPDATE (`thread-persistence.ts:168-188`) guarded only by an in-memory read, so concurrent first turns double-spend. Title/routing cost is written to the in-memory ledger but never reconciled to `daily_ai_spend` (web paths never pass `accounting.onComplete`).

---

## 6. Inter-Agent Communication Audit

| Claim | Reality | Verdict |
|---|---|---|
| "Committee deliberates" | Specialists run in `.parallel()` and **never see each other during generation**. Only the critique round reads peer output. | Fan-out, not conversation. |
| "Cross-critique" | Exists, ON for Full by default (`workflow.ts:332`), but **a desk is never shown its own opinion** — `critiqueInstructionsForRequest` says "critique your own position… confirm your previous position" while passing only `peerBlock` (`prompts.ts:156-189`), and `peerOpinions` explicitly filters out the desk's own (`workflow.ts:375`). The desk cannot see what it is asked to confirm. | Broken round. |
| "Agents share context" | They share one serialized packet string, computed once per run via a WeakMap (`prompts.ts:66-78`) and read from `RequestContext`. ✅ No 5× duplication. | Broadcast, correctly deduped. |
| "Fusion debates" | Fusion receives opinions + critiques as text blocks; no structured disagreement extraction, no second round. | Aggregation. |
| Memory isolation | Specialists use `readOnlyMemoryOptions`; only fusion writes. ✅ | Correct. |

**Missing patterns:** a real critique round (show the desk its own prior opinion and require it to read peers), a structured `CommitteeContext` handoff instead of string blocks, and (optionally) a bounded second debate iteration for `full`.

---

## 7. Thinking / Reasoning / Answering Audit

| Path | Grounding mechanism | Blocking? | Gap |
|---|---|---|---|
| **Canonical chat** | `checkCanonicalEvidence(text, toolNames)` (`agents/canonical/evidence.ts`) | **No** — result is recorded in meta only (`canonical/index.ts:442,613`); nothing consumes `evidence.ok` (grep: zero callers). `answerOutcome` is `'ready'` whenever text is non-empty. | **P0-2.** A hallucinated price with no market tool is persisted and shown. The check itself is also weak (counts every digit run, tool-detection is a name-substring regex). |
| **Committee specialists** | `verifyMastraOpinion` (`verifier.ts`) | Only when packet **not ready** (`:53-55`); for a ready packet it checks identity/confidence/reasoning only — **no numeric grounding**. | **P0-2 (circle).** |
| **Committee fusion** | `verifyFusionAnswer` (`fusion-verifier.ts`) | Yes (one repair, then throw). But `opinionGroundedValues` treats **every** number in specialist reasoning as grounded (`:90-97`), with the false comment "specialist reasoning is itself verified." Scenario exemption uses `text.indexOf(key)` (wrong occurrence) with a ±32-char window on generic words (`target\|entry\|trigger\|risk`), so any number near "Risks:" is exempt. | **P0-2.** A specialist invents a price → fusion cites it → passes. |
| **Fusion (single mode)** | none | `synthesizeCommitteeAnswer` returns `opinions[0].reasoning` verbatim (`synthesizer.ts:150-155`); `verifyFusionAnswer` is never called for `mode==='single'`. | **P0-2.** Same hole on the shortest path. |
| **XAUUSD report** | `report-grounding.ts` + `report-verifier.ts` + `report-safety/temporal` + repair loop | Yes, with evidence-id attribution. ✅ **Strongest path.** | **P0-6:** `isStructuralParameterClaim` exempts any 1–500 integer whose label contains `rsi\|ema\|atr\|macd\|period`, and `isScenarioProjectionClaim` exempts any claim whose label contains `target\|invalidation\|trigger\|entry\|tp\|sl`. Labels are **model-authored**, so a fabricated `{label:"Target 9999", value:9999, evidenceId:<valid>}` bypasses grounding entirely. |

**Other reasoning-hygiene findings:**
- **P1 — Injection regex is narrow.** `INJECTION_TERMS` (`routing-keywords.ts:123-124`) misses `"system: you are now…"` (the `\b` fails after `:`), `"developer: hi"`, and `"Please ignore the above instructions"`. The LLM backstop uses `strategy:'block'` → Mastra `TripWire`, which surfaces as a stream error rather than the clean 422.
- **P1 — Guardrail mode inconsistency for `xauusd-conversation`.** The capability is `contentTrust:'untrusted'` → manifest policy `strict+block`, but the conversation runner only requests conversation guardrails (`buildConversationGuardrails`, `rewrite+availability`), so a missing detector silently degrades to normalizer-only while the agent exposes untrusted news/calendar/social tools.
- **P1 — Follow-up safety is defeated by substring/comma matching.** `trustedContext.includes(number)` is a substring test (`followup-safety.ts:36-38`): packet `3400.5` makes `"340"` pass; `"3,400"` extracts `3`; only the first number per sentence is checked, and `"I'd enter at 3450"` is never scanned.
- **P1 — Dates are treated as ungrounded market claims.** `NARRATIVE_NUMBER_PATTERN` has no date exclusion (`report-grounding.ts:143-144`), so `"As of 2026-05-26…"` fails grounding and can exhaust the repair budget on a valid report.
- **P2 — `verification.ts` (`enforceCitations`) is dead** (zero production importers; UI `CitationWarningPartView` never receives a part). **`prompt/system.ts` (`buildSystemPrompt`/`buildLiveSnapshot`) is dead** yet its `LIVE_SNAPSHOT` rule is still referenced by tool descriptions.
- **P2 — Structured-fusion repair bypasses the renderer.** `synthesizer.ts:230` sets `finalText = repairResult.text` even when `useStructuredFusion` was true on the first pass (which renders via `FusionAnswerSchema.parse` at `:209-211`), so a repaired structured answer can be raw JSON/empty and then fails re-verification.

---

## 8. Strengths to Preserve (verified, not claimed)

1. **Atomic budget reservations.** `tryReserveBudget` uses `INSERT … ON CONFLICT … WHERE spent+est <= cap RETURNING` in one transaction; reconcile/release lock the row `FOR UPDATE` and gate on `status='reserved'`, so duplicate terminal callbacks cannot double-apply (`cost.ts:248-454`). Ledger-only default (`ENFORCE_BUDGET` off) is correctly wired (`budget.ts:58-60`).
2. **Durable Full queue is genuinely robust** — atomic claim, heartbeat lease, ownership-conditional terminal transitions, stale-run recovery, retry categorization, retention purge (`full-analysis.ts`, `multi-agent-analysis.ts`). The *only* defect is the progress payload shape (P0-1).
3. **BYOK crypto is sound** — AES-256-GCM, random 12-byte IV, hex-key validation, decrypt returns null on tamper without leaking plaintext (`encryption.ts`). Keys are decrypted per resolution (no global plaintext cache).
4. **Mutation confirmation is strong** — HMAC-SHA256 single-use token over `userId:inputDigest:expiresAt`, timing-safe compare, persisted-context re-validation on resume, server-derived identity (`mutation-policy.ts`, `workflows/mutation.ts`, `api/chat/mutations/confirm`).
5. **Read-only specialist isolation is enforced in code**, not prompts.
6. **Explicit, side-effect-free tool registration** with a fail-closed capability manifest and integrity assertion.
7. **The XAUUSD verified-report pipeline** (evidence-id-attributed grounding, safety/temporal checks, bounded repair) — the model to replicate for the committee.
8. **Transport hardening** — SSE protocol-error surfacing, unterminated-event flush, poll backoff, CSRF double-submit enforcement.
9. **Worker lifecycle** — reverse-order cleanup, `unhandledRejection`/`uncaughtException` handling, sd_notify watchdog, per-job timeout/abort/idempotency lock.

---

## 9. Findings — Ranked Issue List

Severity: **P0** = correctness/security/UX-breaking · **P1** = stability/perf/major gap · **P2** = maintainability/cleanup · **P3** = polish.

### P0 — Fix before any feature work

#### P0-1: Durable Full progress payload has the wrong shape and crashes the chat UI
- **Where:** `mastra-v2/workflows/full-analysis.ts:529-532` writes `{ type:'data-agent-progress', data:{ step } }`; `apps/worker/src/jobs/multi-agent-analysis.ts:279-282` feeds the raw step; `apps/web/src/lib/chat-transport.ts:412-420` forwards `last.data` as `AgentProgress`; `chat-screen.tsx:477-486` → `agent-deliberation.tsx:119` calls `agents.some`.
- **Impact:** `agents` is `undefined` → TypeError ~2s into every durable Full turn; the user sees the chat error boundary instead of their analysis, while the job keeps running and later persists.
- **Fix:** make the worker emit the full `{agents, mode, status}` snapshot by reusing `committeeProgressSnapshot` (move it into `@kestrel/ai` so both sides share one builder), and defensively guard `AgentDeliberation`/`ChatScreen` against a missing `agents` array. See Phase 1 task 1.1.

#### P0-2: Committee grounding is circular — hallucinated numbers reach the user
- **Where:** `committee/verifier.ts:53-55` (numeric check only when packet not ready); `committee/fusion-verifier.ts:90-97` (`opinionGroundedValues` trusts all specialist numbers); `synthesizer.ts:150-155` (single mode never verifies).
- **Impact:** a specialist can invent a price; `verifyMastraOpinion` passes it (packet ready); fusion cites it; `verifyFusionAnswer` treats it as grounded. The landing FAQ's "every number is checked" is false.
- **Fix:** (a) in `verifyMastraOpinion`, ground every `extractNarrativeNumbers(reasoning)` against `packetEvidenceValues(packet)` with the same tolerance as fusion; (b) delete the "specialist numbers are grounded" shortcut in `opinionGroundedValues` (or restrict it to numbers that also match packet evidence); (c) run `verifyFusionAnswer` for `mode==='single'` too. See Phase 1 task 1.2.

#### P0-3: Canonical answers are never gated on the evidence check
- **Where:** `agents/canonical/index.ts:442,613` computes `evidence`; `mastra-canonical-chat-stream.ts:178` only places it in meta; nothing reads `evidence.ok`.
- **Impact:** an ungrounded numeric answer is persisted and shown; the advertised guard does not guard.
- **DECISION Q1 (owner, 2026-10-12): block hard — no answer.** On `!evidence.ok`, fail the turn with a clean, user-facing refusal (same class as the committee strict failure). No repaired or degraded answer is returned. Strengthen the check itself first (see Phase 1 task 1.3) so the block is not triggered by false positives.

#### P0-4: Circuit breaker is write-only dead code (never opens in production)
- **Where:** `recordModelFailure`/`recordModelSuccess` (`model-circuit-breaker.ts:138,150`) have **zero production callers** (grep-verified). Every path only *reads* `isCircuitOpen` (`model-chat.ts:120`, `model-role.ts:134,169,187`). Additionally, writers key by **model id** (`writeThrough('failure', modelId)`) while readers pass a **provider id** (`isCircuitOpen(providerId)`).
- **Impact:** the "shared breaker across isolates" (`provider_circuit_state` table, migration 0097) is decorative; a degraded provider is never skipped. Even if wired, read/write key mismatch would prevent opening.
- **Fix:** call `recordModelFailure`/`recordModelSuccess` from the terminal outcome of `finishMastraRun`/`run-telemetry.ts` (and the error branch), keyed by the resolved **model id**; make `isCircuitOpen` read the same key. See Phase 1 task 1.4.

#### P0-5: Cost table collision under-prices the default Google model ~5×
- **Where:** `cost.ts:76-79` `RATES = { ...buildCatalogRateTable(), ...STATIC_RATES }` — later spread wins, so stale `STATIC_RATES` overrides the live catalog. `google/gemini-3.5-flash` catalog is `{1.5, 9.0}` (`_providers/google.ts:58-60`) but `STATIC_RATES` pins `{0.3, 2.5}` (`cost.ts:69`). That model is the `fundamental` **and** `vision` default for every Google-keyed user (`google.ts:34,37`).
- **Impact:** default turns under-costed ~5× in `chat_telemetry`, `daily_ai_spend`, and admin reports.
- **Fix:** invert the spread so the catalog wins (or delete the colliding static entry), and add a test asserting catalog rate precedence. See Phase 1 task 1.5.

#### P0-6: XAUUSD grounding bypassed by model-controlled claim labels
- **Where:** `report-grounding.ts:118-125` (`isStructuralParameterClaim`) and `:138-140` (`isScenarioProjectionClaim`) exempt claims by keyword in the **model-authored label**, not by schema field. Scenario numbers are only existence-checked via `scenario.evidenceIds`, never value-checked (`report-verifier.ts:93-100`).
- **Impact:** a fabricated `target 9999` labeled "Target" bypasses grounding on the repo's strongest path.
- **Fix:** remove free-text-label exemptions; bind projections to an explicit schema role (e.g. `role:'projection'`) and validate them against the referenced `evidenceId` values or a band derived from trigger/invalidation evidence. See Phase 1 task 1.6.

### P1 — High priority

- **P1-1 Cross-critique never shows a desk its own opinion** (`prompts.ts:156-189`, `workflow.ts:369-375`). Include the desk's own `{bias,confidence,reasoning}` in the critique prompt.
- **P1-2 Model diversity off by default** (`committeeModelResolver` returns `undefined` unless `PHASE3_MODEL_DIVERSITY`, default `0`; `env.ts`, `feature-flags.ts`). All 4 desks share one model. **DECISION Q2 (owner): keep OFF, opt-in only** — do not change the default. Still fix the fusion span which hardcodes `deps.modelId` (`workflow.ts:576`) so that when a user *does* opt in, the real per-agent model id is reported.
- **P1-3 Structured-fusion repair bypasses the renderer** (`synthesizer.ts:230`).
- **P1-4 `xauusd-conversation` runs `rewrite+availability` despite `untrusted` manifest** (`guardrails.ts`, `run.ts:141-185`).
- **P1-5 BYOK env-key fallback in multi-user** (`model-helpers.ts:57-85` merges `process.env` keys into every user unconditionally). **DECISION Q3 (owner): operator env keys are an intentional shared pool — keep merging them.** Do NOT gate this. Still worth a one-line log/metric when a turn falls back to an operator key so spend attribution is visible (advisory, non-blocking).
- **P1-6 Outbox self-re-enqueue corrupts terminal state** (`persistence-outbox.ts:68-76`).
- **P1-7 Thread deletion never deletes Mastra memory or state rows** (`thread-persistence.ts:232-244`).
- **P1-8 Untrusted macro news not quarantined** (`research-packet-macro.ts:121`, `model-context.ts:91`).
- **P1-9 Rollback flag silently drops `includeMacro`** (`packet-cache.ts:200`).
- **P1-10 XAUUSD packet uncached + divergent windows + indicator recompute** (`research-packet.ts`, `research-config.ts:24-29`, `evidence-builders.ts:100-109`).
- **P1-11 Follow-up safety substring/comma matching** (`followup-safety.ts:36-38`).
- **P1-12 Injection regex misses common variants** (`routing-keywords.ts:123-124`).
- **P1-13 Dates treated as ungrounded claims → false fail-closed** (`report-grounding.ts:143-144`).
- **P1-14 Durable Full completion can contradict the 5-min poll window** (`chat-transport.ts:310,480-487`).
- **P1-15 Raw JSON error envelopes shown to users** (`route.ts:82-112`, `chat-screen.tsx:526`).
- **P1-16 Alert noise control is inert** — `evaluateNoise` is never called by the evaluator (`alerts/evaluator.ts:318-457`; callers only in tests). Quiet hours/dedup/cooldown settings have no effect.
- **P1-17 Alert channel priority short-circuits on "not configured"** (`alerts/delivery.ts:65-79`), so a later configured channel can be skipped.
- **P1-18 Long durable reservations can be released mid-flight** → actual cost never applied (`budget-recovery.ts:23`, `cost.ts:464-495`, reconcile requires `status='reserved'`).
- **P1-19 Silent model downgrade for uncatalogued operator pins** (`model-role.ts:166-176` silently ignores env pins not in the catalog; `model-chat.ts:140-145` throws instead — inconsistent).
- **P1-20 `worker` purpose silently falls back to the `mode` model** (`model-resolution.ts:74-76`), unlogged.
- **P1-21 `xauusd-research` manifest tool names are phantom** (`capabilities/index.ts:425-459`).
- **P1-22 Title generation races + spend never reconciled** (`thread-persistence.ts:168-188`, callers invoke after budget settle).

### P2 — Maintainability & code health

- **P2-1 71 shim files** in `packages/ai/src/mastra/*` (all pure `export *` except `index.ts`, which is 370 lines) still coexist with `mastra-v2/`. The one-release shim window is over.
- **P2-2 Dead modules/exports:** `workflows/planner.ts` (no live caller), `services/mastra-canonical-chat.ts` + `mastra-canonical-response.ts` + `mastra-mode-response.ts`, buffered `runMastraModeChat`, `verification.ts` `enforceCitations`, `prompt/system.ts` `buildSystemPrompt`/`buildLiveSnapshot`, `token-estimate.ts`, `fallback.ts` `makeFallbackPart`, `model-strategy.ts` `MODEL_ROUTER`, `util/concurrency.ts` `limitConcurrency`, `thread-state.ts`, `auxiliary-usage.ts` `normalizeUsage`, `rememberThreadSynopsis`, `budget-guard.ts`, `budget-reservation.ts` wrappers, `services/mastra-chat-routing.ts` (test-only).
- **P2-3 Three budget modules** (`cost.ts`, `budget.ts`, `budget-guard.ts`, `budget-reservation.ts`) with overlapping names.
- **P2-4 Unbounded tables** (`memory.resources` not in retention; `mastra_observational_memory` excluded but force-on for durable Full; backfill/projection state rows).
- **P2-5 Dead telemetry vocabulary:** `usageKnown` accepted but no column; `title_generated`/`title_failed`/`title_skipped_budget` never emitted.
- **P2-6 `pruneMastraStorage` leaks a Postgres pool** (`storage.ts:242-247`).
- **P2-7 Fire-and-forget embed without `.catch`** (`briefings/generate.ts:134`).
- **P2-8 Semantic-routing cost can be dropped from the ledger** (`canonical/index.ts:202` vs `:397,533` create separate ledgers when none is passed).
- **P2-9 Fake telemetry in the Views Terminal** (`thread-views-dock.tsx:219-238`).
- **P2-10 4-mode legacy values still accepted** in threads/settings routes and prompt text (`prompt/system.ts:107`, `synthesizer.ts:23`).
- **P2-11 Eval gate is absolute-threshold, no baseline** — `eval-gate.ts` compares to `DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS` (minOverallPassRate 0.95 etc.); the prior plan's "drop >5% vs main" was never implemented. It also skips cleanly whenever there are no scores, so it can never fail on a silent quality collapse.
- **P2-12 SignalR subscription bookkeeping** — `subscribedSymbols` has no dedupe (`signalr/consumer.ts:190-227`); health `ready` depends on `isStarted()` so the worker 503s during every rebuild.
- **P2-13 Landing FAQ/marketing overclaims** ("every number checked" — false until P0-2; hardcoded per-desk model families that don't exist).
- **P2-14 `budget.ts:42` memoizes `isBudgetEnforced()` once per process** — runtime env flips need a restart.

### P3 — Polish
- `KNIP` is report-only in CI (`continue-on-error: true`) so dead exports never gate.
- `resolveModelForProvider` error text always says "technical" regardless of domain (`model-chat.ts:138`).
- `withRetry` unused on the chat path; full-jitter permits ~0 backoff (`retry.ts:106-109`).
- `env-model-factory` defaults `AI_DEFAULT_MODEL=google/gemini-2.5-flash`/title `…2.5-flash-lite`, which are marked retired/404 in `_providers/google.ts:90-118`; `tools/analyze-chart-image.ts:154` still uses it.

---

## 10. Upgrade Plan — Phased Implementation

> Execute in order. Phase 1 is the correctness/stability gate and must ship first. Phases 2–4 can overlap after Phase 1. Each phase ends with a verification checkpoint.

### Phase 0 — Prep (0.5 day)

| Step | Action |
|---|---|
| 0.1 | Answer the owner questions in §13; log them in `docs/plans/decisions.log.md` (append a new dated section). |
| 0.2 | Add a shared progress snapshot builder contract (see 1.1) so web and worker cannot drift again. |
| 0.3 | Snapshot baseline: `pnpm typecheck`, `pnpm test`, `pnpm knip`, current p95 Full latency, daily cost rows. Save to `docs/archive/audit-v2/baseline.md`. |
| 0.4 | Confirm `ENFORCE_BUDGET`/`ENABLE_COMMITTEE_CRITIQUE`/`PHASE2_PACKET_CACHE`/`PHASE3_MODEL_DIVERSITY` current values in the deployment. |

### Phase 1 — Correctness & Stability (P0 + P1 critical)

**1.1 Fix durable Full progress shape (P0-1)**
- Move `committeeProgressSnapshot` from `apps/web/src/lib/services/mastra-mode.ts:61-96` into `@kestrel/ai` (e.g. `mastra-v2/shared/progress.ts`) and export it.
- In `updateFullAnalysisProgress`, store `{ type:'data-agent-progress', data: committeeProgressSnapshot(mode, step) }`. The worker job must pass the mode (it has `modeResult.mode`/`payload.executionPlan`).
- Guard `AgentDeliberation` and `ChatScreen` against `agents == null` (render nothing rather than throw).
- **Test:** worker progress row shape validates against the `AgentProgress` type; a UI unit test renders `AgentDeliberation` with a missing `agents` without throwing.
- **Touches:** `packages/ai/src/mastra-v2/workflows/full-analysis.ts`, `packages/ai/src/mastra-v2/shared/progress.ts` (new), `apps/web/src/lib/services/mastra-mode.ts`, `apps/worker/src/jobs/multi-agent-analysis.ts`, `apps/web/src/lib/chat-transport.ts`, `apps/web/src/components/chat/parts/agent-deliberation.tsx`, `apps/web/src/components/chat/chat-screen.tsx`.

**1.2 Make committee grounding real (P0-2)**
- In `verifyMastraOpinion`, add: for each `extractNarrativeNumbers(opinion.reasoning)`, require a packet-evidence value within tolerance, else a finding. (Extract the shared numeric-evidence helper from `fusion-verifier.ts` into a small `committee/grounding.ts` so both use one implementation.)
- Remove the "any number a specialist quoted is grounded" shortcut in `opinionGroundedValues`; rely on packet evidence only.
- Run `verifyFusionAnswer` for `mode==='single'` (currently skipped).
- Tighten the scenario exemption: use real `matchAll` indices instead of `text.indexOf(key)`, and require the projection keyword to be adjacent (not a ±32-char window on `risk`/`trigger`).
- **Tests:** `committee/verifier.test.ts` (invented price in reasoning → finding); `committee/fusion-verifier.test.ts` (specialist-invented price → fusion fails → repair → strict failure).
- **Touches:** `committee/verifier.ts`, `committee/grounding.ts` (new), `committee/fusion-verifier.ts`, `committee/synthesizer.ts`, `committee/specialist-runner.ts`.

**1.3 Gate canonical answers on evidence (P0-3) — DECISION Q1: block hard**
- In `runMastraCanonicalChat`/`…Stream`, when `!evidence.ok`: **fail the turn** with a clean user-facing refusal (`answerOutcome:'blocked'`, no text persisted as a valid answer). Do **not** repair and do **not** return a degraded answer — the owner chose strict blocking to match the committee's Q3 semantics.
- Because a hard block is destructive UX, **strengthen `checkCanonicalEvidence` first**: use `extractNarrativeNumbers` + price bands rather than counting all digit runs; separate "market tool used" from "value actually present in tool output"; exclude dates/years/structural numbers (reuse the date-masking fix from 1.6's sibling work) so a benign "2 scenarios"/"2026-05-26" never blocks.
- **Tests:** ungrounded numeric answer with no market tool → blocked (no answer); grounded answer → passes; date-only prose → passes (no false block).
- **Touches:** `mastra-v2/agents/canonical/{index,evidence}.ts`, `apps/web/src/lib/services/mastra-canonical-chat-stream.ts`, `apps/web/src/components/chat/parts/*`.

**1.4 Wire the circuit breaker (P0-4)**
- Call `recordModelFailure(modelId)` on terminal provider failure and `recordModelSuccess(modelId)` on success from `finishMastraRun`/`run-telemetry.ts` (and the streaming error path), keyed by the resolved **model id**.
- Change `isCircuitOpen` call sites (`model-chat.ts:120`, `model-role.ts:134,169,187`) to pass the model id, not the provider id. Keep the DB `provider_circuit_state` + L1 as-is; add a window/reset so DB `consecutive_failures` matches the L1 semantics.
- **Tests:** unit — 3 failures then `isCircuitOpen(modelId)` true; success resets; DB-down degrades to L1; read/write key identical.
- **Touches:** `model-circuit-breaker.ts`, `model-chat.ts`, `model-role.ts`, `mastra-v2/shared/run-telemetry.ts` (or `mastra/telemetry.ts`).

**1.5 Fix the cost-table collision (P0-5)**
- Invert the spread (`{ ...STATIC_RATES, ...buildCatalogRateTable() }`) or delete the colliding `gemini-3.5-flash` static entry. Add a test that the catalog rate wins for a known collision.
- Audit all `STATIC_RATES` entries for other catalog collisions while there.
- **Touches:** `cost.ts`, `_providers/*`.

**1.6 Fix XAUUSD label-based grounding bypass (P0-6)**
- Remove keyword-label exemptions in `report-grounding.ts`. Add an explicit `role`/`kind` field to the numericClaim/scenario schema and validate projections against the referenced `evidenceId` values or a derived band.
- **Tests:** `report-grounding.test.ts` — a label "Target 9999" with no matching evidence fails.
- **Touches:** `agents/xauusd/report/{report-grounding,report-types,report-verifier}.ts`.

**1.7 Cross-critique fix (P1-1)**
- Pass each desk its own opinion into `critiqueInstructionsForRequest` alongside peers; update the prompt so "confirm your position" is answerable.
- **Touches:** `committee/prompts.ts`, `committee/critique.ts`, `committee/workflow.ts`.

**1.8 Structured-fusion repair render (P1-3)**
- Funnel both fusion attempts through one render helper; when `useStructuredFusion`, re-parse `repairResult.object`.
- **Touches:** `committee/synthesizer.ts`.

**1.9 Guardrail consistency (P1-4)**
- Derive `xauusd-conversation` and XAUUSD report guardrails from `executionPlan.guardrail` (as canonical does), not from `buildConversationGuardrails`.
- Catch `GuardrailUnavailableError`/`TripWire` at the route boundary and return a clean 503/422 instead of a generic 500/stream error.
- **Touches:** `mastra-v2/agents/xauusd/run.ts`, `mastra-v2/research-context.ts`, `apps/web/src/app/api/chat/route.ts`.

**1.10 Robustness batch (P1-6, P1-7, P1-9, P1-11, P1-12, P1-14, P1-15)**
- Outbox: guard the conflict `SET` with `WHERE status NOT IN ('processing','completed')` so replay cannot clobber `processing`.
- Thread delete: delete Mastra thread/resource + backfill/projection state rows (or add `ON DELETE CASCADE` FKs).
- Packet cache rollback: pass the same `includeMacro` option.
- Follow-up safety: use `extractNarrativeNumbers` + parsed numeric sets; add `enter|buy|sell|exit|add|reduce` to market-context terms.
- Injection regex: tolerate `system\s*:`/`developer\s*:` with optional whitespace and role-play phrasing; map TripWire to 422.
- Poll window: keep polling while status is `pending|running` (or surface a non-fatal "still running" state) instead of a hard 5-min error.
- Error envelope: parse `{error:{code,message}}` in the transport/fetch and show `error.error.message`.
- **Touches:** `persistence-outbox.ts`, `thread-persistence.ts`, `packet-cache.ts`, `followup-safety.ts`, `routing-keywords.ts`, `chat-transport.ts`, `chat-screen.tsx`.

**1.11 Trust + billing batch (Q3 keeps operator-key sharing; P1-8, P1-16, P1-17, P1-18, P1-21)**
- **Q3 decision:** keep merging operator env keys into users' BYOK payloads (intended shared pool). Do **not** gate it. Add an advisory log/metric `operator_key_fallback_total{provider}` so operator-paid spend is attributable.
- Quarantine macro news: run `quarantineExternalText` over `assembleXauusdMacroEvidence` titles/summaries before parse.
- Wire `evaluateNoise` into `deliverAlert` (persist dedup/cooldown/quiet-hours state).
- Fix channel iteration: only short-circuit on `ok`; skip (don't stop on) unconfigured channels.
- Heartbeat long reservations or gate recovery on active-lease absence so reconcile always applies actual cost.
- Fix `xauusd-research` manifest tool ids to the real hyphenated names and make the integrity check assert resolvability.
- **Touches:** `model-helpers.ts`, `research-packet-macro.ts`, `packages/ai/src/notifications/*`, `alerts/{delivery,evaluator}.ts`, `cost.ts`, `apps/worker/src/jobs/budget-recovery.ts`, `capabilities/index.ts`.

**Checkpoint 1:** `pnpm typecheck` + `pnpm test` green; new tests above green; manual smoke: `single` (SSE progress), `full` (queued → worker → **deliberation panel renders, no crash**), symbol-free canonical, XAUUSD research, injection 422, mutation confirm; circuit breaker opens after 3 forced failures and is observable in metrics; cost row for a Google default model matches the catalog rate; a fabricated price in a specialist reasoning is caught.

### Phase 2 — Performance (0.5–1 week)

- **2.1 Unify XAUUSD packet onto the cached collector** (§5.3/P1-10): add `includeMacro` to `collectSymbolResearchPacketCached` for the XAUUSD conversation/report paths; unify window sizes so the data layer cache is shared; replace `computeIndicator` with the memo where missing.
- **2.2 Redis mirror off the request path** (P2): fire-and-forget the mirror write; never `await` `mirror.set` in the caller.
- **2.3 Reduce committee input tokens:** measure with `token-estimate.ts` (currently dead) and confirm the single-serialization WeakMap path actually holds across retries (retries rebuild the agent but reuse the packet object — verify).
- **2.4 Setup parallelization:** ensure memory prep + routing + guardrail build remain concurrent (already partly done) and add `mastra_setup_latency_ms{phase}` coverage for the XAUUSD paths.
- **Checkpoint 2:** p95 `full`/`single` latency vs baseline; XAUUSD turn p95 improved; packet cache hit rate >40% on burst.

### Phase 3 — True Multi-Agent Upgrade

- **3.1 Model diversity (P1-2) — DECISION Q2: keep OFF (opt-in only).** Do not change the default; users enable `PHASE3_MODEL_DIVERSITY`/`agentModelOverrides` themselves. Only fix the fusion span to report the real per-agent model id when diversity is on.
- **3.2 Structured `CommitteeContext` handoff:** replace string blocks with a typed `requestContext` value (`packet`, `opinions[]`, `critiques[]`) that agents format themselves; keep the schema at the boundary.
- **3.3 Optional bounded debate iteration for `full`:** one additional round where a desk may revise after reading critiques; gate behind a flag and keep strict failure semantics.
- **3.4 Wire or delete the planner (P2-2):** decide with the owner (Q5). If kept, wire `runPlanner` only for complex `fundamental` prompts and count its cost/time; if not, delete `workflows/planner.ts` and its exports.
- **Checkpoint 3:** distinct model ids observable per opinion; critiques reference each desk's own prior view; planner either live with a gate or removed.

### Phase 4 — Maintainability & Cleanup

- **4.1 Retire the `src/mastra/*` shim layer (P2-1):** delete the 71 shim files, repoint `packages/ai/src/index.ts` and `mastra/index.ts` to `mastra-v2` directly. (This was supposed to be one atomic PR in the prior plan; the shims were never removed.)
- **4.2 Delete dead modules/exports (P2-2)** listed in §9 P2-2. Run `knip` and drive unused exports to zero; make `knip` **blocking** in CI for `packages/ai`.
- **4.3 Collapse budget modules (P2-3):** keep `budget.ts` as the facade + `cost.ts` as the ledger/rate table; delete `budget-guard.ts` and fold `budget-reservation.ts` into `budget.ts`.
- **4.4 Retention for memory tables (P2-4):** add `memory.resources` to retention; if observational memory stays force-on for durable Full, add explicit cleanup for `mastra_observational_memory`; cascade state rows with threads.
- **4.5 Telemetry vocabulary (P2-5):** either add the `usage_known` column or drop the field; emit or remove the `title_*` kinds.
- **4.6 Remove the 4-mode compat shim (P2-10)** after one release: threads/settings routes reject `quick|standard|auto`; fix 4-mode language in `prompt/system.ts` and `committee/synthesizer.ts`.
- **4.7 Fake telemetry (P2-9):** wire the Views Terminal to real data or remove it.
- **4.8 Product copy (P2-13):** after P0-2 lands, make the FAQ claim accurate or softer; remove the hardcoded per-desk model-family claim.
- **Checkpoint 4:** `pnpm typecheck`+`lint`+`test` green; `knip` clean and blocking; no `src/mastra` shims; `docs/architecture.md` matches.

### Phase 5 — Evals, Observability & Scale

- **5.1 Eval gate baseline (P2-11):** store a main-branch baseline artifact/table and fail on a relative drop (the prior plan's ">5% vs main"); do not skip silently forever — fail (or warn loudly) when zero scores are recorded for a full day.
- **5.2 Observability:** emit the committee step spans + fusion-verifier findings into the admin `mastra-runs` surface; add `committee_grounding_rejected_total`, `circuit_open_total{model}`, `packet_cache_hit_total` dashboards.
- **5.3 Admin budget alerts (Q4):** non-blocking alerts when spend crosses thresholds (ledger stays uncapped).
- **Checkpoint 5:** nightly eval run green; dashboard shows grounding rejections; admin alert fires on threshold.

---

## 11. File Map & Touch List

**New files**
| File | Phase | Purpose |
|---|---|---|
| `packages/ai/src/mastra-v2/shared/progress.ts` | 1.1 | Shared `committeeProgressSnapshot` (web + worker) |
| `packages/ai/src/committee/grounding.ts` | 1.2 | One numeric-evidence helper for opinion + fusion verifiers |
| `docs/archive/audit-v2/baseline.md` | 0.3 | Pre-change metrics |

**Delete (Phase 4)** — `packages/ai/src/mastra/*` (71 shims), `workflows/planner.ts` (if Q5=delete), `verification.ts` (+ UI `citation-warning`), `prompt/system.ts` (if unwired), `token-estimate.ts`, `model-strategy.ts`, `util/concurrency.ts` (if unused), `thread-state.ts`, `auxiliary-usage.ts`, `budget-guard.ts`, `services/mastra-{canonical-chat,canonical-response,mode-response,chat-routing}.ts`, buffered `runMastraModeChat`.

**Migrations** — none strictly required. Optional: FK `ON DELETE CASCADE` for `memory_backfill_state`/`memory_projection_state`; retention policy row for `memory.resources`/`mastra_observational_memory`.

---

## 12. Testing, Rollout & Observability

```bash
pnpm typecheck                 # tsc --noEmit via turbo
pnpm lint
pnpm test                      # vitest workspace
pnpm --filter @kestrel/ai test # ai package
pnpm build:packages
pnpm check:route-security
pnpm knip                      # make blocking for packages/ai after Phase 4
pnpm test:postgres-rls
```

**Required new tests:** committee numeric grounding (opinion + fusion), single-mode fusion verification, XAUUSD label-bypass, cost-table precedence, circuit-breaker open/reset/key-identity, durable-Full progress shape + UI render guard, outbox processing-state guard, follow-up safety numeric, injection variants, alert noise + channel iteration.

**Rollout:** Phase 1 paths are unconditional (fixes, not flags). Model diversity (3.1) stays flag-gated until measured. Phase 4 shim removal is one atomic PR. Update `docs/plans/decisions.log.md` per PR with owner answers + rollback.

**Metrics to add/verify:** `committee_grounding_rejected_total`, `committee_fusion_verification_failed_total` (exists — confirm it now actually fires), `circuit_open_total{model}`, `packet_cache_hit_total`, `canonical_evidence_degraded_total`, `alert_noise_suppressed_total`.

---

## 13. Open Questions — Owner Input Required

> **Answered by owner 2026-10-12** (Q1–Q4). Q5–Q9 remain open; log all answers in `docs/plans/decisions.log.md`.

**Q1 — Canonical evidence gating. ✅ DECIDED: block hard, no answer.**
When the canonical answer fails the evidence check, the turn fails with a clean refusal — no repaired or degraded answer. (Requires strengthening the check first so benign numbers/dates do not cause false blocks.) Implemented in Phase 1 task 1.3.

**Q2 — Model diversity default. ✅ DECIDED: keep OFF, opt-in only.**
All 4 desks share one model by default; users opt in via settings/env. Do not change the default. (Fusion span still fixed to report the real model id when opted in.)

**Q3 — BYOK env-key fallback. ✅ DECIDED: yes, operator keys are a shared pool by design.**
Keep merging operator env keys into users' BYOK payloads in multi-user mode. Do not gate it; add advisory spend-attribution telemetry only.

**Q4 — Durable Full live progress. ✅ DECIDED: fix payload, stream real per-desk progress.**
Implement Phase 1 task 1.1 (shared snapshot builder).

**Q5 — Planner (OPEN).** Wire the built planner into complex `fundamental` turns, or delete it as dead code?
- **Recommended:** delete for now; revisit with a measured A/B.

**Q6 — XAUUSD convergence (OPEN).** Fully converge XAUUSD conversation/report onto the cached `SymbolResearchPacket`, or keep the separate verified-report pipeline and only share the collector?
- **Recommended:** keep the verified-report pipeline; unify only collection/caching (Phase 2.1). Do not merge schemas.

**Q7 — Alert noise control (OPEN).** Wire the built-but-inert quiet hours/dedup/cooldown live now, or is it scaffolding for later?
- **Recommended:** wire it live (P1-16); users already see the settings.

**Q8 — 4-mode compat removal timing (OPEN).** Remove the `quick|standard|auto` shims now, or keep one more release?
- **Recommended:** remove in Phase 4.

**Q9 — Aborted/stuck durable jobs (OPEN).** On a lost durable Full job, show a terminal error + Retry, or keep polling longer?
- **Recommended:** terminal error + explicit Retry after the poll window; stop the silent "appears on reload" behavior.

---

## 14. Definition of Done

- [ ] **P0-1:** durable Full renders the deliberation panel; no TypeError; shared progress builder used by web + worker.
- [ ] **P0-2:** a fabricated number in specialist reasoning is rejected; fusion cannot launder it; single mode is verified.
- [ ] **P0-3:** canonical ungrounded answers are repaired or visibly degraded — never silently returned.
- [ ] **P0-4:** circuit breaker opens after 3 failures, resets on success, uses one key, and is observable; DB-down degrades to L1.
- [ ] **P0-5:** catalog rate wins over static; Google default model costed correctly; test guards precedence.
- [ ] **P0-6:** label-based grounding exemption removed; fabricated "Target 9999" fails.
- [ ] **P1s** listed in §9 addressed or explicitly deferred with an owner decision logged.
- [ ] **Cleanup:** no `src/mastra` shims; dead modules deleted; `knip` blocking for `packages/ai`; budget modules collapsed; 4-mode shims removed.
- [ ] **Evals:** gate has a real baseline and fails on a relative drop; no silent-forever skip.
- [ ] **No regressions:** full test suite + typecheck green; manual smoke of every route in §3.1 passes.
- [ ] **Decisions logged:** §13 answers in `docs/plans/decisions.log.md`.

---

*End of plan. Implementing agent: start at Phase 0, then Phase 1 task 1.1. Re-verify every `file:line` in §9 against the tree at implementation time — line numbers drift.*