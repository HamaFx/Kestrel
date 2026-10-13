# Kestrel AI & Agentic Systems — End-to-End Audit v3 & Master Upgrade Plan

**Target Repository:** `HamaFx/Kestrel`  
**Audited Commit:** `f20072b9a60ca7174c8c8e0aa03175ad96028094` (post-Audit v2 implementation)  
**Target Audience:** Autonomous AI Coding Agent & Repository Owner (Hama)  
**Scope:** End-to-end architecture audit of Kestrel's AI, multi-agent committee, Mastra v2 runtime, specialist skills/tools, data ingestion packets, streaming transport, UI rendering, persistence, cost/budget ledger, background workers, Telegram bot, and evaluation harness — followed by a self-contained, file-by-file implementation plan with all owner decisions locked in.

## Table of Contents

1. Executive Verdict: Is Kestrel Truly a Multi-Agent System?
2. Audit v2 Implementation Scorecard: What Was Fixed vs. What Broke
3. End-to-End System Trace: User Input to Final Render
4. Deep-Dive Findings by Subsystem (P0–P3)
5. Locked Owner Decisions (Q1–Q12) & `decisions.log.md` Update
6. Master Implementation Plan for Coding Agent (Phases 1–8)
7. Verification, Golden Evals & Regression Test Suite

## 1. Executive Verdict: Is Kestrel Truly a Multi-Agent System?

### Overall Multi-Agent Maturity Score: **5.5 / 10** (Target After This Plan: **9.5 / 10**)

Kestrel has evolved from a collection of single-shot `generateText` prompts into a structured **Mastra v2** runtime with a real multi-step committee DAG (`packages/ai/src/committee/workflow.ts`). However, in commit `f20072b9`, **only one of Kestrel's five execution modes (`symbol-research` in `full` mode) is genuinely multi-agent**, and even that workflow currently operates as a **blind, tool-less, fixed-packet pipeline** (`toolChoice: 'none'`) where every agent gets the exact same static text and has zero domain tools of its own.

| Subsystem / Entry Point | Claimed Behavior | Actual Runtime Behavior in `f20072b9` | Target State After Plan |
| :--- | :--- | :--- | :--- |
| **`symbol-research` (`full` mode)** (`packages/ai/src/committee/workflow.ts`) | 4-desk specialist committee (`technical`, `fundamental`, `risk`, `sentiment`) + peer cross-critique + debate + verifier + synthesizer | 4 Mastra agents run in `.parallel()`, followed by cross-critique (`critique.ts`), deterministic verifier (`verifier.ts`), and fusion (`synthesizer.ts`). **However, all 4 desks have `toolChoice: 'none'`, no specialized tools, and receive the exact same static string packet.** | **True Multi-Agent Council:** Each of the 4 desks has its own **Skill Playbook, Goal, and Dedicated Domain Toolset** (`maxSteps: 3`), enriched baseline packet, dynamic tool-evidence verification, cross-critique, and default structured fusion. |
| **`symbol-research` (`single` mode)** (`packages/ai/src/committee/workflow.ts`) | Fast single-specialist technical pass | Runs 1 specialist (`technical`) with `toolChoice: 'none'` on the pre-built `SymbolResearchPacket`, skips critique/debate, verifies numbers, and returns the raw reasoning string. | **Quick Check (1 Expert):** Runs the Technical Specialist with its dedicated technical skill playbook & tools (`get_market_structure`, `get_session_levels`, `analyze_technical`), verified against packet + tool evidence. |
| **`canonical-chat` (Default Web Chat)** (`packages/ai/src/mastra-v2/agents/canonical/index.ts`) | Domain-routed conversational AI copilot with 26 read-only tools and memory | Single Mastra `Agent` (`kestrel-canonical-chat`) with `maxSteps: 5`, domain routing, pgvector memory recall, and post-stream causal evidence checking. **Tool calls are never streamed to the UI or persisted to `chat_messages.parts`.** | **Full Generative UI & Committee Tool:** Streams live `tool-*` cards, persists all tool parts, supports silent self-correction retry on unverified numbers, and can call `convene_committee` inline. |
| **`xauusd-chat` & `xauusd-report`** (`packages/ai/src/mastra-v2/agents/xauusd/run.ts`, `workflows/xauusd-report.ts`) | Institutional Gold Intelligence Engine | Single Mastra `Agent` (`kestrel-xauusd-intelligence`) consuming a pre-fetched `XauusdResearchPacket` with `maxSteps: 4`. Drops tool call parts in chat stream. | **Live Tool Cards + Grounded Gold Intelligence:** Emits and persists `tool-*` parts and post-stream metadata over SSE. |
| **Telegram Bot (`/committee`, `/analyze`, `/ask`)** (`packages/ai/src/bot/commands/*.ts`, `bot/mastra.ts`) | Multi-agent committee & live market analysis in Telegram | All three commands call `tryMastraBotMessage` -> `runMastraBackgroundText` with **`toolChoice: 'none'` and zero market data packets**. A single blind LLM pretends to coordinate a committee summary. | **Real Multi-Agent & User-Choosable Mode in Plain English:** Users can choose **Quick Check (1 Expert)** or **Full Team (4 Experts)** via command or inline buttons, written in simple, jargon-free trader language. |
| **In-Chat `convene_committee` Tool** (`packages/ai/src/tools/system.ts`, `convene-committee.tsx`) | On-demand committee deliberation card inside canonical chat | Registered in `allTools` with a React UI card (`ConveneCommitteePart`), **but excluded from `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES`** (`capabilities/index.ts:124`). Unreachable. | **Enabled & Wired to `runCommitteeWorkflow`:** Regular chat can summon the 4-expert team on demand and render `ConveneCommitteePart`. |
| **Briefings, Weekly Journal Review, Coach Insights, Alerts** (`briefings/generate.ts`, `journal/review.ts`, `coach-insights.ts`, `alerts/evaluator.ts`) | Autonomous research & coaching agents | Single-shot `runMastraText` / `runMastraStructured` calls (`toolChoice: 'none'`) over pre-assembled SQL/context payloads. | **Aligned with Q4 Budget & Structured Output:** Uses `acquireBudget` (observability-only by default), `runMastraStructured`, and full run telemetry. |

### Why the Committee Workflow Needs True Agent Specialization

1. **Specialists Currently Have No Specialized Tools or Skills (`specialist-runner.ts:104`, `prompts.ts:19-66`):**
   Every specialist is currently invoked with `toolChoice: 'none'` and a 4-sentence generic prompt (`prompts.ts:19-57`). Furthermore, for **any symbol other than `XAUUSD`** (`EURUSD`, `GBPUSD`, `USDJPY`, `BTCUSD`), `fetchLiveInputs` (`symbol-research.ts:365-374`) **only fetches price, 50 candles, and 5 basic technical indicators (`EMA_20`, `EMA_50`, `RSI_14`, `MACD`, `ATR_14`)**. It fetches **zero news headlines, zero economic calendar events, zero intermarket correlations, zero COT positioning, and zero social sentiment**. Because `toolChoice: 'none'` blocks tool calls, the Fundamental and Sentiment agents on `EURUSD` or `BTCUSD` literally have zero fundamental or sentiment data and cannot do their jobs.
2. **Even on `XAUUSD`, the Sentiment & Fundamental Desks Receive Truncated Metadata (`symbol-research.ts:327`):**
   `xauusdExtension` passes `newsCount: xauPacket.news.items.length` — a count of articles without a single headline, summary, or sentiment score — and never fetches COT positioning (`get_cot`) or social sentiment (`get_social_sentiment`).
