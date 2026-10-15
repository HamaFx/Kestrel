# Phase 3 AI Chat & Agents Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate all 23 findings (9 P0s, 13 P1s, 6 P2s, 1 P3) identified in the Phase 3 Audit for Kestrel AI Chat Orchestration, Multi-Agent Specialists, RAG Memory, Streaming SSE, and Prompt Security.

**Architecture:** Systematic wave-based remediation adhering strictly to the code patterns and verified citations in `docs/audits/phase-03-ai-chat-and-agents.md`: Wave 1 (P0: Data integrity, grounding, security, memory leak & lifecycle fixes), Wave 2 (P1: Routing, resilience, evidence verifiers & SSE error handling), and Wave 3 (P2/P3: Market tool signal propagation, vision parsing, and injection defenses).

**Tech Stack:** TypeScript, Node.js / Bun, Vercel AI SDK (`ai`), Mastra (`@mastra/core`, `@mastra/pg`, `@mastra/memory`), Next.js 15 App Router SSE, Drizzle ORM + `pgvector`, BullMQ / PostgreSQL queue.

**Spec:** [`docs/audits/phase-03-ai-chat-and-agents.md`](file:///home/ubuntu/Kestrel/docs/audits/phase-03-ai-chat-and-agents.md)

## Global Constraints

- Preserve all existing public and exported module signatures unless explicitly extending optional parameters.
- Never substitute synthetic constants (`2.1%`, `2.3%`, `rsi=50`, `entry`) for live or missing market data.
- Ensure all committee and tool executions run within `withToolContext` to preserve tenant context, user settings, BYOK keys, and telemetry attribution.
- Enforce `pgvector` HNSW index correctness using `SET LOCAL hnsw.iterative_scan = 'relaxed_order'` and explicit `model = ${queryModel}` filtering.
- Prevent unhandled controller errors in SSE streaming responses on client abort.

## Review Focus

1. **Tool Context Loss:** Committee specialists invoking RAG or telemetry without active `ToolContext` throwing or dropping tenant isolation.
2. **False Rejections of Analytical Queries:** User queries mentioning "buy" or "sell" in analytical contexts being blocked by overly aggressive mutation checks.
3. **Data Hallucination & Fabrication:** Missing prices or indicators being masked with synthetic numbers instead of explicit unavailable indicators.
4. **Cross-Thread Memory Bleeding:** Stale prices from previous conversation threads bleeding into active sessions due to overly broad memory scoping.
5. **Dangling Worker Execution:** In-flight specialist jobs continuing to burn LLM budget after user aborts or cancels streaming.

---

### Task 1: Wave 1 - Tool Context Wrapping in Specialist Runner & Mode Runner (P0-01)

**Files:**
- Modify: `packages/ai/src/mastra-v2/planning/mode-runner.ts`
- Modify: `packages/ai/src/committee/specialist-runner.ts`
- Test: `packages/ai/test/mastra-modes.test.ts`

**Interfaces:**
- Consumes: `createToolContext`, `withToolContext` from `packages/ai/src/tool-context.ts`
- Produces: Active AsyncLocalStorage `ToolContext` throughout all committee specialist tool calls (`search_knowledge`, `web_search`, `withTelemetry`)

- [ ] **Step 1: Check existing test coverage for specialist tool context**
- [ ] **Step 2: Wrap committee workflow execution in `withToolContext` in `mode-runner.ts`**
- [ ] **Step 3: Ensure `specialist-runner.ts` propagates `toolContext` if invoked directly**
- [ ] **Step 4: Run vitest for mode-runner and specialists to verify context preservation**
- [ ] **Step 5: Commit P0-01 changes**

---

### Task 2: Wave 1 - Safe Prompt Validation in Full Mode & Worker (P0-02)

**Files:**
- Modify: `packages/ai/src/mastra-v2/packets/symbol-research.ts:436-464`
- Modify: `apps/worker/src/jobs/multi-agent-analysis.ts:200-265`
- Test: `packages/ai/test/symbol-research.test.ts` (or relevant packet test)

**Interfaces:**
- Consumes: `INJECTION_TERMS`, `isHighConfidenceMutationIntent` from `packages/ai/src/routing-keywords.ts`
- Produces: Updated `isSafeSymbolResearchPrompt(prompt: string): boolean` that permits analytical questions containing trading verbs while blocking true mutations and prompt injections

- [ ] **Step 1: Write test verifying `isSafeSymbolResearchPrompt("Should I buy or sell XAUUSD here?")` returns `true`**
- [ ] **Step 2: Update `isSafeSymbolResearchPrompt` in `symbol-research.ts` to use `INJECTION_TERMS` and `isHighConfidenceMutationIntent`**
- [ ] **Step 3: Ensure worker persists user message before validation to avoid silent message dropping**
- [ ] **Step 4: Run tests to verify passing behavior**
- [ ] **Step 5: Commit P0-02 changes**

---

### Task 3: Wave 1 - Fix `convene_committee` Tool Attribution, BYOK, Signal & Fabrication (P0-03 & P0-04)

**Files:**
- Modify: `packages/ai/src/tools/convene-committee.ts`
- Test: `packages/ai/test/convene-committee.test.ts`

**Interfaces:**
- Consumes: `maybeGetToolContext` from `packages/ai/src/tool-context.ts`, `collectSymbolResearchPacket`
- Produces: Grounded, attributed committee convening tool with all 4 specialists (`technical`, `fundamental`, `sentiment`, `risk`), valid UUIDs, BYOK keys, and strict erroring on missing live tick data instead of fabrications (`entry`, `rsi=50`)

- [ ] **Step 1: Write test verifying `convene_committee` pulls `userId` and `threadId` from tool context and does not fabricate numbers when packet is blocked**
- [ ] **Step 2: Update `conveneCommitteeTool.execute` to retrieve `maybeGetToolContext()`, propagate `userId`, `threadId`, `userSettings`, `signal`**
- [ ] **Step 3: Include `sentiment` specialist verdict in returned verdicts**
- [ ] **Step 4: Remove fabricated defaults (`entry`, `rsi=50`, `ema=entry`) in `buildPacketGroundedFallbackVerdicts` and throw when live tick is missing**
- [ ] **Step 5: Run tests and commit P0-03 & P0-04 changes**

---

### Task 4: Wave 1 - Remove Fabricated Macro Readings in `get_intermarket_resonance` (P0-05)

**Files:**
- Modify: `packages/ai/src/tools/get-intermarket-resonance.ts`
- Test: `packages/ai/test/intermarket-resonance.test.ts`

**Interfaces:**
- Produces: `GetIntermarketResonanceOutput` with nullable `currentRealYield`, `currentBreakevenInflation`, `currentDivergence`, and an `available: boolean` field

- [ ] **Step 1: Write test verifying empty or null `intermarket_snapshots` returns `available: false` and null yields**
- [ ] **Step 2: Modify `get_intermarket_resonance.ts` to remove hardcoded `2.1%` and `2.3%` fallbacks**
- [ ] **Step 3: Run test to verify passes**
- [ ] **Step 4: Commit P0-05 changes**

---

### Task 5: Wave 1 - BYOK Embedding Instantiation & Thread Memory Scoping (P0-06 & P0-07)

**Files:**
- Modify: `packages/ai/src/byok-providers.ts`
- Modify: `packages/ai/src/model-embedding.ts`
- Modify: `packages/ai/src/embeddings.ts`
- Modify: `packages/ai/src/mastra-v2/memory.ts`
- Test: `packages/ai/test/byok-embedding.test.ts`, `packages/ai/test/mastra-v2-memory.test.ts`

**Interfaces:**
- Consumes: `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`
- Produces: `buildByokEmbeddingModel`, thread-scoped `kestrelMemoryOptions` (`scope: 'thread'`)

- [ ] **Step 1: Write test for `buildByokEmbeddingModel` and thread-scoped memory config**
- [ ] **Step 2: Implement `buildByokEmbeddingModel` in `byok-providers.ts`**
- [ ] **Step 3: Update `resolveEmbeddingModel` and `embedTexts` to support BYOK embedding models**
- [ ] **Step 4: Update `kestrelMemoryOptions` in `mastra-v2/memory.ts` to use `scope: 'thread'` for `semanticRecall` and `observationalMemory`**
- [ ] **Step 5: Run tests and commit P0-06 & P0-07 changes**

---

### Task 6: Wave 1 - Full-Analysis Job Abort & Cancellation Propagation (P0-08)

**Files:**
- Modify: `apps/web/src/app/api/chat/analysis-jobs/[jobId]/route.ts`
- Modify: `apps/web/src/lib/chat-transport.ts`
- Modify: `apps/worker/src/jobs/multi-agent-analysis.ts`
- Test: `apps/web/test/analysis-job-cancel.test.ts`

**Interfaces:**
- Produces: `DELETE /api/chat/analysis-jobs/[jobId]` endpoint, client `DELETE` trigger on abort, worker `jobAbortController` linked to `renewFullAnalysisJobLease`

- [ ] **Step 1: Add `DELETE` method to `apps/web/src/app/api/chat/analysis-jobs/[jobId]/route.ts`**
- [ ] **Step 2: Add cancellation fetch on abort in `apps/web/src/lib/chat-transport.ts`**
- [ ] **Step 3: Implement abort signal in worker lease renewal in `apps/worker/src/jobs/multi-agent-analysis.ts`**
- [ ] **Step 4: Test cancellation flow**
- [ ] **Step 5: Commit P0-08 changes**

---

### Task 7: Wave 1 - External Text Sanitization for News & Calendar Tools (P0-09)

**Files:**
- Modify: `packages/ai/src/tools/get-news.ts`
- Modify: `packages/ai/src/tools/get-calendar.ts`
- Modify: `packages/ai/src/tools/analyze-fundamental.ts`
- Modify: `packages/ai/src/tools/search-knowledge.ts`
- Modify: `packages/ai/src/tools/forecast-volatility.ts`
- Modify: `packages/ai/src/news-persistence.ts`
- Test: `packages/ai/test/external-content.test.ts`

**Interfaces:**
- Consumes: `quarantineExternalText` from `packages/ai/src/mastra-v2/packets/external-content.ts`

- [ ] **Step 1: Apply `quarantineExternalText` to headlines, sources, and summaries across the 5 tools and `news-persistence.ts`**
- [ ] **Step 2: Run tests to verify external content filtering**
- [ ] **Step 3: Commit P0-09 changes**

---

### Task 8: Wave 2 - Routing & Onboarding Guards (P1-01 & P1-02)

**Files:**
- Modify: `apps/web/src/app/api/chat/route.ts`
- Modify: `packages/ai/src/mastra-v2/planning/routing-policy.ts`
- Modify: `packages/ai/src/mastra-v2/packets/symbol-research.ts`
- Test: `packages/ai/test/routing-policy.test.ts`

**Interfaces:**
- Fixes null crash when `userSettings` is null (P1-01) and multi-symbol short-circuiting to `XAUUSD` (P1-02).

- [ ] **Step 1: Add immediate `409 ONBOARDING_REQUIRED` check in `/api/chat/route.ts` when `!userSettings`**
- [ ] **Step 2: Update `extractMastraSymbol` to collect all matched symbols before choosing**
- [ ] **Step 3: Run routing tests**
- [ ] **Step 4: Commit P1-01 & P1-02 changes**

---

### Task 9: Wave 2 - LLM 429 Retry, Fallback Chain & Disabled Tools Filtering (P1-03 & P1-04)

**Files:**
- Modify: `packages/ai/src/model-role.ts`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/index.ts`
- Modify: `packages/ai/src/committee/specialists.ts`
- Test: `packages/ai/test/model-role.test.ts`, `packages/ai/test/tool-filtering.test.ts`

**Interfaces:**
- Respects `userSettings.aiFallbackChain` and filters `userSettings.disabledTools` in canonical and specialist agents.

- [ ] **Step 1: Update `getAvailableProviders` in `model-role.ts` to respect `userSettings.aiFallbackChain`**
- [ ] **Step 2: Update `resolveAdaptedTools` and `resolveSpecialistDeskTools` to omit tools in `disabledTools`**
- [ ] **Step 3: Run tests and commit P1-03 & P1-04 changes**

---

### Task 10: Wave 2 - Grounding Verifiers for Symbol Research, Telegram Bot & Canonical Evidence (P1-05, P1-06, P1-07)

**Files:**
- Modify: `packages/ai/src/mastra-v2/agents/xauusd/run.ts`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/evidence.ts`
- Modify: `packages/ai/src/bot/mastra.ts`
- Test: `packages/ai/test/canonical-evidence.test.ts`, `packages/ai/test/symbol-research-grounding.test.ts`

**Interfaces:**
- Post-generation evidence check in `runXauusdMastraConversationStream`
- Expanded `MARKET_TOOL_PATTERN` covering all 13 canonical/specialist tools
- Ungrounded fallback prevention in Telegram bot

- [ ] **Step 1: Expand `MARKET_TOOL_PATTERN` in `evidence.ts` to include all 13 tools and adjust number patterns**
- [ ] **Step 2: Add post-generation grounding check to `runXauusdMastraConversationStream`**
- [ ] **Step 3: Fix Telegram bot `tryMastraBotMessage` to block when packet is unavailable**
- [ ] **Step 4: Run tests and commit P1-05, P1-06, P1-07 changes**

---

### Task 11: Wave 2 - RAG Model Filter & HNSW Iterative Scan (P1-08 & P1-09)

**Files:**
- Modify: `packages/ai/src/rag.ts`
- Modify: `packages/ai/src/memory/memory-index.ts`
- Test: `packages/ai/test/rag.test.ts`

**Interfaces:**
- Dense query model isolation (`AND ne.model = ${model}`)
- Transaction with `SET LOCAL hnsw.iterative_scan = 'relaxed_order'` in `runDenseNewsQuery`

- [ ] **Step 1: Update `runDenseNewsQuery` in `rag.ts` to execute inside transaction with `relaxed_order` and `model` filter**
- [ ] **Step 2: Update `searchMemory` in `memory-index.ts` with model filter**
- [ ] **Step 3: Run RAG tests and commit P1-08 & P1-09 changes**

---

### Task 12: Wave 2 - SSE Lifecycle, Controller Guarding & Input Sanitization (P1-10, P1-11, P1-12, P1-13)

**Files:**
- Modify: `packages/ai/src/mastra-v2/agents/canonical/index.ts`
- Modify: `apps/web/src/lib/services/mastra-mode.ts`
- Modify: `apps/web/src/lib/services/mastra-stream-response.ts`
- Modify: `packages/ai/src/mastra-v2/agents/xauusd/background-text.ts`
- Modify: `apps/web/src/app/api/chat/route.ts`
- Test: `apps/web/test/sse-stream.test.ts`, `packages/ai/test/guardrails.test.ts`

- [ ] **Step 1: Pass `callMemory` to `attemptCanonicalSelfCorrection` (P1-10)**
- [ ] **Step 2: Guard controller close in `mastra-stream-response.ts` and `mastra-mode.ts` (P1-11)**
- [ ] **Step 3: Attach `inputProcessors: buildInputGuardrails()` in `runMastraBackgroundText` (P1-12)**
- [ ] **Step 4: Strip `<` and `>` in `sanitizeCustomInstructions` (P1-13)**
- [ ] **Step 5: Run tests and commit P1-10 through P1-13 changes**

---

### Task 13: Wave 3 - Polish, Abort Signals, Vision Parsing & Injection Defenses (P2-01 through P3-01)

**Files:**
- Modify: `apps/web/src/app/api/chat/route.ts` & `mastra-mutation-draft.ts` (P2-01)
- Modify: `packages/ai/src/tools/analyze-chart-image.ts` (P2-02)
- Modify: `packages/ai/src/tools/analyze-technical.ts` (P2-03)
- Modify: `packages/ai/src/mastra-v2/agents/canonical/index.ts` & `context.ts` (P2-04)
- Modify: 10 tools (`get-price.ts`, `get-candles.ts`, `get-indicators.ts`, etc.) (P2-05)
- Modify: `mastra-canonical-chat-stream.ts` & `title.ts` (P2-06)
- Modify: `packages/ai/src/routing-keywords.ts` & `semantic-routing.ts` (P3-01)
- Test: Corresponding tool and routing test files

- [ ] **Step 1: Respect `thread.analysisMode` / `thread.pinnedSymbol` and fix `startMutationDraft` (P2-01)**
- [ ] **Step 2: Strip code fences / parse JSON safely in `analyze_chart_image` (P2-02)**
- [ ] **Step 3: Return `null` for missing RSI/MACD in `analyze_technical` (P2-03)**
- [ ] **Step 4: Bound degraded `messageHistory` and preserve tool parts in backfill (P2-04)**
- [ ] **Step 5: Forward `abortSignal` across 10 market tools (P2-05)**
- [ ] **Step 6: Ensure thread title generation bills to ledger and supports BYOK (P2-06)**
- [ ] **Step 7: Expand `INJECTION_TERMS` regex and escape quote in `classifyTurnLLM` (P3-01)**
- [ ] **Step 8: Run full test suite and typechecks across workspace**
- [ ] **Step 9: Commit Wave 3 changes**
