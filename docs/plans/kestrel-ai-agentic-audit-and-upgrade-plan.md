# Kestrel AI & Agentic Systems — Full End-to-End Audit & Upgrade Plan

> **For:** The implementing AI agent (read this file top-to-bottom, execute phases in order).  
> **Source audit date:** 2026-10-10  
> **Audited revision:** `Kestrel` on `main` (monorepo: `apps/web`, `apps/worker`, `packages/ai`, `packages/data`, `packages/db`, `packages/shared`, `packages/indicators`)  
> **Auditor stance:** Treat every claim in `docs/architecture.md`, the landing showcase, and inline comments as *claims to be verified against code* — not as facts.  
> **Plan location:** `docs/plans/kestrel-ai-agentic-audit-and-upgrade-plan.md` (this file). Do **not** move it; docs index in `docs/README.md` should link it after approval.
> **Decisions incorporated:** 2026-10-10 owner decisions logged in `docs/plans/decisions.log.md` — quality-first (no cost downgrades), 2 modes (`single` + `full`), strict failure (all-or-nothing), no daily budget cap, 30s fresh-only packet cache, cross-critique ON for Full, durable Full modelOverride serialization, one-PR migration. One open question remains: Q8 observational memory (see §13). The plan below has been patched to reflect these decisions; search `DECISION:` for the delta.

> **IMPLEMENTATION STATUS (2026-10-11):** All phases (0–5) implemented on this branch.
> Per-phase details, test evidence, and the three documented deviations live in
> `docs/plans/decisions.log.md` (§ "Audit upgrade plan implementation").
> Feature flags: `PHASE2_PACKET_CACHE`, `PHASE3_MODEL_DIVERSITY`, `ENABLE_COMMITTEE_CRITIQUE`
> (Q6 ON), `PHASE3_STRUCTURED_FUSION`, `ENFORCE_BUDGET` (Q4 default off). The router,
> streaming progress, and the Phase 4 migration are unconditional (no toggle). The planner
> (§5.1) is built but not wired to a live route; the eval gate uses absolute thresholds
> (see decisions log). Q8 is closed: the owner chose
> **OFF** on 2026-10-11 — observational memory stays off everywhere.
>
> **Owner directives (verbatim):**
> - Q1 quality always over cost
> - Q2 just two modes: full and single
> - Q3 any agent fails → all fail, no partial/degraded answer
> - Q4 no max daily limits
> - Q5/Q7 choose best (auditor chose 30s fresh-only cache + durable queue serialization)
> - Q6 quality over speed, enable best
> - Q8 "whats that?" — needs plain-English answer (see §13)
> - Q9 one PR

---

## Table of Contents