3. **Parallel Progress Is Faked as Sequential (`shared/progress.ts:24-48`):**
   All 4 desks execute inside `.parallel()` (`workflow.ts:527`) and fire `onProgress(name)` within milliseconds of each other (`workflow.ts:261`). Because `committeeProgressSnapshot(mode, step)` computes status via `index < current ? 'done' : index === current ? 'running' : 'pending'`, as soon as `sentiment` (index 3) starts ~5ms after `technical` (index 0), the UI immediately marks `technical`, `fundamental`, and `risk` as `'done'` while all four are still waiting on LLM responses.

## 2. Audit v2 Implementation Scorecard: What Was Fixed vs. What Broke

Commit `f20072b9` implemented several items from `docs/plans/kestrel-ai-agentic-audit-v2.md`, but left key items unfinished and introduced **critical P0/P1 regressions**:

| Audit v2 Item | Status in `f20072b9` | Verification Notes |
| :--- | :--- | :--- |
| **Retire `quick`/`standard`/`auto` -> `single`/`full` (Q2)** | **Done** | Enforced across `routing-policy.ts`, `types.ts`, and `chat-stream.ts` (with legacy coercion shims). |
| **Strict failure everywhere (`strict: true`) (Q3)** | **Done** | `runCommitteeWorkflow` and `mode-runner.ts` enforce `strict: true` and throw on any desk or verifier failure. |
| **Observability-only budget caps by default (Q4)** | **Partial** | Fixed in `budget.ts:81` (`effectiveDailyCap`), **but bypassed in `journal/review.ts:118` and `journal/coach-insights.ts:154`**, which call `tryReserveBudget` directly with hard `maxDailyUsd` and still throw budget errors when `ENFORCE_BUDGET` is off. |
| **30s fresh-only packet cache + Redis mirror (Q5)** | **Done** | Implemented in `packet-cache.ts` (`PACKET_CACHE_TTL_MS = 30_000`, skips degraded/blocked packets). |
| **Cross-critique round in `full` mode (Q6)** | **Done** | Implemented in `committee/critique.ts` and wired into `workflow.ts:449-473`. |
| **Persist `modelSnapshot` on durable full-analysis job (Q7)** | **Done** | Stored on `full_analysis_runs.model_snapshot` and restored in `multi-agent-analysis.ts:151-191`. |
| **Causal evidence gate in canonical chat** | **Broken UX (P0-2)** | `checkCanonicalEvidence` runs **after** all unverified tokens have already streamed to the browser, then `mastra-canonical-chat-stream.ts:171` yields `CANONICAL_EVIDENCE_BLOCKED_MESSAGE`, **concatenating** the refusal onto the hallucinated answer in the live UI. |
| **Tool calls & 33 generative UI cards in chat** | **Broken (P0-1)** | `runMastraCanonicalChatStream` and `runXauusdMastraConversationStream` only consume `output.textStream`. Tool calls/results (`tool-<name>`) are **never emitted over SSE** and **never persisted to `chat_messages.parts`**. All 33 UI tool cards in `registry.tsx`, `/api/chat/threads/[id]/summary`, and tool-trace evals in `eval/runner.ts` are broken. |
| **Committee `AgentDeliberation` Verdict & Breakdown UI** | **Broken (P0-4)** | `committeeProgressSnapshot` (`shared/progress.ts:24-48`) never attaches `opinion` to `agents[]`. In `agent-deliberation.tsx:125`, `agents.filter(a => a.opinion)` is always empty (`0% confidence`, `0 Bull / 0 Bear`, and specialist breakdowns never render). Also `chat-screen.tsx:206` wipes `agentProgress` when `analysisMode === 'single'`. |
| **Unified routing without duplicate work** | **Broken (P0-3)** | `/api/chat` runs `routeUnified` -> `decideMastraExecution` -> `routeTurn`, and then `setupCanonicalChat` (`agents/canonical/index.ts:209`) **ignores `executionPlan.routingDecision` and calls `routeTurn` and `resolveCanonicalModel` a second time** — triggering up to 4 LLM calls per turn. |
| **Fix `pruneMastraStorage` Postgres pool leak (v2 P2-6)** | **Unfixed (P1-6)** | `storage.ts:246` still calls `createMastraStorage(process.env)` (allocating a new `pg.Pool` of 5 connections on every prune cron) and never closes it. |

## 3. End-to-End System Trace: User Input to Final Render

### 3.1 Request Ingress & Routing (`apps/web/src/app/api/chat/route.ts`)
1. **Authentication & Validation:** `POST /api/chat` authenticates the user, parses `ChatRequestSchema` (`messages`, `threadId`, `symbol`, `timeframe`, `analysisMode`, `modelOverride`, `tz`, `locale`), verifies CSRF/origin, and enforces per-user sliding-window rate limits (`checkChatTurnRateLimit`).
2. **Thread & User Message Persistence:** Ensures the thread exists (`createThread` or `getThread`) and persists the incoming user message idempotently via `appendUserMessage` (with Redis outbox fallback `persistence-outbox.ts` on DB failure).
3. **Unified Routing (`routeUnified` -> `decideMastraExecution`):**
   - Checks for explicit mutation proposal (`mutation-proposal`).
   - Checks for explicit report intent (`xauusd-report`).
   - Checks for symbol research mode (`symbol-research` when `explicitModeRequested` or committee intent).
   - Checks for `XAUUSD` conversational mode (`xauusd-chat`).
   - Otherwise routes to `canonical-chat`, invoking `routeTurn(lastUserText, { semanticRouting: true })` (`packages/ai/src/routing.ts`).

### 3.2 Execution & Data Fetching Across Modes
- **Mode 1: `canonical-chat` (`mastra-canonical-chat-stream.ts` -> `agents/canonical/index.ts`):**
  - Calls `setupCanonicalChat`, which **re-runs `routeTurn` and `resolveCanonicalModel`** (Bug P0-3).
  - Runs `assertPromptSafe` (both regex `UnicodeNormalizer` + LLM `PromptInjectionDetector` on `gpt-5.4-mini`).
  - Recalls thread history (`loadPriorMessages`) + semantic memory (`recallCanonicalMemory` via pgvector `searchMemories`) + working memory profile (`loadWorkingMemoryBlock`).
  - Filters tools via `domainToolFilter(domain, plan, capabilities)` and streams from `agent.stream(...)`.
  - Consumes only `output.textStream` (dropping tool call/result chunks — Bug P0-1), then runs `checkCanonicalEvidence` after completion (Bug P0-2).
- **Mode 2: `xauusd-chat` (`mastra-chat-stream.ts` -> `agents/xauusd/run.ts`):**
  - Builds `XauusdResearchPacket` (`buildXauusdResearchPacket` with 30s LRU + Redis cache) fetching quote, candles, 6 indicators, news, economic calendar, and 4 FRED series (`DGS10`, `DFII10`, `DTWEXBGS`, `FEDFUNDS`).
  - Streams from `kestrel-xauusd-intelligence` (again consuming only `output.textStream` and dropping tool parts).
- **Mode 3: `xauusd-report` (`mastra-report.ts` -> `workflows/xauusd-report.ts`):**
  - Builds `XauusdResearchPacket`, generates structured `MastraReportSchema` via `runMastraStructured`, verifies every numeric claim (`verifyXauusdReport`), and emits `text` + `data-mastra-report` UI parts.