1. [Executive Summary & Verdict](#1-executive-summary--verdict)
2. [Method & Coverage](#2-method--coverage)
3. [What the User Actually Sees](#3-what-the-user-actually-sees)
4. [What Agents Actually Do (Inventory)](#4-what-agents-actually-do-inventory)
5. [Data Flow — End to End](#5-data-flow--end-to-end)
6. [Inter-Agent Communication Audit](#6-inter-agent-communication-audit)
7. [Thinking / Reasoning / Answering Audit](#7-thinking--reasoning--answering-audit)
8. [Strengths to Preserve](#8-strengths-to-preserve)
9. [Findings — Ranked Issue List](#9-findings--ranked-issue-list)
10. [Upgrade Plan — Phased Implementation](#10-upgrade-plan--phased-implementation)
11. [File Map & Touch List](#11-file-map--touch-list)
12. [Testing, Rollout & Observability](#12-testing-rollout--observability)
13. [Open Questions — Status](#13-open-questions--status-updated-2026-10-10)
14. [Definition of Done](#14-definition-of-done)

---

## 1. Executive Summary & Verdict

### One-sentence verdict

**Kestrel is a *partially* multi-agent system.** It contains *one* genuine multi-agent deliberation path (the **committee workflow**), one single-agent repair loop masquerading as a workflow (`xauusd-report`), one durable queue wrapper around the committee (`full-analysis`), and one single-agent conversational path (`canonical-chat`) that handles the *majority* of user turns. The landing and architecture docs imply multi-agent is the default; in reality it is **conditional** on symbol detection + mode.

### Scores (1–10, 10 = excellent)

| Dimension | Score | Why |
|---|---|---|
| **True multi-agent depth** | **4/10** | Only `committee/workflow.ts` is real multi-agent. Specialists share one model, no cross-talk, no debate iteration, no tools. |
| **Stability** | **5/10** | Strong verification on XAUUSD, but brittle routing splits, in-memory-only circuit breaker, naked `throw` on memory prep, and 90s lease fragility. |
| **Performance** | **4/10** | Packet serialized 5× per committee run; no packet/tool-result caching; 60s route budget vs multi-agent fan-out easily blows budget. |
| **Maintainability** | **3/10** | Two co-existing Mastra generations (`mastra/` vs `mastra-v2/`), three routing systems, three budget abstractions, regex soup duplicated. |
| **Advanced / readiness for scale** | **4/10** | Promising foundations (workflow snapshots, generation ledger, guardrails) but no agent-to-agent messaging, no planner, no fusion verifier. |

### The fix in one paragraph

Unify the two Mastra generations under `mastra-v2` as the single foundation, collapse the three routing systems into one typed router, add packet/dedupe caching, give the committee real model diversity + one round of cross-critique, add a verifier on the fusion output (same rigor as specialist verification), wire the circuit breaker to `provider_health`, and enforce a single budget/cost abstraction. Everything else is cleanup and performance.

---

## 2. Method & Coverage

**What was read (exhaustive, not sampled):**

- `docs/architecture.md`, `docs/configuration.md`, `package.json`, `turbo.json`
- `packages/ai/src/index.ts` (public barrel — the contract the web route depends on)
- `packages/ai/src/mastra/run.ts` (978 LOC — XAUUSD turn orchestration), `agent.ts`, `canonical-chat.ts` (662 LOC), `capabilities.ts` (660 LOC), `execution-decision.ts`, `execution-plan.ts`, `research-packet*.ts`, `symbol-research.ts` (299 LOC), `mode-runner.ts` (487 LOC)
- `packages/ai/src/committee/*` (all 5 files: `types.ts`, `specialists.ts`, `specialist-runner.ts`, `workflow.ts`, `synthesizer.ts`, `verifier.ts`, `prompts.ts`)
- `packages/ai/src/mastra-v2/*` (`instance.ts`, `storage.ts`, `memory.ts`, `guardrails.ts`, `registry.ts`, `workflows/full-analysis.ts`, `workflows/xauusd-report.ts`, `workflows/mutation.ts`, `telemetry.ts`)
- `packages/ai/src/routing.ts`, `routing-keywords.ts`, `semantic-routing.ts`, `byok-providers.ts`, `model.ts`, `cost.ts`, `budget-guard.ts`, `retry.ts`, `fallback.ts`, `model-circuit-breaker.ts`, `llm-throttle.ts`, `tools/*`, `mastra/tools.ts` + `legacy-tool-adapter.ts`
- `apps/web/src/app/api/chat/route.ts` (407 LOC — the **request boundary**), `lib/services/mastra-*` (18 files), `lib/chat-transport.ts`, `components/chat/*` (`chat-screen.tsx`, `parts/*`, `agent-deliberation.tsx`, `convene-committee.tsx`)
- `apps/worker/src/*` listing, `packages/data` adapters (spot check), `packages/db` schema (spot check)
- Landing showcase components (`landing-architecture.tsx`, `landing-desks.tsx`, etc.)

**What was *not* exhaustively read** (flagged as follow-up for the implementing agent):

- Full `packages/data` failover + `packages/db` RLS helpers (spot-checked only)
- Every `tools/*.ts` implementation (market/analysis/journal/system/web categories — barrel verified, 2 sampled)
- E2E `playwright.config.ts` suites and `loadtest/`

**How to use this plan:** Each phase lists *exact files to touch*, *invariants to preserve*, and *verification commands*. Do not improvise new abstractions — extend the ones already in the repo.

---

## 3. What the User Actually Sees

### 3.1 Two surfaces, one chat

- **Unauthenticated (`/` → `/landing`):** `LandingHero` → `LandingDesks` → `LandingStepper` → `LandingArchitecture` (SVG `multi-agent-committee.svg`) → `LandingFAQ`. The copy presents a 4-desk committee (technical / fundamental / risk / sentiment) as the product identity. No live data; purely marketing.
- **Authenticated (`/chat`, `/dashboard`, `/chart/[symbol]`, `/calendar`, `/news`, `/journal`, `/alerts`, `/admin`):** `ChatScreen` (`apps/web/src/components/chat/chat-screen.tsx`) is the primary AI surface. It uses `useChat` from `@ai-sdk/react` with `createKestrelChatTransport` and renders messages via `MessageList` + `parts/registry.tsx`.

### 3.2 ChatScreen reality

| UI element | What it does | Code |
|---|---|---|
| `ChatTopBar` | Mode selector (`single` / `quick` / `standard` / `full` / `auto`), thread title, pinned symbol | `components/chat/chat-top-bar.tsx` |
| `Composer` | Text + optional image + model override | `components/chat/composer.tsx` |
| `ComposerActionChips` | Quick prompts | `components/chat/composer-action-chips.tsx` |
| `MessageList` → `parts/*` | Renders `UIMessage` parts: `get_price`, `get_candles`, `get_indicators`, `mastra-report`, `mastra-report-scenarios`, `agent-deliberation`, `convene-committee`, `mutation-confirmation`, `compute-risk`, `fallback`, `compact-telemetry-row` | `components/chat/parts/*.tsx` |
| `AgentDeliberation` | Supposed to show committee deliberation (specialist biases/confidences). In practice, only populated when `route === symbol-research` and `opinions` array is non-empty. Most turns never render it. | `components/chat/parts/agent-deliberation.tsx` |
| `ThreadViewsDock` / `ThreadTocRail` | Navigation, thread summary | `components/chat/thread-views-dock.tsx` |
| `PixelDeskStandby` | Decorative idle state | `components/chat/parts/pixel-desk/pixel-desk.tsx` |

**Key finding:** The user *expects* committee deliberation from the landing story, but the default path for a prompt like “what's your outlook on gold?” **without** an explicit mode override often resolves to `canonical-chat` (single agent). The committee only runs when:
- `symbol = extractMastraSymbol(prompt)` is non-null **and**
- `mode ∈ {quick, standard, full}` (or `xauusd-*` legacy path for `XAUUSD` + `single/auto`)

Symbol-free prompts (`"explain support and resistance"`) never hit the committee. This is correct behavior for cost, but **undisclosed** to the user — the UI does not communicate which path was taken beyond subtle part types.

### 3.3 Full-mode UX

`full` mode is **durable**: `/api/chat` enqueues to `full_analysis_queue` (`enqueueFullAnalysis`) and returns `AnalysisQueuedEvent { type: 'analysis-queued', jobId, status: 'queued' }`. The worker claims via `claimNextFullAnalysisQueue` with a 90s lease + heartbeat. The web polls `mastra-v2/observability-view` snapshots to show progress. If the worker is down, the job sits queued — the user sees "queued" indefinitely (no timeout UX).

### 3.4 Mutation UX

When `classifyMutationRequest` or `isMutationIntent` fires, the route returns a draft + `MastraMutationPolicyError` handling. The `MutationConfirmation` part renders an explicit confirm button that resumes the `mutation` workflow via `suspend`/`resume`. This is well-isolated but shares the chat transport.

---

## 4. What Agents Actually Do (Inventory)

### 4.1 Complete agent/workflow inventory

| # | Component | Kind | File | Real agentic? | Tools? | Memory? | Description |
|---|---|---|---|---|---|---|---|
| 1 | `kestrel-mastra-canonical-chat` | **Agent** | `mastra/canonical-chat.ts` | **Yes** (single) | Yes (read-only allowlist via `READ_ONLY_TOOL_NAMES` + `adaptLegacyReadOnlyTool`) | Yes (Mastra Memory: `lastMessages:20`, workingMemory, semantic recall topK 4) | Streaming conversational research. Default for symbol-free prompts. |
| 2 | `kestrel-xauusd-research-poc` | **Agent** | `mastra/agent.ts` | **Yes** (single) | No (`toolChoice:none` when packet present) + packet-backed | Via `run.ts` context | Legacy XAUUSD deep-research agent. Instructions key off `researchPacket` in `RequestContext`. |
| 3 | `committee/workflow` (`symbol-research`) | **Workflow** (4+1 agents) | `committee/workflow.ts` + `committee/specialist-runner.ts` + `committee/synthesizer.ts` | **Yes — genuinely multi-agent** | **No** (specialists `toolChoice:none`, `structuredOutput: OpinionSchema`; fusion `toolChoice:none`) | Read-only for specialists, write for fusion | `collect-packet → parallel(technical,fundamental,risk,sentiment) → verify → fusion`. Only path that fans out. |
| 4 | `xauusd-report` | **Workflow** (1 agent + repair loop) | `mastra-v2/workflows/xauusd-report.ts` | **No** (single agent + `dowhile` repair) | No | Injected `callOptions` | `collect-packet → generate → dowhile(repair) → finalize`. Repair is deterministic re-generation with `verificationFindings`. |
| 5 | `full-analysis` (durable) | **Queue + Workflow** | `mastra-v2/workflows/full-analysis.ts` | **Wrapper** around #3 | No (delegates) | Forced observational memory + semantic recall | Enqueue/resume/lease/heartbeat/progress; ultimately calls `createCommitteeWorkflow` with `mode=full`. |
| 6 | `mutation` | **Workflow** (suspend/resume) | `mastra-v2/workflows/mutation.ts` | **No** (deterministic) | No | No | `draft → suspend → execute → notify`. No LLM. Injected executor does Drizzle write. |
| 7 | `PromptInjectionDetector` + `UnicodeNormalizer` | **InputProcessors** | `mastra-v2/guardrails.ts` | Guardrail | No | No | `block` (research) vs `rewrite` (conversation). LLM-based detector uses fast-tier BYOK model. |
| 8 | `MastraScorers` (eval) | **Scorers** | `mastra-v2/evals/scorers.ts` | Eval | No | No | Sampled live scoring (5% ratio) for conversation/research — not user-facing. |

**Count:** 2 standalone agents + 1 true multi-agent workflow (4 specialists + 1 fusion) + 2 single-agent workflows + 1 deterministic workflow = **8 logical components, only 1 multi-agent.**

### 4.2 The committee under the microscope

```
Browser prompt
  │
  ▼
/api/chat → createExecutionPlan() → decideMastraExecution()
  │
  ├─► mode ∈ {quick,standard,full} + symbol detected → committee/workflow
  │     │
  │     ├─ Step 1: collect-packet (deterministic, fail-closed)
  │     │     → collectSymbolResearchPacket(symbol, signal)
  │     │     → { price, timeframes[1d,4h,1h,15m], indicators[ema20,ema50,rsi,macd,atr],
  │     │         optionalContext, missingData, warnings, dataQuality }
  │     │     → bail({ status:'blocked' }) if blocked (user gets blockedText, no LLM called)
  │     │
  │     ├─ Step 2: parallel( specialists[] )   ← retries:1, retryConfig attempts:2 delay:2000
  │     │     ├─ technical    (Agent id: kestrel-mastra-technical)
  │     │     ├─ fundamental  (Agent id: kestrel-mastra-fundamental)  ← only standard/full
  │     │     ├─ risk         (Agent id: kestrel-mastra-risk)         ← only full
  │     │     └─ sentiment    (Agent id: kestrel-mastra-sentiment)    ← only full
  │     │     Each: Agent.generate(prompt, {
  │     │             requestContext: contextWithPacket(baseContext, packet),
  │     │             memory: readOnlyMemoryOptions(specialistCallOptions),
  │     │             toolChoice:'none', maxSteps, structuredOutput: OpinionSchema
  │     │           })
  │     │     → verifyMastraOpinion() → failure marker {ok:false} or {ok:true, opinion, stats}
  │     │
  │     ├─ Step 3: verify  (strict gate)
  │     │     → if (strict && failedAgents.length>0) throw MastraModeStrictFailureError
  │     │     → else continue with partial opinions + failedAgents list
  │     │
  │     └─ Step 4: fusion (sole writer)
  │           → synthesizeCommitteeAnswer()
  │           → if single (was single/quick): format single opinion directly (no LLM)
  │           → else: Agent(id:kestrel-mastra-decision).generate(prompt, {
  │           │         requestContext: contextWithPacket(ctx, packet),
  │           │         memory: fusionCallOptions (WRITABLE),
  │           │         toolChoice:'none', maxSteps
  │           │       })
  │           → aggregateStats + generationLedger.total()
  │
  └─► else → canonical-chat (single agent, tool-using, streaming)
```

**What `SPECIALISTS_BY_MODE` and `MODE_POLICY` say** (as audited 2026-10-10 — *pre-Q2 state*; task 1.9 collapses this to `single`+`full`, both strict):

| Mode | Specialists | Strict | Continue on partial? | Progress stages |
|---|---|---|---|---|
| `single` | `['technical']` | false | true | `collect-packet, technical, verify, fusion` |
| `quick` | `['technical']` | false | true | same |
| `standard` | `['technical','fundamental']` | false | true | `collect-packet, technical, fundamental, verify, fusion` |
| `full` | `['technical','fundamental','risk','sentiment']` | **true** | false | `collect-packet, technical, fundamental, risk, sentiment, verify, fusion` |

### 4.3 XAUUSD legacy path (still active)

`packages/ai/src/mastra/run.ts` (978 LOC) implements `runXauusdMastra` — a separate orchestrator for `XAUUSD` deep research when `mode=single|auto` and `symbol=XAUUSD` with `prompt ~= /analy[sz]e|outlook|forecast/i`. It builds `contextForRun` with `researchPacket` + optional `priorReport`, uses `createXauusdMastraAgent` with `XAUUSD_RESEARCH_INSTRUCTIONS` and `xauusdMastraTools`. This is **not** the committee; it is a single read-only XAUUSD agent with a packet-backed deterministic grounding path plus a repair loop in `mastra-v2/workflows/xauusd-report.ts` when invoked via workflow.

**Duplication:** `collectXauusdResearchPacket` (XAUUSD-specific, richer macro: news/sentiment/DXY/real-yield) vs `collectSymbolResearchPacket` (generic, lean `optionalContext`). Two packet schemas, two fetch/assemble pipelines.

---

## 5. Data Flow — End to End

### 5.1 Happy path — canonical chat (most turns)

```
User types "explain RSI divergence"
  │
  ▼
ChatScreen Composer → useChat → createKestrelChatTransport (X-CSRF + X-AI-Prefs)
  │
  ▼
POST /api/chat  (runtime:nodejs, maxDuration:60, withAuth, withRateLimit ai_chat)
  ├─ parseJsonBody(BodySchema)                ← Zod validation
  ├─ getThread(userId, threadId)              ← 404 if not found
  ├─ extractUserMessageText / resolveMode()
  ├─ getUserWithSettings(userId)              ← Drizzle, includes aiApiKeys, chatModel, maxDailyUsd
  ├─ listMessages(100) if follow-up-ish       ← provisionalReport scan (regex)
  ├─ createExecutionPlan({ userMessage, mode, modelOverride, settings, env, tenantId, priorReportAvailable })
  │     ├─ resolveSemanticRoutingConfig(settings, env, signal)  ← fast-tier model for classifier
  │     ├─ routeTurn({ userMessage, modelOverride, semanticRouting }) → RoutingDecision{domain, planRequired, rationale}
  │     ├─ extractMastraSymbol / isMastraXauusdCandidate etc.   ← lexical routing
  │     ├─ capabilityFor(mode,symbol,mutation,…) → capabilityId
  │     ├─ evaluateMastraCapability(capabilityId, …) → allowed/blocked
  │     └─ resolveMastraExecutionModel(purpose, settings, env, domain) → { model, modelId, providerId, bareModelId }
  ├─ isInjectionAttempt(userText) → 422 READ_ONLY_REQUEST_REQUIRED if true
  ├─ if isMastraMutationEnabled() → classifyMutationRequest(prompt) → startMutationDraft() → return draft JSON (no LLM)
  ├─ if isMutationIntent(prompt) → 422 READ_ONLY_REQUEST_REQUIRED
  ├─ switch executionPlan.route:
  │     ├─ 'full-analysis' → enqueueFullAnalysis({ userId, threadId, userMessageText, parts, idempotencyKey, traceId, maxDailyUsd, modelSnapshot, executionPlan })
  │     │     → returns { type:'analysis-queued', jobId, status:'queued' } (worker claims async)
  │     ├─ 'xauusd-research' / 'xauusd-conversation' → runResearchWorkflow / runConversationalTurn (buffered vs streaming)
  │     ├─ 'symbol-research' → runResearchWorkflow → runMastraModeChat → committee workflow (see §4.2)
  │     └─ 'canonical-chat' → runConversationalTurn → runMastraCanonicalChatStreamService
  │           → setupCanonicalChat(args):
  │               ├─ routeTurn() again (yes, second time — redundant)
  │               ├─ resolveCanonicalModel()
  │               ├─ domainToolFilter(routing.domain, plan) ∩ READ_ONLY_TOOL_NAMES → registeredTools
  │               ├─ createKestrelMemory({ settings, env, options:kestrelMemoryOptions }) + prepareKestrelMemory({ userId, threadId, backfill:true }) → callMemory
  │               ├─ buildGuardrailInputProcessors({ settings, env, strategy:'rewrite'|'block', mode:'availability'|'strict' }) → inputProcessors
  │               ├─ buildConversationScorers() → scorers (5% sampled)
  │               └─ new Agent({ id:'kestrel-mastra-canonical-chat', model, instructions: systemInstructions(routing,…), tools:registeredTools, inputProcessors, memory })
  │           → withToolContext(ToolContext{ threadId, userId, latestUserMessageText, env, budget, userSettings, db, toolTelemetryBuffer }) {
  │               agent.stream(messages, { requestContext, memory:callMemory, toolChoice:'auto', maxSteps, scorers, abortSignal, tracingOptions }) // or agent.generate
  │             }
  │           → withPersistence / withDiagnostics, recordTelemetry, reconcileBudget, recordToolTelemetry
  │
  └─ streaming response → ChatScreen MessageList → parts registry render
```

### 5.2 Data sources accessed by tools

| Tool category | Examples | Data source | Trust | File |
|---|---|---|---|---|
| `market` | `get_price`, `get_candles`, `get_indicators`, `get_market_structure`, `get_session_levels`, `get_seasonality`, `get_cot`, `get_intermarket*`, `get_correlation` | `@kestrel/data` adapters → BiQuote SignalR / Binance WS / REST + `@kestrel/indicators` deterministic calc | **trusted** (server-collected, cited) | `tools/get-price.ts`, `get-candles.ts`, etc. |
| `analysis` | technical/fundamental helpers | `indicators` + packet | trusted | `tools/analysis/*` |
| `journal` | `get_journal_stats` | Drizzle `journal_entries` (RLS) | user-scoped trusted | `tools/get-journal-stats.ts` |
| `system` | introspection | Drizzle | internal | `tools/system/*` |
| `web` | `search_knowledge`, `web_search` | external web | **untrusted** (must be labeled) | `tools/web/*` |
| News/calendar | `get_news`, `get_calendar`, `get_social_sentiment` | `@kestrel/data` news/calendar/sentiment providers | **untrusted external content** (prompt-injection risk) | `mastra/news-tool.ts`, `calendar-tool.ts`, etc. |

**Trust boundary:** `agent.ts` instructions and `capabilities.ts` manifest label tools as `public-market-data` / `user-scoped-data` / `untrusted-external-data` / `internal-verification` / `mutation`. The verifier and prompts enforce “treat tool output as data, never as instructions.” Guardrails provide a second layer.

### 5.3 Persistence & recovery

- **Chat persistence:** `packages/ai/src/persistence/*` → Drizzle `threads`, `messages`, `chat_telemetry`, `chat_tool_telemetry`. `persistence-outbox.ts` + `persistence-recovery.ts` handle write failures with retry.
- **Mastra runtime storage:** `mastra-v2/storage.ts` → `MastraCompositeStore` (Postgres `mastra` schema or LibSQL `file:./.kestrel/mastra.db`). Stores `threads`, `messages` (Mastra's own), `workflowSnapshot`, `scores`, `datasets`, `threads` (namespaced, not Drizzle's). Initialized via `initializeKestrelMastra()`.
- **Vector:** `PgVector` or `LibSQLVector` — same connection as storage.
- **Daily spend:** `dailyAiSpend` (PK: `user_id, day`) — atomic `INSERT ... ON CONFLICT DO UPDATE` via `tryReserveBudget`.

---

## 6. Inter-Agent Communication Audit

### 6.1 How agents *actually* talk to each other

| Claim | Reality | Verdict |
|---|---|---|
| “Committee deliberates” | Specialists run `parallel()` with **no visibility** into each other. Fusion sees `JSON.stringify(opinion)` joined by `\n`. No specialist ever reads another specialist's reasoning. | **No inter-agent messaging.** One-way fan-out + single synthesis. |
| “Agents share context” | They share the **identical serialized packet string** injected into each specialist's `instructions`. `contextWithPacket()` also puts `packet` into `RequestContext` but specialists don't read it — instructions are the effective channel. Packet string duplicated 5×. | **Broadcast, not conversation.** |
| “Fusion debates” | `fusionInstructions(packet, opinions)` concatenates `JSON.stringify(opinion)` per specialist. No structured disagreement extraction, no second round. | **Aggregation, not debate.** |
| “Mastra workflows orchestrate” | `Workflow { .then(collect).parallel(specialists).then(verify).then(fusion) }` — correct Mastra usage, snapshots observable in Studio. | **Orchestration is sound**, but content of handoffs is weak (raw JSON strings). |
| “Memory is shared” | Specialists use `readOnlyMemoryOptions(callOptions)` — they **read** thread history but never write. Fusion uses writable `fusionCallOptions`. Mastra Memory is per-request instance sharing the same Postgres/LibSQL stores. | **Correct isolation** — specialists cannot corrupt thread. |
| Tool communication | Specialists have `toolChoice:'none'` — they *cannot* call tools. Only `canonical-chat` has tools. Committee tools are *not* agent tools; packet is pre-fetched deterministically. | **Packet replaces tools** by design (fail-closed). Tradeoff is intentional but undocumented. |

### 6.2 Missing communication patterns

1. **No cross-critique round:** Technical says bullish, risk says invalidation at X — but risk never sees technical's levels. A single `critique` step where each specialist reads the others' `reasoning` and revises `confidence` would make this truly deliberative.
2. **No typed handoff:** `specialistInstructions` and `fusionInstructions` build prompt strings via `serializeSymbolResearchPacket` / `JSON.stringify`. A schema-validated `CommitteeContext` object passed via `requestContext` would be more robust and token-efficient.
3. **No streaming of deliberation:** `AgentDeliberation` UI renders only final `opinions`. Users see a spinner, then a wall of text. No progressive disclosure of `technical → fundamental → risk → sentiment` as they complete.

---

## 7. Thinking / Reasoning / Answering Audit

### 7.1 How each path “thinks”

| Path | Thinking mechanism | Answering mechanism | Grounded? |
|---|---|---|---|
| **Canonical chat** | LLM `generate` / `stream` with `toolChoice:auto`, `maxSteps` bounded by `manifestForCapability('canonical-chat').maxSteps`. No explicit COT; provider's reasoning is internal. | Streams `textStream` chunks immediately; `checkCanonicalEvidence(text, toolNames)` post-hoc flags ungrounded numeric claims. | **Soft-grounded** — evidence check is *advisory* (does not block answer, only telemetry). |
| **Committee specialists** | `structuredOutput: { schema: OpinionSchema, jsonPromptInjection:'auto' }` — forces `{ bias, confidence, reasoning, details }`. No tools, no COT. | Returns `OpinionSchema.parse(result.object)` validated JSON. | **Strongly grounded** — `verifyMastraOpinion()` rejects numeric reasoning when packet is `blocked`. |
| **Committee fusion** | Single `generate` with `toolChoice:none`, `fusionInstructions(packet, opinions)` + original user `prompt`. No structured output — free-form markdown. | `fusionResult.text` is final answer. No verifier on fusion output. | **Weakly grounded** — fusion can hallucinate numbers not in opinions/packet; no check. |
| **XAUUSD report** | `generateXauusdReport` with structured `XauusdResearchReportSchema` (scenarios, trigger, invalidation, risks, numericClaims + evidenceIds). | `requireVerifiedXauusdReport(object, packet)` + `verificationFindings` repair loop + `patchTimeframeConflictDisclosure` fallback. | **Strongest grounding** — deterministic grounding/safety/temporal checks + up to 2 repair attempts + disclosure patch. |

### 7.2 Critical gaps in reasoning hygiene

1. **Fusion has no guard:** The strongest verification in the repo (`report-verifier.ts`: grounding, safety, temporal) applies to XAUUSD reports but **not** to committee fusion. A fusion hallucination like “XAUUSD support at 9999” would reach the user without being caught, even though the underlying specialists were verified.
2. **Canonical evidence is non-blocking:** `checkCanonicalEvidence` returns `{ ok, findings }` but `runMastraCanonicalChat` returns it as `evidence` telemetry — the answer streams anyway. An ungrounded numeric claim like “BTC at $200k” is delivered, not degraded.
3. **No confidence calibration:** Specialist `confidence ∈ [0,1]` is LLM-self-reported, never calibrated against packet `dataQuality`. A `degraded` packet can still yield `confidence:0.95`. The verifier passes it; fusion may or may not discount it (prompt says “say so and reduce confidence” but LLM often ignores).
4. **Reasoning is opaque:** `OpinionSchema.details` is `record(z.unknown())` — effectively untyped. No structured `sources[]` or `citations[]` inside opinions. Fusion cannot attribute claims to evidenceIds.
5. **No “thinking” transparency for canonical:** No `reasoning` part is streamed; users see only final text + tool calls retroactively via `parts/get-candles.tsx` etc.

---

## 8. Strengths to Preserve

Do **not** regress these — they are genuinely well-engineered:

1. **Deterministic packet collection (fail-closed).** `collectSymbolResearchPacket` / `collectXauusdResearchPacket` fetch bounded evidence *before* any LLM call. `packet.status === 'blocked'` bails with `blockedText` and never calls the model. This is the single most important correctness property. **Keep it.**
2. **Typed step handoffs.** `SpecialistStepResultSchema`, `CollectPacketOutputSchema`, `XauusdReportWorkflowOutputSchema` — zod schemas at workflow boundaries catch shape drift. Every `getStepResult` read goes through `readStepResult(schema.safeParse)`. **Keep it.**
3. **Read-only specialist isolation.** `readOnlyMemoryOptions` + `toolChoice:'none'` + capability manifest ensures specialists cannot write threads or call tools. Fusion is the sole writer. **Keep it.**
4. **Capability manifest as fail-closed gate.** `mastra/capabilities.ts` + `mastra-v2/registry.ts` + `execution-plan.ts` form an auditable policy layer. New tools cannot reach Mastra agents until classified. **Keep it.**
5. **Structured opinion schema.** `OpinionSchema { bias, confidence, reasoning, details }` makes specialist output testable and verifiable. **Keep it.**
6. **Repair loop observability.** `xauusd-report`'s `dowhile(repairStep)` makes retries visible as workflow snapshot steps (Studio), not an opaque in-process loop. **Keep it; extend to committee.**
7. **Budget reservation atomicity.** `tryReserveBudget` uses `INSERT ... ON CONFLICT` on `(user_id, day)` — race-safe. **Keep it; fix the overlapping wrappers (see §9.3).**
8. **Guardrail layering.** Lexical `isInjectionAttempt` / `isMutationIntent` (zero-cost) → LLM `PromptInjectionDetector` (semantic) → `UnicodeNormalizer`. **Keep the layering; fix the mode inconsistency (see §9.8).**

---

## 9. Findings — Ranked Issue List

Severity: **P0** = ship-blocking / correctness / security · **P1** = stability / perf / major UX gap · **P2** = maintainability / cleanup · **P3** = polish / advanced

### P0 — Fix before any feature work

#### P0-1: Fusion output is unverified (hallucination can reach user)
- **Where:** `committee/synthesizer.ts` → `synthesizeCommitteeAnswer()` returns `fusionResult.text` with no verifier. Compare to `mastra-v2/workflows/xauusd-report.ts` which has `requireVerifiedXauusdReport` + `verificationFindings` + `patchTimeframeConflictDisclosure`.
- **Impact:** Fusion can invent prices/levels not in packet or opinions. Specialists are verified; their synthesis is not.
- **Fix:** Add `verifyFusionAnswer(text, packet, opinions)` — reuse `report-grounding.ts` helpers to check that every numeric claim in `finalText` maps to an evidenceId or opinion `details`. On failure, trigger one bounded repair (re-generate fusion with findings). See Phase 1 task 1.4.

#### P0-2: Two co-existing Mastra generations (`mastra/` vs `mastra-v2/`)
- **Where:** `packages/ai/src/mastra/*` (agent, canonical-chat, research-packet, symbol-research, tools, etc.) vs `packages/ai/src/mastra-v2/*` (instance, storage, memory, guardrails, workflows).
- **Impact:** Onboarding cost is doubled; bug fixes must be applied twice; `collectXauusdResearchPacket` vs `collectSymbolResearchPacket` diverge; new contributors modify the wrong generation.
- **Fix:** Atomic one-PR migration — move `mastra/*` into `mastra-v2` domain folders (`agents/`, `packets/`, `capabilities/`) in a single PR (DECISION: Q9 one PR). See Phase 4 task 4.1.

#### P0-3: Triple routing + duplicated regex soup
- **Where:** `packages/ai/src/routing.ts` (+ `routing-keywords.ts`) vs `packages/ai/src/mastra/routing-policy.ts` vs `apps/web/src/lib/services/mastra-chat-routing.ts` (+ `apps/web/src/lib/services/mastra-execution.ts` branching).
- **Impact:** Symbol extraction, injection detection, and mutation intent are re-implemented with slightly different regexes. They can disagree — e.g. `isMastraXauusdCandidate` vs `isMastraSymbolCandidate` vs `extractMastraSymbol` triple-classify the same prompt. Security gates live in two places.
- **Fix:** Single `packages/ai/src/mastra/router.ts` owning `UnifiedRoutingDecision { domain, symbol, injection, mutationKind, capabilityId, route }` with one regex set imported by both `routing-keywords.ts` and the web layer. See Phase 1 task 1.1.

#### P0-4: Full-mode `modelOverride` explicitly unsupported (silent UX cliff)
- **Where:** `apps/web/src/app/api/chat/route.ts:277-280` → `if (body.modelOverride) return 400 INVALID_MODEL_OVERRIDE` when `route === 'full-analysis'`.
- **Impact:** Power users picking a model and then switching to Full get a 400 with no UI hint that overrides are unsupported in Full. Looks like a bug.
- **Fix:** DECISION: Q7 serialize `modelOverride` onto durable queue payload. Extend `FullAnalysisQueueRow` with `modelIdOverride`/`providerIdOverride`; worker resolves from queue row. If BYOK key missing on worker, fail closed with clear message. See Phase 1 task 1.8.

### P1 — High priority

#### P1-1: Committee specialists share one model instance (no diversity)
- **Where:** `committee/workflow.ts:140-161` → `createCommitteeWorkflow(deps)` closes over single `deps.model` + `deps.modelId` for all specialists and fusion. `specialist-runner.ts:runSpecialistGeneration` reuses same `deps.model` per specialist.
- **Impact:** If the user's BYOK model is rate-limited / degraded / biased, all 4 specialists fail or correlate identically. Multi-agent diversity is prompt-only.
- **Fix:** Resolve per-specialist model ids at **top-tier quality** (DECISION: Q1/Q6 quality always — never downgrade to fast/mini/flash for cost). All 4 specialists + fusion use top-tier models; diversity comes from distinct prompts and optionally distinct top-tier families (e.g. technical=Claude top-tier, fundamental=GPT top-tier), never from cheaper tiers. See Phase 3 task 3.1. DECISION: Q6 cross-critique is ON by default for Full to add quality via deliberation, not via cheaper models.

#### P1-2: Packet serialization fan-out costs 5× context tokens
- **Where:** `committee/prompts.ts:specialistInstructions()` + `fusionInstructions()` → `serializeSymbolResearchPacket(packet)` called 5 times; each specialist + fusion prompt contains the full packet string. Packet = 480 candles + 20 indicator rows + optionalContext.
- **Impact:** Token cost scales linearly with committee size. A Full run pays ~4× packet duplication vs a single-agent run, largely redundant. Latency + cost + context-window pressure.
- **Fix:** Inject packet once via `RequestContext` + `Agent` instructions factory that reads `requestContext.get('packet')` (already wired for `agent.ts` path) instead of interpolating. Pass opinions as typed `requestContext` entries, not `JSON.stringify` join. See Phase 2 task 2.2.

#### P1-3: No packet / tool-result caching
- **Where:** `mastra/research-packet-fetch.ts`, `mastra/symbol-research.ts` → fresh `getCandlesWithMeta` + `getPriceWithMeta` + `computeIndicator` per turn, even for identical `(symbol, timeframe)` within seconds.
- **Impact:** Cost, latency, provider rate-limit burn, and Thundering Herd on burst traffic (e.g. market open).
- **Fix:** 30s fresh-only cache (DECISION: Q5). `mastra/packet-cache.ts` in-memory LRU + Redis if `REDIS_URL` set, key `packet:${symbol}:${floor(generatedAt,15s)}`. `fresh` only; `stale`/`degraded` never cached — quality-first per Q1. See Phase 2 task 2.1.

#### P1-4: Circuit breaker is in-memory only (useless on serverless)
- **Where:** `model-circuit-breaker.ts` → `Map<string, CircuitState>` per instance. Comment says “Fail-open per Vercel instance; shared via provider_health approach from H1.”
- **Impact:** Each Vercel isolate has its own breaker. A globally degraded provider still gets hammered by other isolates. H1 fix never shipped.
- **Fix:** Back with `provider_health` (or `llm_circuit_state`) Drizzle table; check before `resolveMastraExecutionModel`, record via `recordModelFailure` with `UPDATE ... SET consecutive_failures`. See Phase 1 task 1.6.

#### P1-5: Canonical-chat memory prep throws with no fallback (turn fails closed opaquely)
- **Where:** `mastra/canonical-chat.ts:256-290` → `prepareKestrelMemory` wrapped in `try/catch`, but throws `Error('Native Mastra memory could not be prepared.')` which bubbles to `mastraFailureResponse` → 502 with generic message.
- **Impact:** Transient Postgres/LibSQL/vector-store hiccup kills the turn even though explicit history fallback (`messageHistory(history, latest)`) is available and was the previous behavior.
- **Fix:** On memory prep failure, log warning, set `memoryDegraded=true`, and fall back to `messageHistory` path (existing branching at `callMemory ? latestUserModelMessages : messageHistory` already supports it). Surface `memoryMode:'degraded'` in response parts. See Phase 1 task 1.5.

#### P1-6: 60s `maxDuration` vs durable Full + committee fan-out race
- **Where:** `apps/web/src/app/api/chat/route.ts:runtime='nodejs', maxDuration=60` + `Workflow retryConfig { attempts:2, delay:2000 }` + 4 parallel specialists each `maxSteps` bounded but provider latency unbounded.
- **Impact:** Committee Full can exceed 60s (4 specialists + fusion, each up to provider timeout). The route aborts via `AbortSignal.timeout(ROUTE_TIMEOUT_MS)` but the workflow run continues server-side (orphaned). User sees 502; worker still writes? Unclear.
- **Fix:** Enforce server-side deadline propagation: `signal` already threaded, but add `withTimeout` wrapper. Under strict semantics (DECISION: Q3) a deadline counts as `failedAgents` → `MastraModeStrictFailureError` (no partial). Document sync `single` vs durable `full` distinction in UI. See Phase 1 task 1.7.

#### P1-7: Guardrail mode inconsistency (strict vs availability drifts)
- **Where:** `mastra-v2/guardrails.ts: buildResearchGuardrails()` → `strict` only when `NODE_ENV===production || MASTRA_STRICT_GUARDRAILS===true`; otherwise `availability`. But `canonical-chat.ts:301-306` forces `mode:'strict', strategy:'block'` for canonical (which has external retrieval) while `committee/workflow.ts` defers to `researchInputProcessors` (often `availability`).
- **Impact:** Local/dev silently runs without injection detection; staging may not match prod. Committee specialists get weaker guardrails than canonical even though they handle the same user prompt.
- **Fix:** Unify via `executionPlan.guardrailMode` (derived from `capabilities.ts` manifest `trust` level, not `NODE_ENV`). All research paths use `strict` when capability trust is `untrusted-external-data`. See Phase 1 task 1.2.

#### P1-8: No streaming deliberation UX
- **Where:** `components/chat/parts/agent-deliberation.tsx` + `convene-committee.tsx` vs `committee/types.ts:committeeProgressStages` + `workflow.ts:onProgress`.
- **Impact:** `onProgress(step: CommitteeStepId)` exists and `updateFullAnalysisProgress` persists progress, but synchronous committee runs do not stream `committeeProgressStages` to the browser. User sees spinner for 10–20s with no signal that `technical` completed and `fundamental` is running.
- **Fix:** Stream `CommitteeStepId` progress events over the UI message stream (`data-committee-progress` part) for all committee runs, not just durable Full. See Phase 2 task 2.4.

#### P1-9: XAUUSD path duplication obscures the architecture
- **Where:** `mastra/run.ts` + `mastra/agent.ts` + `mastra/research-packet*` vs `mastra/symbol-research.ts` + `committee/*`.
- **Impact:** Two packet schemas (`XauusdResearchPacket` richer with macro/news/DXY vs `SymbolResearchPacket` lean), two fetch/assemble pipelines, two report types. Generalizing to “any symbol” requires changing both.
- **Fix:** Merge into single `SymbolResearchPacket` with `XauusdExtension` (macro/optionalContext) behind `symbol === 'XAUUSD'` branch. Collapse `run.ts` XAUUSD wiring into `mode-runner.ts` (or delete `run.ts` after migration). See Phase 4 task 4.2.

#### P1-10: Budget wrappers overlap and are easy to misuse
- **Where:** `cost.ts` (`tryReserveBudget`, `applyBudgetDelta`, `releaseBudgetReservation`) vs `budget-guard.ts` (`reserveBudget`, `reconcileBudget`, `releaseBudget`) vs `budget-reservation.ts` (`reserveTurnBudget`). Three modules, overlapping names, different `BudgetReservation` shapes.
- **Impact:** A new agent path can easily call the wrong layer (e.g. `reserveTurnBudget` without `reconcileBudget` → stranded reservation).
- **Fix:** Single `budget.ts` facade for **observability only** (DECISION: Q4 no daily cap). `acquireBudget` always succeeds — it logs/ledgers cost but never throws `BudgetExceededError`. `cost.ts` rate table + `generationLedger` + admin usage dashboard kept; the 429 branch in `/api/chat` removed/gated behind `ENFORCE_BUDGET=false` default. Add admin alert (non-blocking) when spend exceeds thresholds. See Phase 1 task 1.3.

### P2 — Maintainability & code health

#### P2-1: 978-line `mastra/run.ts` god module
- Single file owns XAUUSD turn-mode branching (`research|conversation|followup`), `followupPacketFromReport`, model pinning (`MASTRA_XAUUSD_MODEL`), `contextForRun`, and ledger wiring. Violates SRP; hard to test.

#### P2-2: Prompt strings built via interpolation, not structured context
- `specialistInstructions` + `fusionInstructions` concatenate packet JSON into a single string. Prompt length is opaque; no token estimate before call. Refactor to pass `packet` as typed `requestContext` + `Agent` instruction function that reads context (already done for `agent.ts` — replicate).

#### P2-3: `OpinionSchema.details` is `record(z.unknown())` — untyped
- Fusion cannot attribute claims; verifier cannot check numeric grounding per field. Should be `{ sources?: string[], numericClaims?: Array<{value, evidenceId}>, assumptions?: string[] }` or similar.

#### P2-4: Magic regexes in `mastra-chat-routing.ts` and `routing-keywords.ts` diverged
- `EXECUTION_VERBS`, `MUTATION_COMMANDS`, `XAUUSD_TERMS`, `FUNDAMENTAL_PATTERNS` etc. should be one source array imported by both layers, with unit tests covering disagreement matrix.

#### P2-5: `tools/` barrel side-effect registration
- `tools/index.ts` imports `./market` etc. for self-registration via `toolRegistry.register`. Import order matters for tree-shaking; circular import risk if a tool imports `toolRegistry`. Prefer explicit `registerAllTools()` called once at boot.

#### P2-6: `mastra/capabilities.ts` 660 LOC mixes manifest + policy + tool subsets
- Split into `capabilities/manifest.ts` (data), `capabilities/policy.ts` (evaluation), `capabilities/tools.ts` (domainToolFilter bridge).

#### P2-7: Test harness fragmentation
- `vitest.config.ts` + `vitest.workspace.ts` at root, plus `packages/ai/vitest.config.ts`, `apps/web/vitest.config.ts`, `loadtest/`, `scripts/check-*`. No single `pnpm test:ai --coverage` gate in CI that covers the committee verification matrix.

### P3 — Polish & advanced

#### P3-1: No planner agent
- `routing.ts` is rule-based (keyword + small LLM classifier). A true planner (`plan-then-act` pre-step is mentioned in `docs/architecture.md` but not implemented as an agent) would decompose “analyze XAUUSD and compare to DXY” into parallel sub-tasks. Consider a lightweight planner workflow for `fundamental` domain.

#### P3-2: No observational-memory budget enforcement
- `mastra-v2/memory.ts:OBSERVATIONAL_MEMORY_REFINING_STEP_USD` is defined but `ENABLE_MASTRA_OBSERVATIONAL_MEMORY` is off by default and never budgeted in `enqueueFullAnalysis`. Background spend is invisible until enabled — then it will surprise billing.

#### P3-3: Evals not wired to CI gate
- `mastra-v2/evals/*` (scorers, datasets, gate) and `eval/*` (legacy) exist; Langfuse tracing is optional. No CI quality gate blocks a PR that degrades citation/grounding scores. Wire `createMastraEvalGate` to CI (nightly, not per-PR).

#### P3-4: Telegram `BotDispatcher` duplicative routing
- `packages/ai/src/bot/dispatcher.ts` re-implements symbol/mutation parsing for Telegram, diverging from web's `mastra-chat-routing`. Should delegate to unified router.

#### P3-5: Landing showcase oversells
- `LandingArchitecture` + `multi-agent-committee.svg` imply 4-desk deliberation is always on. Copy should qualify per Q2: “Choose **Full** for a 4-desk committee deliberation; **Single** gives an instant one-desk read.” Update alongside task 1.9's mode collapse so landing and product agree on the two modes.

---

## 10. Upgrade Plan — Phased Implementation

> **Execution order matters.** Phase 1 must be shippable independently. Phases 2–5 can overlap after Phase 1 lands. Each phase ends with a verification checkpoint — do not start the next phase until the checkpoint passes.

### Phase 0 — Decisions & Prep (1–2 days, owner + implementing agent)

**Goal:** Resolve open questions (§13) and establish guardrails.

| Step | Action | Owner |
|---|---|---|
| 0.1 | Answer Q1–Q9 in §13. **DONE 2026-10-10** — logged in `docs/plans/decisions.log.md`. One question remains open: Q8 observational memory (needs `ON`/`OFF` from owner). | Product owner |
| 0.2 | Create `docs/plans/decisions.log.md`. **DONE 2026-10-10.** | Implementing agent |
| 0.3 | Add temporary feature flags for each phase (`PHASE1_UNIFIED_ROUTER`, `PHASE3_MODEL_DIVERSITY`, etc.) so rollback is one env var. Note: Q9 is one PR — Phase 4 flag is `PHASE4_MIGRATED` single toggle. | Implementing agent |
| 0.4 | Snapshot baseline metrics: `pnpm test:ai --coverage --run`, `pnpm typecheck`, `knip` report, committee p95 latency (log if not in Datadog/Langfuse). | Implementing agent |

**Checkpoint 0:** Decisions logged (8/9 closed, Q8 pending ON/OFF); feature flags in `packages/shared/env.ts` + `apps/web/.env.example`; baseline metrics saved to `docs/archive/audit-2026-q1/baseline.md`.
**Note on updated invariants:** From here forward, every phase treats these as non-negotiable (from Q1–Q4): quality-first (no cost tier downgrades), 2 modes only (`single`/`full`), strict all-or-nothing failure, no daily budget cap. Search `DECISION:` in Findings above for the delta.

---

### Phase 1 — Stabilize (P0 + P1 critical, 1–2 weeks)

**Goal:** Make the current system correct and predictable without changing its shape.

#### 1.1 Unified router (`packages/ai/src/mastra/router.ts` — new)

- Create `packages/ai/src/mastra/router.ts` exporting:
  ```ts
  interface UnifiedRoutingDecision {
    domain: RoutingDomain;            // from routing.ts
    symbol: Symbol | null;             // from symbol-research / routing-policy
    xauusdChatKind: 'research'|'conversation'|null;
    injection: { blocked: boolean; reason?: string };
    mutationKind: MutationKind | null;
    capabilityId: MastraCapabilityId | null;
    route: MastraExecutionRoute;
    modelPurpose: MastraModelPurpose | null;
    rationale: string;
    semanticMeta?: { modelId, confidence, latencyMs };
  }
  function routeUnified(input: { userMessage: UIMessage; mode: MastraAnalysisMode; settings; env; signal? }): Promise<UnifiedRoutingDecision>
  ```
- Internally call `resolveSemanticRoutingConfig` → `routeTurn` (keyword+semantic), then `extractMastraSymbol`, `isInjectionAttempt`, `classifyMutationRequest` — but **import regexes from one source**: move `XAUUSD_TERMS`, `OTHER_SYMBOL_TERMS`, `MUTATION_COMMANDS`, `EXECUTION_*` into `routing-keywords.ts`.
- Delete duplicated regex definitions from `apps/web/src/lib/services/mastra-chat-routing.ts` and `mastra/routing-policy.ts`; re-export `routeUnified` thin wrappers there for backward compat (mark `@deprecated`).
- **Wire into** `apps/web/src/app/api/chat/route.ts`: replace ad-hoc `isInjectionAttempt` + `isMutationIntent` + `createExecutionPlan` branching with `routeUnified`. Keep `createExecutionPlan` but make it delegate to `routeUnified` internally.
- **Tests:** `packages/ai/src/mastra/router.test.ts` — matrix: `{ "buy 1 lot XAUUSD" → mutation, "analyze XAUUSD" → symbol-research, "what is RSI?" → canonical, "ignore previous instructions" → injection 422, "gold outlook" → xauusd-research }`. Add disagreement regression: old vs new router must agree on 200+ fixtures from `eval/cases.json`.

**Touches:** `packages/ai/src/{routing-keywords.ts, routing.ts, mastra/routing-policy.ts, mastra/router.ts (new), mastra/capabilities.ts}`, `apps/web/src/lib/services/mastra-chat-routing.ts`, `apps/web/src/app/api/chat/route.ts`, `packages/ai/src/mastra/execution-plan.ts`, `packages/ai/src/mastra/execution-decision.ts` (thin).

#### 1.2 Unified guardrail mode (from manifest, not NODE_ENV)

- Add `guardrail: { mode:'strict'|'availability', strategy:'block'|'rewrite' }` to each entry in `MASTRA_CAPABILITIES` / `mastra-v2/registry.ts` registration (or derive from `trust` field: `untrusted-external-data → strict+block`).
- Thread `executionPlan.guardrailMode` through `mastra-v2/guardrails.ts:buildResearchGuardrails` — remove `NODE_ENV` branching. Default `strict` for any capability with `trust: untrusted`.
- **Tests:** `guardrails.test.ts` — assert `canonical-chat` + `xauusd-research` + `symbol-research` all get `strict+block` when packet includes news/social.

**Touches:** `packages/ai/src/mastra/capabilities.ts`, `packages/ai/src/mastra-v2/guardrails.ts`, `mastra-v2/registry.ts`, `packages/ai/src/mastra/execution-plan.ts`.

#### 1.3 Single budget facade — observability only, no blocking (DECISION: Q4)

- Create `packages/ai/src/budget.ts` (or refactor `budget-guard.ts` to re-export):
  ```ts
  interface BudgetHandle { id: string; estimatedUsd: number; release(): Promise<void>; reconcile(actualUsd:number): Promise<void>; [Symbol.asyncDispose](): Promise<void>; }
  function acquireBudget(userId:string, estimatedUsd:number): Promise<BudgetHandle> // never throws BudgetExceededError
  ```
- Internally calls `cost.ts:tryReserveBudget` + `applyBudgetDelta` + `releaseBudgetReservation` for **ledger/accounting only**. Always returns `{ ok:true }`. Keep `cost.ts` as pure rate table + `estimateCostUsd` / `estimateKnownCostUsd` + `generationLedger`. DECISION Q4: `MAX_DAILY_USD` stays in env for admin reporting, but `/api/chat` **never** returns 429 `BUDGET_EXCEEDED`. Remove/gate that branch behind `ENFORCE_BUDGET` (default false). Add non-blocking admin alert when spend exceeds thresholds (Phase 5 observability).
- Migrate call sites: `apps/web/src/app/api/chat/route.ts` (remove 429 branch), `mastra-v2/workflows/full-analysis.ts` (`enqueueFullAnalysis` — still records cost), `mastra/canonical-chat.ts` (`reconcileBudget` — accounting only).
- Delete `budget-reservation.ts` wrappers or mark deprecated.

**Touches:** `packages/ai/src/budget.ts` (new), `cost.ts`, `budget-guard.ts`, `budget-reservation.ts`, `mastra-v2/workflows/full-analysis.ts`, `apps/web/src/app/api/chat/route.ts`, `mastra/canonical-chat.ts`.

#### 1.4 Fusion verifier — strict (mirror of XAUUSD report verifier, DECISION: Q3)

- Create `packages/ai/src/committee/fusion-verifier.ts`:
  ```ts
  interface FusionVerification { ok:boolean; findings:string[] }
  function verifyFusionAnswer(text:string, packet:SymbolResearchPacket, opinions:MastraModeOpinion[]): FusionVerification
  ```
- Reuse helpers from `mastra/report-grounding.ts` + `report-verifier.ts` (numeric claim → evidenceId mapping). Check: every numeric price/level/indicator value in `finalText` must appear in `packet` evidences or `opinions[].details`. Empty `finalText` is `findings: ['empty fusion']`.
- Wire into `committee/synthesizer.ts:synthesizeCommitteeAnswer` after `fusionResult.text`: run `verifyFusionAnswer`; on failure, one bounded repair re-generate with `repairPrompt(originalPrompt, findings)` (reuse `mastra/report-generation.ts:repairPrompt` pattern). **If repair also fails, throw `MastraModeStrictFailureError` with findings — do NOT return degraded prefix** (DECISION: Q3 strict — no partial/degraded answer). Fusion hallucination is terminal.
- **Tests:** `committee/fusion-verifier.test.ts` + `synthesizer.test.ts` (mock fusion LLM to return hallucinated price → assert repair → assert strict failure if repair fails).

**Touches:** `packages/ai/src/committee/fusion-verifier.ts` (new), `committee/synthesizer.ts`, `mastra/report-grounding.ts` (extract shared helpers if needed), `committee/workflow.ts` (pass verifier).

#### 1.5 Memory fallback (graceful degraded mode)

- In `mastra/canonical-chat.ts:setupCanonicalChat`, change:
  ```ts
  } catch (error) {
    throw new Error('Native Mastra memory could not be prepared.', { cause: error });
  }
  ```
  to:
  ```ts
  } catch (error) {
    mlog.warn('Native memory prep failed; falling back to explicit history', { error });
    memory = null; callMemory = null; memoryDegraded = true;
  }
  ```
- Already downstream handles `callMemory ? latestUserModelMessages : messageHistory`. Add `memoryMode:'degraded'` telemetry + `data-memory-degraded` UI part so user knows recall is off.
- **Test:** Mock `prepareKestrelMemory` to throw → assert turn still succeeds and returns degraded flag.

**Touches:** `packages/ai/src/mastra/canonical-chat.ts`.

#### 1.6 Persistent circuit breaker

- Create Drizzle table `provider_circuit_state` (or reuse `provider_health` if exists — check `packages/db/src/schema.ts` first):
  ```sql
  provider_circuit_state (provider_id text PK, consecutive_failures int, opened_at timestamptz, updated_at timestamptz)
  ```
- Replace `model-circuit-breaker.ts` in-memory `Map` with `getDb()`-backed read/write: `isCircuitOpen` does `SELECT ... WHERE provider_id = $1`, `recordModelFailure` does `INSERT ... ON CONFLICT DO UPDATE SET consecutive_failures = consecutive_failures + 1`.
- Keep in-memory `Map` as L1 cache (5s TTL) to avoid per-turn DB hit, but DB is source of truth across isolates.
- **Tests:** `model-circuit-breaker.test.ts` with `pg-mem` or mocked `getDb`.

**Touches:** `packages/db/src/schema.ts` (migration), `packages/ai/src/model-circuit-breaker.ts`, `packages/ai/src/mastra-v2/storage.ts` (no change, just note).

#### 1.7 Deadline propagation & cooperative cancel — strict (DECISION: Q3)

- Define `COMMITTEE_DEADLINE_MS = 45_000` (< `maxDuration 60_000` leaving 15s headroom for persistence/streaming).
- In `committee/workflow.ts`, wrap `runSpecialistGeneration` calls with `withTimeout(COST_BUDGET, signal)` that converts `AbortError` to `{ok:false, error:'deadline' }` marker instead of throwing. `verify` step treats deadline failures as `failedAgents` → `MastraModeStrictFailureError` (DECISION: Q3 — no partial). A timeout fails the whole committee; user retries.
- In `apps/web/src/app/api/chat/route.ts`, change `AbortSignal.timeout(ROUTE_TIMEOUT_MS)` to deadline-aware: `ROUTE_TIMEOUT_MS = 55_000` and pass `{ signal }` to `runResearchWorkflow` so specialists see the same deadline.
- Update UI: if `failedAgents` includes deadline, show strict failure message “Committee analysis timed out (risk/sentiment did not complete) — please retry. No partial answer returned.”

**Touches:** `packages/ai/src/committee/workflow.ts`, `specialist-runner.ts`, `utils/timeout.ts` (new helper), `apps/web/src/app/api/chat/route.ts`, `components/chat/parts/agent-deliberation.tsx`.

#### 1.8 Full-mode modelOverride serialization (DECISION: Q7)

- Extend `FullAnalysisPayloadSchema` / `FullAnalysisQueueRow` to include `modelSnapshot` override (or `modelIdOverride?: string | null`).
- In `apps/web/src/app/api/chat/route.ts` full-analysis branch, remove the 400 guard; instead include `body.modelOverride` in `enqueueFullAnalysis` payload.
- Worker path (`mastra-v2/workflows/full-analysis.ts` claim/execute) must resolve `modelSnapshot` from queue row, not re-resolve from settings alone.
- If not serializable (e.g. BYOK key missing on worker), fail closed with `MastraModeStrictFailureError` (DECISION: Q3 strict) and surface “Model override unavailable for durable Full analysis — run as Single instead” UX. (DECISION: Q7/Q2 — only single and full exist, so “instead” is single.)

**Touches:** `packages/ai/src/mastra-v2/workflows/full-analysis.ts`, `packages/db/src/schema.ts` (queue table), `apps/web/src/app/api/chat/route.ts`.

#### 1.9 Two-mode collapse: `single` + `full` only (DECISION: Q2)

Execute alongside 1.1 — the unified router is the natural place to land the mode schema change.

- `packages/ai/src/committee/types.ts`:
  - `MastraAnalysisModeSchema = z.enum(['single', 'full'])`
  - `SPECIALISTS_BY_MODE = { single: ['technical'], full: ['technical', 'fundamental', 'risk', 'sentiment'] }`
  - `MODE_POLICY` both entries `strict: true`, `continueOnPartialFailure: false` (Q3 — also flips `single` from partial-continue to strict)
- Compat shim (one release): `resolveMode()` in `mastra/routing-policy.ts` maps legacy `quick → 'single'`, `standard → 'full'`, `auto → 'single'`; log a deprecation warning. Old `full_analysis_queue` rows with `mode: 'quick'|'standard'` resolve through the same shim when claimed.
- `apps/web`:
  - `ChatTopBar` mode selector → two options only (`Single`, `Full`) with a one-line description each ("Single — fast one-desk read", "Full — 4-desk committee, verified").
  - `/api/chat` BodySchema `analysisMode` enum updated; anything else 400s.
- `committeeProgressStages` automatically shrinks (derives from `SPECIALISTS_BY_MODE`).
- **Tests:** update all mode-policy tests; add `resolveMode` compat test (`quick`→`single`, `standard`→`full`); assert `MODE_POLICY.single.strict === true`.

**Touches:** `packages/ai/src/committee/types.ts`, `mastra/routing-policy.ts`, `mastra/capabilities.ts` (mode-gated capability checks), `mastra/execution-decision.ts` (`capabilityFor` mode branches), `mastra/mode-runner.ts`, `mastra-v2/workflows/full-analysis.ts` (queue-row compat), `apps/web/src/app/api/chat/route.ts`, `apps/web/src/components/chat/chat-top-bar.tsx`, `components/chat/parts/convene-committee.tsx` (any 4-mode copy).

**Checkpoint 1:** `pnpm typecheck` green; `pnpm test:ai --run` green (including new router/guardrail/fusion-verifier/budget/circuit-breaker tests); `pnpm build:packages` green; manual smoke: `single` + `full` (queued → claimed → completed) + symbol-free canonical all succeed (DECISION: Q2 two modes only); strict failure verified (any specialist failure → full failure, no partial — Q3); no 429 budget block (Q4 — spend still ledgered); `isInjectionAttempt("ignore previous instructions")` → 422 on all paths; degraded memory still returns answer.

---

### Phase 2 — Performance (1 week, parallelizable after Phase 1)

#### 2.1 Packet & indicator cache — 30s fresh-only (DECISION: Q5)

- Add `packages/ai/src/mastra/packet-cache.ts`:
  ```ts
  interface PacketCache { get(symbol:Symbol): Promise<SymbolResearchPacket|null>; set(packet:SymbolResearchPacket): Promise<void>; }
  ```
- Impl: in-memory LRU (e.g. `lru-cache` 10k entries, 30s TTL) + optional Redis (if `REDIS_URL` set, via `ioredis` already in `docker-compose.observability.yml`). Key: `packet:${symbol}:${floor(generatedAt,15s)}:${dataQuality}`. Value: serialized packet JSON (zod-validated on read). **DECISION Q5: 30s TTL, fresh only — stale/degraded never cached.** Quality-first per Q1.
- Wrap `collectSymbolResearchPacket` — check cache before `getCandlesWithMeta`/`getPriceWithMeta`. On `packet.status==='blocked'` do not cache.
- Indicator cache: `packages/indicators` already deterministic — add `computeIndicatorMemo` LRU inside `packages/ai/src/mastra/research-packet-indicators.ts` so re-used candle arrays don't recompute RSI/MACD.

**Touches:** `packages/ai/src/mastra/packet-cache.ts` (new), `mastra/symbol-research.ts`, `mastra/research-packet-fetch.ts`, `mastra/research-packet-indicators.ts`, `packages/indicators/*` (optional memo).

#### 2.2 Zero-copy packet for committee (eliminate 5× duplication)

- Refactor `committee/prompts.ts`:
  - Change `specialistInstructions(name, packet)` to read `packet` from `requestContext.get('packet')` inside the `Agent` instructions function (like `agent.ts:instructionsForRequest` already does). Do not interpolate `serializeSymbolResearchPacket(packet)` into the instructions string.
  - Same for `fusionInstructions(packet, opinions)` — pass `opinions` as `requestContext.set('opinions', opinions)` and let the `Agent` instruction function format them.
- Update `committee/workflow.ts` + `specialist-runner.ts` + `synthesizer.ts` to set `packet`/`opinions` on `contextWithPacket` (already does) and remove `serialize*` calls from prompt builders.
- **Token saving:** Measured via `token-estimate.ts` — expect ~60% reduction in committee input tokens for Full (4 specialists).

**Touches:** `packages/ai/src/committee/{prompts.ts, workflow.ts, specialist-runner.ts, synthesizer.ts}`, `mastra/symbol-research.ts` (expose `serializeSymbolResearchPacket` deprecation).

#### 2.3 Streaming progress for synchronous committee

- Extend `committee/workflow.ts` `onProgress` callback to emit via `workflow.stream()` (Mastra's `Workflow.stream()` already supports step events). Convert `CommitteeStepId` to SSE parts:
  ```ts
  // In apps/web/lib/services/mastra-mode.ts:runMastraModeChat
  const stream = await workflow.stream(input, { requestContext, ... });
  for await (const event of stream) { yield { type:'data-committee-progress', step:event.stepId, status:event.status } }
  ```
- Update `createKestrelChatTransport` to forward `data-committee-progress` to `AgentDeliberation` (progress bar: `collect-packet ✓ → technical ✓ → fundamental …`).
- Also stream for `mastra-v2/workflows/xauusd-report.ts` repair attempts.

**Touches:** `packages/ai/src/committee/workflow.ts`, `mastra/mode-runner.ts`, `apps/web/src/lib/services/mastra-mode.ts`, `apps/web/src/lib/chat-transport.ts`, `components/chat/parts/agent-deliberation.tsx`.

#### 2.4 Guardrail + packet parallelization

- In `mastra/canonical-chat.ts:setupCanonicalChat`, run `resolveMastraExecutionModel` + `buildGuardrailInputProcessors` + `collectSymbolResearchPacket` (for committee paths) in parallel via `Promise.allSettled`. Today they are sequential.
- Add latency telemetry: `mastra_setup_latency_ms{ phase: 'model'|'guardrail'|'memory' }`.

**Touches:** `packages/ai/src/mastra/canonical-chat.ts`, `mastra/mode-runner.ts`, `mastra-v2/guardrails.ts`.

**Checkpoint 2:** p95 `full` (and `single`) latency vs baseline measured and logged; token cost per `Full` measured via `generation-ledger`; `AgentDeliberation` animates progress within 1s of turn start. Note: modes are `single`+`full` only after Q2; references to `standard`/`quick` in checkpoints map to `single`. Fresh-only cache never serves stale (Q1/Q5).

---

### Phase 3 — True Multi-Agent Upgrade (1–2 weeks)

#### 3.1 Model diversity for committee — quality-only (DECISION: Q1)

- Extend `CommitteeWorkflowDeps` with `resolveModelForSpecialist(name: MastraSpecialistName) => { model: LanguageModel; modelId:string; providerId:string }`.
- Default mapping: **all specialists + fusion use top-tier quality** (DECISION Q1 — never downgrade to `fast`/`mini`/`flash` for cost). Configurable via `MASTRA_COMMITTEE_MODELS` env JSON or `userSettings` only to pick *which* top-tier family per specialist (e.g. `{ technical:"anthropic/claude-sonnet-4", fundamental:"openai/gpt-4o", risk:"anthropic/claude-sonnet-4", sentiment:"xai/grok-4" }`), not to pick cheaper tiers. If only one BYOK provider is configured, all specialists use that one top-tier model — diversity is prompt-only in that case.
- On `isCircuitOpen(modelId)` true, fail closed per Q3 is an option; alternatively fall back to another top-tier family if configured. Never fall back to a cheap model for diversity.
- **Tests:** `committee/workflow.test.ts` with mocked `resolveModelForSpecialist` returning distinct top-tier ids; assert opinions carry distinct `model` fields.

**Touches:** `packages/ai/src/committee/workflow.ts`, `specialist-runner.ts`, `synthesizer.ts`, `byok-providers.ts`, `model.ts`, `packages/shared/env.ts`, `docs/configuration.md`.

#### 3.2 One-round cross-critique — ON by default for Full (DECISION: Q6)

- After `parallel(specialists)`, add step `critique` — **ON by default for `full`** (DECISION Q6 quality over speed). Single mode unchanged (1 desk, nothing to critique). Config is `ENABLE_COMMITTEE_CRITIQUE` (default `true` for `full`), not opt-in.
  ```
  collect → parallel(specialists) → critique → verify → fusion
  ```
- `critique` step: each specialist receives the *other* specialists' `{ bias, confidence, reasoning }` (not `rawData`) and returns `{ confirms:boolean, revisedConfidence:number, critique:string }`. Implemented as 4 parallel `Agent.generate` calls (all top-tier per Q1) with `critiqueInstructions(opinion, peerOpinions, packet)`.
- Fusion receives both `opinions` and `critiques`; `fusionInstructions` updated to “state agreement/disagreement *and* how specialists responded to each other.”
- Cost: +4 top-tier LLM calls per Full run (~$0.03–0.08, +2–3s). Acceptable per Q6 since speed is not priority.
- **Tests:** `committee/critique.test.ts` — mock specialists returning conflicting biases, assert critiques capture disagreement.

**Touches:** `packages/ai/src/committee/workflow.ts` (new step), `prompts.ts` (critiqueInstructions), `specialist-runner.ts` (reusable), `types.ts` (CritiqueSchema).

#### 3.3 Fusion structured output option

- For `full` only (per Q2 two-mode collapse), change `fusionStep` `toolChoice:'none'` to optional `structuredOutput: FusionAnswerSchema { bottomLine, reasoning, risks, invalidation, scenarioTable }` when `PHASE3_STRUCTURED_FUSION=true`. Current free-form markdown remains default; structured variant enables deterministic rendering (`MastraReportScenarios` part).

**Touches:** `committee/synthesizer.ts`, `committee/types.ts`, `components/chat/parts/mastra-report-scenarios.tsx`.

**Checkpoint 3:** `Full` with `ENABLE_COMMITTEE_CRITIQUE=true` produces `critiques[]` in workflow snapshot (Studio); cross-critique adds < 3s p95 vs without; manual review of 10 prompts shows critiques surface disagreements that fusion summarizes (not ignored).

---

### Phase 4 — Maintainability & Cleanup (1 week, parallelizable)

#### 4.1 Atomic migration: `mastra/` → `mastra-v2/domain/` — ONE PR (DECISION: Q9)

Structure after:

```
packages/ai/src/mastra-v2/
  agents/canonical/      ← from mastra/canonical-chat.ts
  agents/xauusd/         ← from mastra/agent.ts + run.ts
  packets/               ← from mastra/research-packet* + mastra/symbol-research.ts
  capabilities/          ← from mastra/capabilities.ts (split manifest/policy/tools)
  workflows/             ← already there (full-analysis, xauusd-report, mutation)
  guardrails.ts, storage.ts, memory.ts, ...
packages/ai/src/mastra/  ← re-export shims for one release, then delete (or removed atomically — decider: one PR means move all at once, not incrementally)
```

- Single atomic PR: move all folders at once, update all imports (`apps/web`, `packages/ai/src/index.ts` barrel) in the same commit. Mitigate risk with feature flag `PHASE4_MIGRATED` for revert and mandatory `pnpm typecheck` + `pnpm test:ai --run` + `pnpm build:packages` green before merge.
- Update `docs/architecture.md` diagram (`mastra` → `mastra-v2`).

**Touches:** all `mastra/*` → `mastra-v2/*`, `packages/ai/src/index.ts` barrel, `tsconfig` paths (none needed — same package).

#### 4.2 Collapse XAUUSD special path

- Extend `SymbolResearchPacket` with `xauusdExtension?: { macro, news, dollarIndex, realYield }` (from `XauusdResearchPacket`). `collectXauusdResearchPacket` becomes `collectSymbolResearchPacket('XAUUSD', { includeMacro:true })`.
- Delete `mastra/run.ts` XAUUSD branching after migrating call sites in `apps/web/src/lib/services/mastra-chat.ts` + `mastra-xauusd.ts` to `mode-runner.ts`.

**Touches:** `mastra/symbol-research.ts`, `mastra/research-packet/*`, `mastra/run.ts`, `apps/web/src/lib/services/*`.

#### 4.3 Single tool registry entrypoint

- Replace side-effect `import './market'` registration with explicit `registerAllTools(toolRegistry)` called once in `mastra-v2/instance.ts:createKestrelMastra` (or `apps/web/src/instrumentation.ts`). Tool files export `registerXxx(registry)` instead of self-registering.

**Touches:** `packages/ai/src/tools/{index.ts, registry.ts, market.ts, analysis.ts, journal.ts, system.ts, web.ts}`, `mastra-v2/instance.ts`.

#### 4.4 `OpinionSchema.details` typed

- Change `details: z.record(z.unknown())` →
  ```ts
  details: z.object({
    keyLevels: z.array(z.object({ price:z.number(), kind:z.enum(['support','resistance','trigger','invalidation']), evidenceId:z.string().optional() })).optional(),
    assumptions: z.array(z.string()).optional(),
    missingEvidence: z.array(z.string()).optional(),
  }).catchall(z.unknown())
  ```
  Backward compat via `.catchall`.

**Touches:** `committee/types.ts`, `specialist-runner.ts`, `prompts.ts`.

#### 4.5 `mastra/run.ts` decomposition

- Extract `followupPacketFromReport`, `resolveXauusdMastraModel` pinned-model logic, `contextForRun` into `mastra-v2/agents/xauusd/context.ts`. Tests for each.

**Touches:** `mastra/run.ts` → `mastra-v2/agents/xauusd/*`.

**Checkpoint 4:** `pnpm typecheck` + `pnpm lint` green; `knip` unused-export count ↓ vs baseline (target -30%); no `import './market'` side effects remain; `docs/architecture.md` matches new layout.

---

### Phase 5 — Advanced / Scale (ongoing)

#### 5.1 Planner agent (lightweight)

- For `domain === 'fundamental'` with complex prompt (“compare XAUUSD vs DXY and calendar risk”), add `planStep` before `collect-packet` that decomposes into `{ subtasks: Array<{symbol, timeframe, kind}> }` and fetches packets in parallel. Use `mastra-v2/workflows/planner.ts` (new) with its own model (**top-tier per Q1**, not fast).

#### 5.2 Cost-aware specialist skipping — REJECTED under strict policy (DECISION: Q3)

- **Not implemented.** Under strict all-or-nothing (Q3), Full never degrades to 3 agents. If macro is unavailable the committee fails closed and the user retries. This section is retained only as a record of the rejected option.

#### 5.3 Evals → CI gate

- Wire `mastra-v2/evals/gate.ts` to nightly GitHub Action: `pnpm --filter @kestrel/ai test:evals` → `createLangfuseClientFromEnv` → `createMastraEvalGate` → fail PR if `citation` or `grounding` score drops >5% vs main.

#### 5.4 Observability

- Add OpenTelemetry spans for each committee step (`collect-packet`, `technical`, …, `fusion`) with `packetId`, `modelId`, `latencyMs`, `tokenCost`. Export to Langfuse + local `mastra` storage.

**Checkpoint 5:** Nightly eval workflow green; committee spans visible in Langfuse; planner used on ≥1 real fundamental prompt without regression.

---

## 11. File Map & Touch List

### New files

| File | Phase | Purpose |
|---|---|---|
| `packages/ai/src/mastra/router.ts` | 1.1 | Unified router |
| `packages/ai/src/budget.ts` | 1.3 | Single budget facade |
| `packages/ai/src/committee/fusion-verifier.ts` | 1.4 | Fusion grounding verifier |
| `packages/ai/src/utils/timeout.ts` | 1.7 | `withTimeout` helper |
| `packages/ai/src/mastra/packet-cache.ts` | 2.1 | Packet + indicator LRU/Redis cache |
| `packages/ai/src/committee/critique.ts` | 3.2 | Cross-critique step — ON by default for `full` (Q6) |
| `packages/ai/src/mastra-v2/workflows/planner.ts` | 5.1 | Planner agent |

### Files to move / delete (Phase 4)

| From | To / Action |
|---|---|
| `mastra/canonical-chat.ts` | `mastra-v2/agents/canonical/index.ts` |
| `mastra/agent.ts` + `mastra/run.ts` | `mastra-v2/agents/xauusd/{agent,run,context}.ts` |
| `mastra/research-packet*.ts` + `mastra/symbol-research.ts` | `mastra-v2/packets/{fetch,assemble,indicators,candles,macro}.ts` |
| `mastra/capabilities.ts` (split) | `mastra-v2/capabilities/{manifest,policy,tools}.ts` |
| `tools/index.ts` (side-effect imports) | `tools/index.ts` (explicit `registerAllTools`) |

### Migrations

| Migration | Phase | Table |
|---|---|---|
| `provider_circuit_state` | 1.6 | `provider_id text PK, consecutive_failures int, opened_at timestamptz, updated_at timestamptz` |
| `full_analysis_queue.model_id_override` (if not exists) | 1.8 | Add `model_id_override text` + `provider_id_override text` to queue table |

---

## 12. Testing, Rollout & Observability

### Test commands (run from repo root)

```bash
# Full suite — must be green before each phase merges
pnpm typecheck            # tsc --noEmit via turbo
pnpm lint                 # eslint + prettier check
pnpm test:ai --run        # vitest run for @kestrel/ai
pnpm test:web --run       # vitest run for @kestrel/web
pnpm build:packages        # shared→indicators→db→data→ai→test-utils
pnpm check:route-security # route access matrix

# New tests per phase (run individually)
pnpm --filter @kestrel/ai exec vitest run src/mastra/router.test.ts
pnpm --filter @kestrel/ai exec vitest run src/committee/fusion-verifier.test.ts
pnpm --filter @kestrel/ai exec vitest run src/mastra-v2/guardrails.test.ts
pnpm --filter @kestrel/ai exec vitest run src/budget.test.ts
```

### Rollout

- Each phase behind a feature flag in `packages/shared/env.ts` (`PHASE1_*`, `PHASE3_*` etc.) with default **off** on `main`, **on** in staging. Canary via `KESTREL_LOCAL_DOCKER=true` locally.
- **Phase 4 is one atomic PR** (Q9). Phase 1 sub-tasks (1.1, 1.2, …) may still land as separate PRs — only Phase 4 is atomic.
- `docs/plans/decisions.log.md` updated per PR with “flag on/off” and rollback procedure.

### Observability to add

- **Metrics (via `metrics.increment` / Prometheus):** `committee_fusion_verification_failed_total`, `packet_cache_hit_total`, `budget_stranded_total`, `guardrail_degraded_total`, `circuit_open_total{provider}`.
- **Langfuse traces:** One trace per chat turn with spans for `router`, `packet`, `specialist:<name>`, `verify`, `fusion`, `telemetry.persist`.
- **Admin surface:** `apps/web/src/app/(app)/admin/_components/admin-mastra-runs.tsx` and `admin-diagnostic-traces.tsx` should expose `CommitteeStepId` progress + fusion verifier findings.

---

## 13. Open Questions — Status (updated 2026-10-10)

> 9 of 9 decided and logged in `docs/plans/decisions.log.md`. Q8 (observational memory) was answered **OFF** by the owner on 2026-10-11 — no open questions remain.

#### Q1 — Model diversity vs cost — ✅ DECIDED (Q1: quality always — all top-tier) [P0 — was blocks 1.1 / 3.1]
**Question:** Should committee specialists use distinct models (e.g. technical/fast, fundamental/balanced) for true diversity, or stay on one BYOK model for cost/predictability?

- **Option A (recommended):** Per-specialist tier (`technical:fast, fundamental:balanced, risk:fast, sentiment:fast`) configurable via `MASTRA_COMMITTEE_MODELS` env + `userSettings`. Cost +15–25% for `full`, diversity improves.
- **Option B:** Single model forever — simplest, cheapest, but correlated failures; committee is prompt-only diversity.
- **Option C:** User picks fusion model, specialists auto-derive cheaper tiers.

**Decision: Q1 — `docs/plans/decisions.log.md` 2026-10-10 — all top-tier (quality over cost). See log for tier mapping. Specialists + fusion use top-tier quality; diversity via prompt and optionally distinct top-tier families, never cheap tiers.**

#### Q2 — Committee default exposure — ✅ DECIDED (Q2: two modes `single` + `full` only) [P0 — was blocks 1.1 copy + landing fix]
**Question:** Should the committee be the *default* for all symbol analysis, or remain gated behind `quick/standard/full`?

- **Today:** `single/auto` + `XAUUSD` → XAUUSD single-agent path; `quick/standard/full` + symbol → committee. Symbol-free → canonical.
- **Propose:** Keep gating, but make UI explicit: badge on composer “Committee: Quick (1 desk) / Standard (2 desks) / Full (4 desks)” + tooltip explaining when each runs. Landing copy qualified (see P3-5).

**Decision: Q2 — `docs/plans/decisions.log.md` 2026-10-10 — two modes `single` + `full`; compat shim `quick→single`, `standard→full` for 1 release.**

#### Q3 — Strict failure policy for Full — ✅ DECIDED (Q3: strict all-or-nothing, no partial) [P0 — was blocks 1.4 / 1.7]
**Question:** Must `full` remain all-or-nothing (`strict:true`), or should it degrade gracefully (return partial with `failedAgents` + banner) like `standard`?

- **Today:** `full.strict=true` → any specialist failure throws `MastraModeStrictFailureError`, user gets no answer.
- **Tradeoff:** Strict is highest fidelity but worst UX (10s wait → error). Partial lets user see 3/4 desks.

**Decision: Q3 — `docs/plans/decisions.log.md` 2026-10-10 — strict all-or-nothing for both `single` and `full`; no partial, `MastraModeStrictFailureError`. Fusion verifier failure also terminal.**

#### Q4 — Budget granularity — ✅ DECIDED (Q4: no daily cap; ledger/alerts only) [P1 — was blocks 1.3]
**Question:** Is the daily budget (`MAX_DAILY_USD`, default 5) per-turn (`DEFAULT_TURN_ESTIMATE_USD 0.01`) vs per-specialist vs per-committee?

- **Today:** Per-turn reservation 0.01; full committee `FULL_ANALYSIS_TURN_ESTIMATE_USD 0.05`. Reconciliation adjusts afterward.
- **Propose:** Keep per-turn for canonical, per-committee for Full (0.05), per-specialist micro-budget inside workflow (optional).

**Decision: Q4 — `docs/plans/decisions.log.md` 2026-10-10 — no daily cap; always record cost, never 429; `MAX_DAILY_USD` kept for admin reporting only.**

#### Q5 — Packet cache semantics — ✅ DECIDED (Q5: auditor chose 30s fresh-only, LRU+Redis) [P1 — was blocks 2.1]
**Question:** How stale may a cached packet be?

- **Option A:** 30s TTL, `fresh` only; `stale`/`degraded` never cached.
- **Option B:** 15s TTL, serve `stale` with warning banner (today's warnings array).
- **Option C:** No cache for `full` (freshness matters), cache only for `quick`/`standard`.

**Decision: Q5 — auditor chose 30s TTL, fresh-only, LRU (10k entries) + Redis if `REDIS_URL` set. Logged 2026-10-10.**

#### Q6 — Cross-critique cost budget — ✅ DECIDED (Q6: ON by default for `full`) [P1 — was blocks 3.2]
**Question:** Is the extra ~4 LLM calls (cross-critique) an acceptable cost for `full` only, or should it be opt-in?

- **Cost:** ~0.02–0.04 USD extra per Full run; latency +2–3s.
- **Decision: Q6 — `docs/plans/decisions.log.md` 2026-10-10 — cross-critique ON by default for `full` (quality over speed); `ENABLE_COMMITTEE_CRITIQUE=true` default.**

#### Q7 — Full-mode `modelOverride` UX — ✅ DECIDED (Q7: serialize to durable queue) [P0 — was blocks 1.8]
**Question:** Should Full serialize the user's model pick to the durable queue (preferred engineering fix), or should the model picker disable overrides when `analysisMode === 'full'` with an explanatory tooltip?

- **Decision: Q7 — `docs/plans/decisions.log.md` 2026-10-10 — serialize `modelOverride` to `full_analysis_queue` (`modelIdOverride`/`providerIdOverride`); worker resolves from row.**

#### Q8 — Observational memory — ✅ DECIDED (OFF — owner confirmed 2026-10-11) [P2 — was blocks 5.x]
**Plain-English explainer:** Background "working memory" that learns your preferences across threads by quietly rewriting a note via extra LLM calls (~$0.008/turn). Today OFF everywhere. It watches your conversations and updates a saved note (e.g. "user prefers risk-first style, default symbol XAUUSD").

**Question:** Should `ENABLE_MASTRA_OBSERVATIONAL_MEMORY` ever be on for `apps/web` (Vercel), or worker/durable-Full only? **Owner: reply `Q8 ON` or `Q8 OFF`.** Until answered, the plan assumes OFF for web, OFF by default for worker (opt-in via env).

- **Today:** Off by default; workers could enable. Cost `OBSERVATIONAL_MEMORY_REFINING_STEP_USD 0.004 × 2` per message is unbounded if left on.
- **Default assumption (pending answer):** Keep OFF for `apps/web`; keep OFF for worker unless you explicitly set `ENABLE_MASTRA_OBSERVATIONAL_MEMORY=true` on the worker env. Confirm `observationalMemoryAllowanceUsd` budgeted in `enqueueFullAnalysis` if enabled (already is — verify amount vs real).

#### Q9 — Migration cadence — ✅ DECIDED (Q9: one PR, atomic) [P2 — was blocks Phase 4]
**Question:** Is a gradual strangler migration (one folder per PR over 2 weeks) acceptable, or do you need the `mastra/` → `mastra-v2/` move in one PR for atomic history?

- **Decision: Q9 — `docs/plans/decisions.log.md` 2026-10-10 — one atomic PR for Phase 4; feature flag `PHASE4_MIGRATED` for revert.**

---

## 14. Definition of Done

This plan is **done** when all of the following are true and verified by the implementing agent:

- [ ] **P0 closed:** Unified router live, guardrail mode from manifest, single budget facade (ledger-only, no daily cap — Q4), fusion verifier + strict repair (failure terminal, no degraded prefix — Q3), persistent circuit breaker, Full modelOverride serialization (Q7). Existing tests green + new tests for each.
- [ ] **P1 closed:** Packet cache 30s fresh-only (Q5) hit rate measured (>40% on burst), 5× packet duplication eliminated (token cost per `full` Full ↓≥30% vs baseline ledger), memory fallback degraded path tested, deadline propagation with **strict failure** (timeout → `MastraModeStrictFailureError`, no partial — Q3), progress streaming for both `single` and `full`.
- [ ] **P3 foundations:** Model diversity — all top-tier, distinct model ids observable in opinions (Q1), cross-critique ON by default for `full` (Q6).
- [ ] **Cleanup:** No `mastra/` vs `mastra-v2/` duality left — **atomic one-PR migration** landed (Q9), shims removed, `budget-*` consolidated to `budget.ts` (ledger-only, no daily cap — Q4), regex single-sourced, `mastra/run.ts` decomposed, `docs/architecture.md` updated, modes collapsed to `single`+`full` with compat shim (`quick→single`, `standard→full`) — Q2.
- [ ] **Observability:** Committee spans + fusion verifier findings + packet cache hit/miss visible in Langfuse + `admin-mastra-runs`; `knip` + `typecheck` + full test suite green in CI.
- [ ] **Decisions logged:** `docs/plans/decisions.log.md` contains answers to Q1–Q9 (Q8 ON/OFF still open — must be filled before Phase 5).
- [ ] **No regressions:** Manual smoke — `single` (canonical, text + image), `full` (queued → claimed → completed + strict-fail on specialist/timeout), `full` cross-critique ON, XAUUSD research, mutation draft→confirm, injection 422, **no budget 429** (Q4 — spend ledgered + admin alert only), all green.

---

## Appendix A — Key File Inventory (for the implementing agent's grep)

```
packages/ai/src/
  committee/{types,workflow,specialist-runner,synthesizer,verifier,prompts}.ts
  mastra/{agent,canonical-chat,capabilities,execution-decision,execution-plan,
         mode-runner,routing-policy,symbol-research,research-packet*.ts,
         report-{generation,grounding,verifier,safety,temporal,repair,evaluation}.ts,
         tools,legacy-tool-adapter,model-context,run}.ts
  mastra-v2/{instance,storage,memory,guardrails,registry,telemetry,context,
            research-context,logger,observability-view,evals/*,
            workflows/{full-analysis,xauusd-report,mutation,full-analysis-retry}}.ts
  routing{,.ts,keywords.ts}, semantic-routing.ts, byok-providers.ts, model*.ts,
  cost.ts, budget-guard.ts, budget-reservation.ts, retry.ts, fallback.ts,
  model-circuit-breaker.ts, llm-throttle.ts, tools/{index,registry,by-domain,market,analysis,journal,system,web}/*.ts
apps/web/src/
  app/api/chat/route.ts
  lib/services/mastra-{execution,chat-routing,chat,chat-response,chat-stream,
                       canonical-chat,canonical-chat-stream,mode,mode-response,
                       xauusd,execution,mustra-stream-response,mutation-draft,
                       report-context,thread-title,chat-service-lifecycle}.ts
  lib/{chat-transport,commands,mastra-chat-meta,logger,env}.ts
  components/chat/{chat-screen,composer,message-list,chat-top-bar}.tsx
  components/chat/parts/{agent-deliberation,convene-committee,mastra-report*,
                         get-*,fallback,compute-risk,mutation-confirmation}.tsx
packages/shared/src/
  env.ts, schemas/*, logger.ts, metrics.ts
packages/db/src/
  schema.ts, client.ts, drizzle/* (threads, messages, chat_telemetry, full_analysis_queue, daily_ai_spend)
```

## Appendix B — Audit Limitations

- `packages/data` adapter failover + caching (stale-while-revalidate) was spot-checked, not line-audited.
- `packages/db` RLS and `withTenantDb` helpers were spot-checked.
- E2E Playwright suites under `apps/web/tests/` + `loadtest/` were listed, not executed.
- Cost rate table (`byok-providers.ts` / `cost.ts:STATIC_RATES`) freshness vs live provider pricing (Q1 2026) was not independently verified.
- The implementing agent should re-verify the inventory in Appendix A against the actual tree at implementation time (`rg "class Mastra|createWorkflow|new Agent" packages/ai/src`).

## Appendix C — Decision Log

> The live log is `docs/plans/decisions.log.md` (8 of 9 decided on 2026-10-10; only Q8 observational memory is open). The snippet below was the pre-decision template and is kept for reference:

```md
# docs/plans/decisions.log.md (template — now populated)

## 2026-10-10 — Q1 Model diversity — Decider: <name> — Decision: A (per-specialist tier)
Rationale: ...

... Q3..Q9
```

---

*End of plan. Implementing agent: start with §10 Phase 0, then Phase 1 task 1.1. Do not skip verification checkpoints.*