- **Mode 4: `symbol-research` (`mastra-mode.ts` -> `planning/mode-runner.ts` -> `committee/workflow.ts`):**
  - **`single` mode (inline SSE):** Builds `SymbolResearchPacket`, runs the `technical` specialist, verifies numbers (`verifyMastraOpinion`), emits `data-agent-progress` + `text` + `data-mastra-report` + `data-multi-agent-meta`.
  - **`full` mode (durable BullMQ worker):** Inserts a `full_analysis_runs` row (with `modelSnapshot`), enqueues `multi-agent-analysis` on BullMQ, and streams `data-agent-progress` + `data-plan` updates over SSE by polling Postgres/Redis until the worker completes the 4-desk committee workflow (`collect-packet` -> `.parallel([technical, fundamental, risk, sentiment])` -> `critique` -> optional `debate` -> `verify` -> `fusion` -> `verifyFusionAnswer`).
- **Mode 5: `mutation` (`mastra-mutation.ts` -> `workflows/mutation.ts`):**
  - Creates a Mastra workflow (`mutation-set_alert`, `mutation-log_journal`, `mutation-share_snapshot`, `mutation-run_system_action`) that suspends with an HMAC-SHA256 `confirmationToken` and streams a `data-mutation-approval` part. Resumed atomically via `POST /api/chat/mutations/confirm`.

### 3.3 Client Transport & UI Rendering (`apps/web/src/lib/chat-transport.ts`, `components/chat/**`)
- `createResilientChatTransport` parses SSE `data:` frames through `ChatStreamEventSchema`.
- Any SSE chunk whose `type` is not in `ChatStreamEventSchema` is **silently dropped** (`chat-transport.ts:176-180`).
- `ChatScreen` (`chat-screen.tsx`) manages `agentProgress` state and passes it to `MessageList` (which renders inline `AgentDeliberation` on the streaming assistant message) and `ThreadViewsDock` (which renders `AgentDeliberation`, `PlanPart`, `TradingViewWidget`, and telemetry).
- `MessageItem` (`message.tsx`) iterates `message.parts`, grouping `tool-*` parts into `ActivityRollup` + `renderToolPart` (`registry.tsx`), rendering `data-mastra-report` via `MastraReportPart`, `data-mutation-approval` via `MutationApprovalCard`, and text via `StreamingMarkdown`.

## 4. Deep-Dive Findings by Subsystem (P0–P3)

### P0 — Critical Bugs & Broken User-Facing Features

#### P0-1: Generative Tool UI Cards, Thread Summaries & Eval Tool Traces Are Completely Broken
- **Where:**
  - `packages/ai/src/mastra-v2/agents/canonical/index.ts:518-561` (`runMastraCanonicalChatStream`)
  - `packages/ai/src/mastra-v2/agents/xauusd/run.ts:624-650` (`runXauusdMastraConversationStream`)
  - `apps/web/src/lib/services/mastra-canonical-chat-stream.ts:138-247`
  - `apps/web/src/lib/services/mastra-chat-stream.ts:95-156`
  - `apps/web/src/lib/services/mastra-stream-response.ts:39-103`
  - `packages/shared/src/schemas/chat-stream.ts:66-79` (`ChatStreamEventSchema`)
  - `apps/web/src/lib/chat-transport.ts:175-182` (`transformSseToDataStream`)
- **What is broken:**
  1. `runMastraCanonicalChatStream` and `runXauusdMastraConversationStream` only iterate `for await (const chunk of output.textStream)` and return `text: AsyncIterable<string>`. Tool call inputs (`tool-input-available`) and tool outputs (`tool-output-available`) from `output.fullStream` / `steps` are never emitted as SSE chunks.
  2. Even if emitted, `ChatStreamEventSchema` (`packages/shared/src/schemas/chat-stream.ts:66-79`) only permits `start`, `text-start`, `text-delta`, `text-end`, `finish`, `error`, and `data-*` — so `transformSseToDataStream` (`chat-transport.ts:176`) drops any AI SDK v5 `tool-input-*` / `tool-output-*` chunk!
  3. When persisting the assistant message to `chat_messages` (`mastra-canonical-chat-stream.ts:186-218` and `mastra-chat-stream.ts:127-134`), `parts` is hardcoded to `[{ type: 'text', text: completed.text }, { type: 'data-multi-agent-meta', ... }]`. Tool invocations (`{ type: 'tool-<name>', toolCallId, state: 'output-available', input, output }`) are **never saved to Postgres**.
  4. **Downstream casualties:**
     - All **33 custom React tool cards** in `apps/web/src/components/chat/parts/registry.tsx` (`GetPricePart`, `GetCandlesPart`, `AnalyzeTechnicalPart`, `ComputeRiskPart`, etc.) and `ActivityRollup` (`message.tsx:375`) never render in live chat or after reload.
     - `GET /api/chat/threads/[id]/summary` (`apps/web/src/app/api/chat/threads/[id]/summary/route.ts:51`) looks for `part.type === 'tool-summarize_thread'` in `chat_messages.parts` and **always returns 404**.
     - `packages/ai/src/eval/runner.ts` (`parse-stream.ts:227-255`) extracts `toolCalls` from `tool-*` parts on the streamed `UIMessage`. Because none are emitted, `result.toolCalls` is always `[]` and every tool-trace/grounding assertion in `cases.json` fails.
     - Live `data-multi-agent-meta` (with actual `modelId`, `observedCost`, `toolNames`, `evidence`) and `data-memory-degraded` are constructed *after* `stream.completion` inside `mastra-canonical-chat-stream.ts:144-215`, so they are written to the DB but **never sent over SSE to the live client**.

#### P0-2: Canonical Evidence Gate Streams Hallucinated Numbers First, Then Appends Refusal Text
- **Where:** `apps/web/src/lib/services/mastra-canonical-chat-stream.ts:138-183` & `packages/ai/src/mastra-v2/agents/canonical/index.ts:520-559`
- **What is broken:**
  - `for await (const chunk of output.textStream) { text += chunk; yield chunk; }` streams every token straight to the browser.
  - Only after the entire response finishes streaming does `complete()` call `checkCanonicalEvidence` and throw `CanonicalEvidenceBlockedError`.
  - In `mastra-canonical-chat-stream.ts:171`, the `catch` block executes `yield CANONICAL_EVIDENCE_BLOCKED_MESSAGE;` — which sends another `text-delta` event, **concatenating** `"I could not verify the numbers in that answer..."` onto the end of the already-streamed unverified response in the user's browser!
- **How to fix (Locked Decision Q10):**
  - Run **one automatic silent self-correction pass** when `checkCanonicalEvidence` detects ungrounded numbers (passing the ungrounded figures back to the agent so it can either call the relevant market tool or rewrite the sentence using only numbers from the verified evidence ledger).
  - If the self-correction pass still fails verification, emit a `data-evidence-blocked` control part so the client UI cleanly **replaces** the unverified text with `CANONICAL_EVIDENCE_BLOCKED_MESSAGE` instead of concatenating them.

#### P0-3: Double Turn Routing, Up to 4 LLM Calls Per Canonical Turn & Broken BYOK Semantic Routing
- **Where:**
  - `apps/web/src/lib/services/mastra-router.ts:68-86` (`routeUnified`)
  - `packages/ai/src/mastra-v2/planning/execution-decision.ts:68` (`decideMastraExecution`)
  - `packages/ai/src/mastra-v2/agents/canonical/index.ts:209-243` (`setupCanonicalChat`)
  - `packages/ai/src/semantic-routing.ts:116-143` (`classifyTurnLLM`)
  - `packages/ai/src/mastra-v2/shared/text-runner.ts:130-169` (`runMastraStructured`)
- **What is broken:**
  1. `routeUnified` calls `decideMastraExecution`, which calls `await routeTurn(lastUserText, { semanticRouting: true })` and attaches the result to `executionPlan.routingDecision`.
  2. Next, `runMastraCanonicalChatStream` calls `setupCanonicalChat` (`agents/canonical/index.ts:209`), which **completely ignores `args.executionPlan.routingDecision`** and calls `await routeTurn(...)` and `await resolveCanonicalModel(...)` **a second time**!
  3. Inside `routeTurn`, when keyword confidence is `< 0.7`, `classifyTurnLLM` (`semantic-routing.ts:128`) calls `resolveModel(modelId, env)` (`env-model-factory.ts`), which **only checks operator `AI_GATEWAY_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` and ignores the user's encrypted BYOK keys**!
  4. When operator keys *are* configured, `classifyTurnLLM` calls `runMastraStructured` (`text-runner.ts:130`), which attaches `createMastraInputProcessors` -> `PromptInjectionDetector` (LLM call #1) before running the semantic router LLM call with `maxOutputTokens: 30` (LLM call #2 — where 30 tokens is too small to close `{ "domain": "...", "confidence": 0.85, "rationale": "..." }`, causing schema parse failures!).

#### P0-4: `AgentDeliberation` Verdict & Specialist Breakdowns Never Render (`opinions` Always Missing from Progress Snapshots)
- **Where:**
  - `packages/ai/src/mastra-v2/shared/progress.ts:24-48` (`committeeProgressSnapshot`)
  - `packages/ai/src/committee/workflow.ts:260-296, 449-535`
  - `apps/web/src/components/chat/parts/agent-deliberation.tsx:125-137, 211-265`
  - `apps/web/src/components/chat/chat-screen.tsx:206-210, 477`
  - `apps/web/src/lib/services/mastra-full-analysis-stream.ts:89-165`
- **What is broken:**
  1. `AgentDeliberation` (`agent-deliberation.tsx`) reads `agent.opinion` (`{ bias, confidence, summary }`) from `agents: AgentProgressEntry[]` to render Desk Confidence, Bull/Bear/Neutral distribution, and "View Specialist Breakdowns".
  2. However, `CommitteeAgentProgress` in `shared/progress.ts:12-15` only has `{ agentName, status }` — it **never includes `opinion`**! As a result, `opinions` in `agent-deliberation.tsx:125` is **always `[]`**, Desk Confidence is always `0%`, and "View Specialist Breakdowns" is permanently hidden.
  3. In addition, `chat-screen.tsx:206-210` and `477` wipe and block `agentProgress` when `analysisMode === 'single'`.

### P1 — High-Priority Multi-Agent Specialization, Data Starvation & Reliability Gaps

#### P1-1: Specialists Lack Dedicated Skills, Goals, and Domain Toolsets; Non-XAUUSD Packets Are Data-Starved
- **Where:**
  - `packages/ai/src/committee/specialists.ts`
  - `packages/ai/src/committee/specialist-runner.ts:95-120`
  - `packages/ai/src/committee/prompts.ts:19-100`
  - `packages/ai/src/mastra-v2/packets/symbol-research.ts:288-383`
- **What is broken:**
  - All 4 specialists currently run with `toolChoice: 'none'`, no registered tools, and a short 4-sentence generic prompt.
  - On non-XAUUSD symbols (`EURUSD`, `GBPUSD`, `USDJPY`, `BTCUSD`), `SymbolResearchPacket` only fetches price, 50 candles, and 5 indicators (`EMA_20`, `EMA_50`, `RSI_14`, `MACD`, `ATR_14`), leaving `fundamental` and `sentiment` with zero domain data.
- **How to fix (Locked Decision Q8):**
  - Give each of the 4 specialist desks (`technical`, `fundamental`, `risk`, `sentiment`) its own **Skill Playbook, Specific Goal, and Dedicated Domain Toolset (`SPECIALIST_DESK_TOOLS`)** with `maxSteps: 3`, enrich `SymbolResearchPacket` across all symbols, and automatically merge all numbers returned by any specialist's tool calls into the run's verified evidence ledger (`AllowedEvidenceSet`).

#### P1-2: Parallel Specialist Progress Collapses Into Fake Sequential Steps & Misses `'debate'`
- **Where:**
  - `packages/ai/src/committee/types.ts:68-72` (`committeeProgressStages`)
  - `packages/ai/src/mastra-v2/shared/progress.ts:24-48` (`committeeProgressSnapshot`)
  - `packages/ai/src/committee/workflow.ts:255-296, 449-535`
- **How to fix:**
  - Track stateful per-agent progress (`Map<CommitteeAgentName, CommitteeAgentProgress>`) inside `runCommitteeWorkflow`, mark all 4 desks `'running'` when `.parallel()` starts, and mark each desk `'done'` with its `opinion` as soon as that desk finishes. Include `'debate'` in `committeeProgressStages`.

#### P1-3: Telegram Bot `/committee`, `/analyze`, and `/ask` Are Blind Single-LLM Calls With Technical Jargon & No Mode Choice
- **Where:**
  - `packages/ai/src/bot/commands/{committee,analyze,ask}.ts`
  - `packages/ai/src/bot/mastra.ts:45-95` (`tryMastraBotMessage`)
  - `packages/ai/src/bot/dispatcher.ts`
- **How to fix (Locked Decision Q9):**
  - Replace the blind `runMastraBackgroundText` wrapper with real Mastra committee/analysis execution backed by live `SymbolResearchPacket` + specialist tools.
  - Let users choose between **Quick Check (1 Expert)** (`single`) and **Full Team (4 Experts)** (`full`) via command argument (`/analyze XAUUSD 1h quick` or `/analyze XAUUSD 1h full`) or via interactive Telegram inline buttons (`[⚡ Quick Check (1 Expert)]` `[🧠 Full Team (4 Experts)]`).
  - Format all Telegram responses in **simple, everyday language for non-technical traders** (clear **Bottom Line**, **Direction & Confidence**, **Key Price Levels**, **Why / Main Drivers**, and **What Could Go Wrong**, with zero internal jargon like `"Mastra"`, `"packetId"`, or `"canonical"`).

#### P1-4: `domainToolFilter` Returns `{}` (Zero Tools) When `user.plan` Is Null or Non-Standard
- **Where:** `packages/ai/src/tools/registry.ts:115-123` & `packages/ai/src/tools/by-domain.ts:51-69`
- **How to fix:** Default missing/null/unrecognized `plan` to `'free'` so read-only tools are never zeroed out.

#### P1-5: Grounding Verifier Blind Spots (`rawData.keyLevels` Unverified & Hardcoded `runId: 'unknown'`)
- **Where:** `packages/ai/src/committee/verifier.ts:44-89` & `packages/ai/src/committee/workflow.ts:487`
- **How to fix:** Verify `opinion.rawData.keyLevels[].price` against the combined packet + specialist-tool evidence ledger in `verifyMastraOpinion`, and read `runId` from `requestContext.get('runId')` in `verifyStep`.

#### P1-6: `pruneMastraStorage` Still Leaks a Postgres Connection Pool on Every Invocation
- **Where:** `packages/ai/src/mastra-v2/storage.ts:242-259`
- **How to fix:** Reuse a module-level singleton `PostgresStore` in `storage.ts` instead of creating a new 5-connection `pg.Pool` on every prune cron run.

#### P1-7: `journal/review.ts` & `journal/coach-insights.ts` Violate Owner Decision Q4 & Bypass Run Telemetry
- **Where:** `packages/ai/src/journal/review.ts:118-167` & `packages/ai/src/journal/coach-insights.ts:154-205`
- **How to fix:** Use `acquireBudget` (which respects `ENFORCE_BUDGET` off by default), wrap runs in `beginMastraRun` / `finishMastraRun`, and convert `coach-insights.ts` to `runMastraStructured`.

## 5. Locked Owner Decisions (Q1–Q12) & `decisions.log.md` Update

All architectural questions have been answered by the repository owner (Hama) and are locked for implementation.

### Step 0: Append Q8–Q12 to `docs/plans/decisions.log.md`
The implementing coding agent must append the following block to `docs/plans/decisions.log.md`:

```markdown
## 2026-10-14 — Audit v3 Owner Decisions (Hama)

- **Q8 (Specialist Agent Skills, Goals & Dedicated Tools):** Each of the 4 committee specialist agents (`technical`, `fundamental`, `risk`, `sentiment`) MUST have its own dedicated Skill Playbook, specific analytical goal, and domain-specific read-only toolset (`maxSteps: 3`) in addition to an enriched baseline `SymbolResearchPacket` for all symbols. Any numbers returned by a specialist's tool calls must be dynamically merged into the run's verified evidence ledger (`AllowedEvidenceSet`) so `verifyMastraOpinion` and `verifyFusionAnswer` remain 100% strict (`strict: true`) without false-positive blocks.
- **Q9 (Simple Non-Technical Language & Choosable Mode in Telegram/UI):** Use simple, plain-English trader language across Telegram and UI surfaces (no internal jargon like "Mastra committee", "canonical", or "packetId"). Users in Telegram must be able to choose between **Quick Check (1 Expert)** (`single`) and **Full Team Analysis (4 Experts)** (`full`) via command flags (`/analyze XAUUSD 1h quick|full`) or interactive Telegram inline buttons.
- **Q10 (Canonical Evidence Gate Self-Correction + Clean UI Replacement):** On ungrounded numbers in canonical chat, automatically run **1 silent self-correction pass** (instructing the agent to either call the appropriate market tool or rewrite using only verified numbers from the turn's evidence ledger). Only if the retry still fails verification, emit `data-evidence-blocked` so the live UI cleanly replaces the unverified text instead of concatenating the refusal message.
- **Q11 (Enable In-Chat `convene_committee` Tool):** Enable `convene_committee` in `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` and wire `conveneCommitteeTool` (`packages/ai/src/tools/system.ts`) to `runCommitteeWorkflow` so regular chat can summon the 4-expert team on demand and render `ConveneCommitteePart`.
- **Q12 (Enable Structured Fusion by Default):** Enable `PHASE3_STRUCTURED_FUSION` by default (`process.env.PHASE3_STRUCTURED_FUSION !== 'false'`) in `full` mode so every Full Team Analysis produces a verified, plain-English Bottom Line, Main Thesis, Bull/Base/Bear Scenario Table, Key Risks, and Invalidation Level.
```

## 6. Master Implementation Plan for Coding Agent (Phases 1–8)

> **Instructions for Implementing Agent:**  
> Execute Phases 1–8 in order. Respect all owner decisions in `docs/plans/decisions.log.md` (`Q1`–`Q12`). Run `pnpm --filter @kestrel/shared test`, `pnpm --filter @kestrel/ai test`, `pnpm --filter @kestrel/web test`, and `pnpm typecheck` after each phase.

### Phase 1: Restore End-to-End Tool Streaming, Generative UI Cards & Live Stream Metadata (Fixes P0-1, P2-1)

#### Step 1.1: Extend `ChatStreamEventSchema` & `transformSseToDataStream` to Pass AI SDK v5 Tool Events and Evidence-Blocked Replacement Events
- **Files:**
  - `packages/shared/src/schemas/chat-stream.ts`
  - `apps/web/src/lib/chat-transport.ts`
- **Action:**
  1. In `packages/shared/src/schemas/chat-stream.ts:66-79`, add AI SDK v5 tool stream chunk schemas and `DataEvidenceBlockedChunkSchema` to `ChatStreamEventSchema`:
     ```ts
     export const ToolInputStartChunkSchema = z.object({
       type: z.literal('tool-input-start'),
       toolCallId: z.string(),
       toolName: z.string(),
     });

     export const ToolInputDeltaChunkSchema = z.object({
       type: z.literal('tool-input-delta'),
       toolCallId: z.string(),
       inputTextDelta: z.string(),
     });

     export const ToolInputAvailableChunkSchema = z.object({
       type: z.literal('tool-input-available'),
       toolCallId: z.string(),
       toolName: z.string(),
       input: z.unknown(),
     });

     export const ToolOutputAvailableChunkSchema = z.object({
       type: z.literal('tool-output-available'),
       toolCallId: z.string(),
       output: z.unknown(),
     });

     export const ToolOutputErrorChunkSchema = z.object({
       type: z.literal('tool-output-error'),
       toolCallId: z.string(),
       errorText: z.string(),
     });

     export const DataEvidenceBlockedChunkSchema = z.object({
       type: z.literal('data-evidence-blocked'),
       data: z.object({
         message: z.string(),
       }),
     });
     ```
     Include all six in `ChatStreamEventSchema`.
  2. In `apps/web/src/lib/chat-transport.ts`, ensure `transformSseToDataStream` forwards these chunks unchanged to `readUIMessageStream` / `useChat` so `message.parts` receives live `tool-<name>` parts during streaming and in `eval/parse-stream.ts`.

#### Step 1.2: Emit Tool Call/Output Events & Post-Completion Metadata in `runMastraCanonicalChatStream`, `runXauusdMastraConversationStream` & `mastraStreamResponse`
- **Files:**
  - `packages/ai/src/mastra-v2/agents/canonical/index.ts`
  - `packages/ai/src/mastra-v2/agents/xauusd/run.ts`
  - `apps/web/src/lib/services/mastra-stream-response.ts`
  - `apps/web/src/lib/services/mastra-canonical-chat-stream.ts`
  - `apps/web/src/lib/services/mastra-chat-stream.ts`
- **Action:**
  1. In `packages/ai/src/mastra-v2/agents/canonical/index.ts:36-70`, add `toolInvocations: Array<{ toolCallId: string; toolName: string; input: unknown; output: unknown }>` to `CanonicalChatResult`, and add an optional `onToolEvent?: (event: UIMessageChunk) => void` callback to `CanonicalChatArgs`.
  2. In `runMastraCanonicalChatStream` (`packages/ai/src/mastra-v2/agents/canonical/index.ts:518-561`) and `runXauusdMastraConversationStream` (`packages/ai/src/mastra-v2/agents/xauusd/run.ts:624-650`), capture tool calls and tool results from `output.fullStream` (or `onStepFinish` / `output.steps`) and:
     - Emit `tool-input-available` and `tool-output-available` SSE events via `mastraStreamResponse` as they occur.
     - Collect `toolParts` formatted as AI SDK v5 `UIMessage` parts:
       ```ts
       {
         type: `tool-${inv.toolName}`,
         toolCallId: inv.toolCallId,
         toolName: inv.toolName,
         state: 'output-available',
         input: inv.input,
         output: inv.output,
       }
       ```
  3. In `apps/web/src/lib/services/mastra-canonical-chat-stream.ts:186-218` and `apps/web/src/lib/services/mastra-chat-stream.ts:127-134`, prepend `...completed.toolParts` to `assistantMessage.parts` before calling `appendAssistantMessage` so all 33 tool UI cards in `registry.tsx` and `/api/chat/threads/[id]/summary` (`tool-summarize_thread`) work both live and after page reload.
  4. In `apps/web/src/lib/services/mastra-stream-response.ts:39-103`, support an optional `afterTextParts?: () => Promise<UIMessagePart[]> | UIMessagePart[]` callback invoked right after `text-end` and before `finish`. Use it in `mastra-canonical-chat-stream.ts` and `mastra-chat-stream.ts` to emit the final `data-multi-agent-meta` (with actual `modelId`, `totalCostUsd`, `totalLatencyMs`, `ttfbMs`, `toolNames`, `evidence`) and `data-memory-degraded` parts over the live SSE stream.

#### Step 1.3: Fix `stripPartsForStorage` in `message-persistence.ts`
- **File:** `packages/ai/src/persistence/message-persistence.ts:257-286`
- **Action:**
  - Change the `part.type !== 'tool-result'` guard to match both `'tool-result'` and AI SDK v5 `'tool-'` prefixes (`typeof part.type === 'string' && (part.type === 'tool-result' || part.type.startsWith('tool-'))`).
  - Remove `'candles'` and `'data'` from unconditional `[stripped]` replacement; instead, only strip `'imageDataUrl'`, `'image'`, and `'rawResponse'`, and if `Array.isArray(output.candles)` has length `> 60`, slice it to the last `60` bars (`output.candles.slice(-60)`) so `GetCandlesPart` still renders cleanly after reload without bloating `chat_messages.parts`.

### Phase 2: Canonical Evidence Self-Correction Retry & Clean UI Replacement (Fixes P0-2, Decision Q10)

- **Files:**
  - `packages/ai/src/mastra-v2/agents/canonical/index.ts`
  - `packages/ai/src/mastra-v2/agents/canonical/evidence.ts`
  - `apps/web/src/lib/services/mastra-canonical-chat-stream.ts`
  - `apps/web/src/components/chat/message.tsx`
- **Action:**
  1. **Add 1 Silent Self-Correction Retry in `packages/ai/src/mastra-v2/agents/canonical/index.ts`:**
     - When `checkCanonicalEvidence` detects ungrounded numbers (`ungroundedClaims.length > 0`) in `complete()`, run **one automatic self-correction turn** on the same agent before throwing `CanonicalEvidenceBlockedError`:
       - Pass a system follow-up prompt listing the exact `ungroundedClaims` and the verified numbers from the turn's tool outputs (`evidenceValues`), instructing the agent: *"The following numbers in your draft were not found in live tool outputs: [list]. Either call the appropriate market tool now to verify them, or rewrite your answer using only verified figures from tool outputs."*
       - Re-run `checkCanonicalEvidence` on the self-corrected output (merging any newly called tool outputs into `evidenceValues`).
  2. **Clean UI Replacement Instead of Concatenation (`mastra-canonical-chat-stream.ts` & `message.tsx`):**
     - If the self-corrected output improves and passes verification (or if it still fails and throws `CanonicalEvidenceBlockedError` after tokens were already streamed), emit `{ type: 'data-evidence-blocked', data: { message: finalVerifiedOrRefusalText } }` via `afterTextParts` in `mastraStreamResponse` instead of yielding a raw `text-delta` that concatenates onto the prior text.
     - In `apps/web/src/components/chat/message.tsx`, check if `message.parts` contains a `data-evidence-blocked` part; when present, render `part.data.message` in place of the streamed `text` part so the user never sees concatenated refusal text.

### Phase 3: Eliminate Double Routing & Redundant Guardrail/Classifier LLM Calls (Fixes P0-3, P1-4)

- **Files:**
  - `packages/ai/src/mastra-v2/agents/canonical/index.ts:209-243`
  - `packages/ai/src/mastra-v2/shared/text-runner.ts:28-169`
  - `packages/ai/src/semantic-routing.ts:95-143`
  - `packages/ai/src/tools/registry.ts:115-123`
- **Action:**
  1. **Stop double routing in `setupCanonicalChat` (`packages/ai/src/mastra-v2/agents/canonical/index.ts:209-225`):**
     - If `args.executionPlan?.routingDecision` is already provided, reuse it directly instead of calling `await routeTurn(...)` a second time.
  2. **Skip redundant `PromptInjectionDetector` on internal classifier calls (`packages/ai/src/mastra-v2/shared/text-runner.ts` & `packages/ai/src/semantic-routing.ts`):**
     - Add `skipInputGuardrails?: boolean` to `MastraTextArgs` (`text-runner.ts:28`). When `skipInputGuardrails: true`, omit `inputProcessors: createMastraInputProcessors(...)` from the transient `Agent` in `runMastraText` and `runMastraStructured`.
     - In `classifyTurnLLM` (`semantic-routing.ts:132`), pass `skipInputGuardrails: true` and increase `maxOutputTokens` from `30` to `120` so `{ domain, confidence, rationale }` never truncates mid-JSON.
     - Allow `routeTurn` / `classifyTurnLLM` to accept an optional `model?: LanguageModelV3` (resolved via `resolveChatModel` with the user's BYOK keys) before falling back to `resolveModel(modelId, env)`.
  3. **Fix `ToolRegistry.resolveForPlan` (`packages/ai/src/tools/registry.ts:115-123`):**
     - Normalize `const effectivePlan = plan && ['free', 'pro', 'enterprise'].includes(plan) ? plan : 'free';` so users with `plan: null` or custom self-hosted plan strings receive all `'free'` tier tools instead of `{}`.

### Phase 4: True Multi-Agent Specialization — Dedicated Specialist Skills, Goals, Domain Toolsets & Dynamic Evidence Ledger (Fixes P1-1, P1-5, Decisions Q8 & Q12)

#### Step 4.1: Give Each Specialist Agent Its Own Dedicated Skill Playbook, Goal & Domain Toolset
- **Files:**
  - `packages/ai/src/committee/prompts.ts`
  - `packages/ai/src/committee/specialists.ts`
  - `packages/ai/src/committee/specialist-runner.ts`
- **Action:**
  1. **Define `SPECIALIST_DESK_TOOLS` in `packages/ai/src/committee/specialists.ts`:**
      calling `registerAllTools()` and resolving a dedicated read-only toolset for each desk from `toolRegistry`:
     | Specialist Desk | Specific Goal | Dedicated Domain Tools (`SPECIALIST_DESK_TOOLS[desk]`) | Dedicated Skill Playbook (`prompts.ts`) |
     | :--- | :--- | :--- | :--- |
     | **`technical`** (Technical Chartist) | Identify market regime, multi-timeframe trend structure, institutional liquidity zones (swing highs/lows, Asian/London/NY session levels), indicator confluence, and exact invalidation levels. | `get_price`, `get_candles`, `get_indicators`, `get_market_structure`, `get_session_levels`, `analyze_technical`, `replay_setup` | **Technical Structure & Liquidity Skill:** Multi-timeframe EMA20/EMA50/RSI14/MACD/ATR14 confluence, session high/low sweep detection, support/resistance clustering, and R:R level construction. |
     | **`fundamental`** (Macro & Fundamental Economist) | Evaluate central bank policy divergence, real/nominal yields (`DFII10`, `DGS10`), USD index (`DTWEXBGS`), upcoming high-impact economic calendar releases (CPI, NFP, FOMC, ECB, BoE), and breaking macro news catalysts. | `get_news`, `get_calendar`, `get_intermarket`, `get_intermarket_resonance`, `analyze_fundamental`, `search_knowledge`, `web_search` | **Macro Catalyst & Yield-Spread Skill:** Central bank rate-path pricing, real-yield vs. Gold/FX transmission, economic calendar surprise analysis (`actual` vs. `forecast` vs. `previous`), and headline catalyst weighting. |
     | **`risk`** (Portfolio & Risk Manager) | Quantify volatility regime, ATR-based stop distance, position sizing, tail-risk event blackouts (upcoming high-impact releases within 24h), cross-asset correlation exposure, and strict invalidation criteria. | `forecast_volatility`, `compute_risk`, `get_correlation`, `get_session_levels`, `get_calendar`, `get_indicators`, `verify_call` | **Quantitative Risk & Volatility Skill:** ATR stop-loss multiplier validation, volatility-regime sizing adjustments, red-folder event blackout rules, correlation concentration checks, and scenario probability calibration. |
     | **`sentiment`** (Positioning & Sentiment Strategist) | Diagnose institutional vs. retail positioning extremes, Commitment of Traders (COT) net non-commercial flows, seasonality patterns, news sentiment skew, and crowded-trade squeeze risk. | `get_cot`, `get_social_sentiment`, `get_seasonality`, `get_news`, `get_intermarket_resonance`, `get_market_structure` | **COT Positioning & Contrarian Crowd Skill:** CFTC COT net-positioning extremes, retail vs. institutional flow divergence, historical seasonality alignment, news tone skew, and stop-hunt/squeeze detection. |
  2. **Enable Bounded Tool Execution (`maxSteps: 3`) in `packages/ai/src/committee/specialist-runner.ts`:**
     - Instead of `toolChoice: 'none'` with zero tools, bind `tools: getSpecialistTools(request.desk)` to the specialist Mastra `Agent` and allow `maxSteps: 3` during the initial specialist analysis step so any desk can call its specialized tools when it needs deeper or missing domain data (e.g., `fundamental` fetching live calendar/news or `sentiment` fetching COT/social sentiment on `EURUSD` or `XAUUSD`).
     - Keep `toolChoice: 'none'` on the fast `critique` and `debate` revision steps (`critique.ts`) so cross-critique reasons strictly over the gathered evidence and peer opinions.
  3. **Capture Specialist Tool Outputs into the Verified Evidence Ledger (`specialist-runner.ts`, `grounding.ts`, `verifier.ts`, `fusion-verifier.ts`):**
     - In `runCommitteeSpecialist` (`specialist-runner.ts`), collect all tool outputs returned during the specialist's `maxSteps: 3` execution and extract every numeric value via `extractNumbersFromValue(toolOutput)` (storing them on `opinion.rawData.toolEvidenceValues: number[]` and `opinion.rawData.toolsCalled: string[]`).
     - In `verifyMastraOpinion` (`committee/verifier.ts`) and `verifyFusionAnswer` (`committee/fusion-verifier.ts`), construct the allowed evidence set as the union of `packetEvidenceValues(packet)` **plus** all `toolEvidenceValues` collected across the specialists!
     - Also verify every `opinion.rawData.keyLevels[].price` against that combined evidence set inside `verifyMastraOpinion` (`verifier.ts:44-89`) so no ungrounded key level can slip through to fusion.
     - In `packages/ai/src/committee/workflow.ts:487`, replace `runId: 'unknown'` with `runId: (requestContext?.get('runId') as string | undefined) ?? 'unknown'`.

#### Step 4.2: Enrich Baseline `SymbolResearchPacket` Across All Instruments
- **File:** `packages/ai/src/mastra-v2/packets/symbol-research.ts`
- **Action:**
  - In `fetchLiveInputs` (`symbol-research.ts:288-383`), for **every symbol** (not just `XAUUSD`), fetch `fetchNews(input.symbol, 8)` and `fetchCalendar(...)` in parallel via `Promise.allSettled`, and compute `marketStructure` (`recentSwingHigh`, `recentSwingLow`, `rangeSize`) deterministically from the 50 fetched candles.
  - On `XAUUSD`, include the top 8 news headlines/sources/tones (`xauPacket.news.items.slice(0, 8)`) instead of only `newsCount`.
  - Include all numeric values from `calendarEvents` and `marketStructure` in `packetEvidenceValues(packet)` (`packages/ai/src/committee/grounding.ts`).

#### Step 4.3: Enable Structured Fusion (`PHASE3_STRUCTURED_FUSION = true`) by Default in `full` Mode (Decision Q12)
- **File:** `packages/ai/src/committee/synthesizer.ts`
- **Action:**
  - Change `isStructuredFusionEnabled()` in `packages/ai/src/committee/synthesizer.ts` to default to **`true`** (`process.env.PHASE3_STRUCTURED_FUSION !== 'false'`).
  - Update `renderFusionAnswer` (`synthesizer.ts`) so the synthesized output uses clear, plain-English trader headings:
    - **Bottom Line**
    - **Why the Team Agrees / Where Experts Disagree**
    - **What to Watch Next (Bull / Base / Bear Scenarios)**
    - **Key Risks & When This Idea Is Wrong (Invalidation)**

### Phase 5: Fix Real-Time Committee Progress, Verdict Reveal & Plain-English Labels (Fixes P0-4, P1-2, P2-3, Decision Q9)

- **Files:**
  - `packages/ai/src/committee/types.ts`
  - `packages/ai/src/mastra-v2/shared/progress.ts`
  - `packages/ai/src/committee/workflow.ts`
  - `apps/web/src/components/chat/chat-screen.tsx`
  - `apps/web/src/components/chat/parts/agent-deliberation.tsx`
  - `apps/web/src/components/chat/parts/mastra-report.tsx`
- **Action:**
  1. **Add `opinion` to `CommitteeAgentProgress` (`packages/ai/src/mastra-v2/shared/progress.ts`):**
     ```ts
     export interface CommitteeAgentProgress {
       agentName: CommitteeAgentName;
       status: CommitteeAgentStatus;
       opinion?: {
         bias: 'bullish' | 'bearish' | 'neutral';
         confidence: number;
         summary: string;
       };
     }
     ```
     Add `'debate'` to `committeeProgressStages` in `packages/ai/src/committee/types.ts:68-72` and `shared/progress.ts:30-35`.
  2. **Track Real Parallel Desk State in `runCommitteeWorkflow` (`packages/ai/src/committee/workflow.ts`):**
     - Maintain a per-run `deskStates = new Map<CommitteeAgentName, CommitteeAgentProgress>()` inside `runCommitteeWorkflow`.
     - When `.parallel(specialistSteps)` starts, mark all active desks (`['technical']` in `single`; all 4 in `full`) as `status: 'running'` simultaneously and emit `onProgressSnapshot`.
     - As each specialist desk finishes its LLM + tool loop (and after `critique` / `debate` refines its opinion), update that desk's entry in `deskStates` to `{ agentName: name, status: 'done', opinion: { bias: opinion.bias, confidence: opinion.confidence, summary: opinion.reasoning } }` and emit the snapshot immediately.
     - In `mastra-mode.ts:138` and `mastra-full-analysis-stream.ts:144`, include each desk's final `opinion` in the terminal `status: 'complete'` `data-agent-progress` event.
  3. **Stop Wiping `agentProgress` in `single` Mode (`apps/web/src/components/chat/chat-screen.tsx:206-210, 477`):**
     - Remove `analysisMode === 'single'` from the `useEffect` reset at `chat-screen.tsx:207` and from the `onAgentProgress` guard at `chat-screen.tsx:477`.
  4. **Friendly, Non-Technical Mode Labels in Web & Cards (`agent-deliberation.tsx`, `mastra-report.tsx`):**
     - Display clear, human-friendly titles: **"Quick Check (1 Expert — Technical)"** for `single` mode and **"Full Team Analysis (4 Experts — Technical, Macro, Risk & Sentiment)"** for `full` mode.

### Phase 6: Upgrade Telegram Bot with Real Multi-Agent Workflows, User-Choosable Mode & Simple Trader Language (Fixes P1-3, Decision Q9)

- **Files:**
  - `packages/ai/src/bot/mastra.ts`
  - `packages/ai/src/bot/commands/analyze.ts`
  - `packages/ai/src/bot/commands/committee.ts`
  - `packages/ai/src/bot/commands/ask.ts`
  - `packages/ai/src/bot/dispatcher.ts`
- **Action:**
  1. **Replace Blind `runMastraBackgroundText` Calls in `packages/ai/src/bot/mastra.ts` with Real Data-Grounded Runners:**
     - `runTelegramAnalysis({ userId, symbol, timeframe, mode: 'single' | 'full' })`: builds a live `SymbolResearchPacket`, runs `runCommitteeWorkflow({ mode, symbol, timeframe, userId, strict: true })`, and formats the output in **simple, non-technical trader HTML**:
       - Header: `📊 <b>XAUUSD (1H) — Quick Check (1 Expert)</b>` or `🧠 <b>XAUUSD (1H) — Full Team Analysis (4 Experts)</b>`
       - `<b>Bottom Line:</b> ...` (plain-English takeaway)
       - In `full` mode, a compact 4-line **Expert Breakdown** (`📈 Technical: Bullish (78%)`, `🌍 Macro & News: Neutral (60%)`, `🛡️ Risk Manager: Bullish (72%)`, `👥 Market Sentiment: Bearish (65%)`)
       - `<b>Key Levels to Watch:</b> ...`
       - `<b>What Could Go Wrong:</b> ...`
     - `runTelegramAsk({ userId, question })`: detects any symbol in `question` (`detectSymbol`), attaches live market context, and answers in plain, friendly language without internal system jargon.
  2. **Make Mode Choosable in Telegram (`analyze.ts`, `committee.ts`, `dispatcher.ts`):**
     - Support an optional mode argument on `/analyze` and `/committee`:
       - `/analyze XAUUSD 1h quick` (or `single`) -> runs **Quick Check (1 Expert)** (~4–6s).
       - `/analyze XAUUSD 1h full` (or `/committee XAUUSD 1h`) -> runs **Full Team Analysis (4 Experts)** (~12–20s).
     - When a user runs `/analyze XAUUSD` or `/analyze XAUUSD 1h` without specifying `quick` or `full`, default to `single` (Quick Check) AND attach an inline Telegram keyboard button row on the reply:
       - `[🧠 Run Full 4-Expert Team Analysis]` (callback data: `analyze:full:XAUUSD:1h`) so the user can tap once to upgrade to the 4-expert team, or vice versa (`[⚡ Quick Check (1 Expert)]`)!
     - Handle the `analyze:<mode>:<symbol>:<tf>` callback query inside `packages/ai/src/bot/dispatcher.ts`.

### Phase 7: Fix Storage Pool Leak, Journal Budget Enforcement & Coach Structured Output (Fixes P1-6, P1-7)

- **Files:**
  - `packages/ai/src/mastra-v2/storage.ts:242-259`
  - `packages/ai/src/journal/review.ts:118-167`
  - `packages/ai/src/journal/coach-insights.ts:154-205`
- **Action:**
  1. **Fix `pruneMastraStorage` pool leak (`packages/ai/src/mastra-v2/storage.ts:242-259`):**
     - Cache the `PostgresStore` instance at module level in `storage.ts` (`let sharedStorage: PostgresStore | null = null;`) so `createMastraStorage()` and `pruneMastraStorage()` reuse the same pool rather than creating a new 5-connection `pg.Pool` on every prune cron run.
  2. **Align `journal/review.ts` and `journal/coach-insights.ts` with Owner Decision Q4 (`packages/ai/src/journal/review.ts`, `coach-insights.ts`):**
     - Replace direct `tryReserveBudget(userId, estimatedUsd, maxDailyUsd)` calls with `acquireBudget(userId, estimatedUsd, maxDailyUsd)` from `../budget` (which applies `effectiveDailyCap(maxDailyUsd)` so budgets are ledger-only unless `ENFORCE_BUDGET=true`).
     - Wrap both LLM calls in `beginMastraRun` / `finishMastraRun` so journal reviews and coaching runs record `chat_telemetry` and update the model circuit breaker.
     - In `coach-insights.ts:171-205`, replace `runMastraText` + manual `JSON.parse` with `runMastraStructured` using `z.object({ insights: z.array(CoachInsightSchema).max(5) })`.

### Phase 8: Enable `convene_committee` In-Chat Tool (Fixes P2-2, Decision Q11)

- **Files:**
  - `packages/ai/src/mastra-v2/capabilities/index.ts:124-145`
  - `packages/ai/src/tools/system.ts`
  - `packages/ai/src/tools/by-domain.ts`
- **Action:**
  1. Add `'convene_committee'` to `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` in `packages/ai/src/mastra-v2/capabilities/index.ts:124-145` and include it in `general`, `technical`, and `fundamental` domain tool lists in `packages/ai/src/tools/by-domain.ts`.
  2. In `packages/ai/src/tools/system.ts`, wire `conveneCommitteeTool.execute` to run `runCommitteeWorkflow({ mode: input.mode ?? 'full', symbol: input.symbol, timeframe: input.timeframe ?? '1h', ... })` and return `{ symbol, timeframe, mode, verdict: result.synthesizedText, opinions: result.opinions }` so `ConveneCommitteePart` (`apps/web/src/components/chat/parts/convene-committee.tsx`) renders the interactive 4-expert deliberation card right inside regular chat.

## 7. Verification, Golden Evals & Regression Test Suite

After completing Phases 1–8, the implementing coding agent must execute and verify the following checks:

| Check | Command | Pass Criteria |
| :--- | :--- | :--- |
| **Shared Schema Unit Tests** | `pnpm --filter @kestrel/shared test` | `ChatStreamEventSchema` validates `tool-input-available`, `tool-output-available`, `data-evidence-blocked`, and `data-agent-progress` (with `opinion`). |
| **AI Package Unit & Integration Tests** | `pnpm --filter @kestrel/ai test` | Specialist desk tools (`SPECIALIST_DESK_TOOLS`) and playbooks, dynamic tool-evidence merging in `verifyMastraOpinion` / `verifyFusionAnswer`, `rawData.keyLevels` verification, non-XAUUSD `SymbolResearchPacket` enrichment, single-pass `setupCanonicalChat` routing, structured fusion default, `convene_committee` execution, and Telegram mode choice tests all pass. |
| **Web App Unit Tests** | `pnpm --filter @kestrel/web test` | `mastra-canonical-chat-stream.test.ts`, `chat-transport.test.ts`, `agent-deliberation.test.tsx`, and `/api/chat/threads/[id]/summary` tests pass with persisted `tool-*` parts and clean `data-evidence-blocked` replacement. |
| **Monorepo Typecheck & Lint** | `pnpm typecheck && pnpm lint` | Zero TypeScript or ESLint errors across `packages/*` and `apps/*`. |
| **Live / Golden Eval Harness** | `pnpm tsx packages/ai/src/eval/runner.ts --cases` | `consumeUIMessageStream` captures non-empty `result.toolCalls` from `tool-*` SSE events, `agentProgress` includes desk `opinion` objects, and all quality gate assertions pass. |
