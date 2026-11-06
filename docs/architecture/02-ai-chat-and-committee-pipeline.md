# 02. AI Chat, 4-Desk Specialist Committee, Grounding & RAG Pipeline

> **Visual SVG Boards:** [`docs/assets/ai-chat-and-committee-pipeline.svg`](../assets/ai-chat-and-committee-pipeline.svg) · [`docs/assets/multi-agent-committee.svg`](../assets/multi-agent-committee.svg)

---

## 1. End-to-End Chat Turn Lifecycle (`POST /api/chat`)

When a trader sends a message in `/chat` (or via Telegram `/ask` and `/analyze`), the request passes through a 6-stage pipeline across `apps/web` and `packages/ai`:

```
+---------------- [ CHAT TURN PIPELINE ] ----------------+
|                                                        |
| ●  1. ingress        auth + prompt-injection guardrail |
| │                                                      |
| ●  2. budget hold    reserve cents in daily_ai_spend   |
| │                                                      |
| ●  3. context seed   trader profile + session gameplan |
| │                                                      |
| ●  4. routeUnified   create immutable ExecutionPlan    |
| │                                                      |
| ●  5. execution      canonical stream or 4-desk mode   |
| │                                                      |
| ●  6. verification   numeric grounding + cent settle   |
+--------------------------------------------------------+
```

```
+-------------- [ EXECUTION ROUTES ] --------------+
|                                                  |
| Route                 | When Selected            |
| ----------------------+------------------------- |
| canonical-chat        | General Q&A + tool calls |
| symbol-research       | 1 symbol (Single / Full) |
| multi-symbol-research | 2+ symbols comparison    |
| mutation-draft        | Alert / journal / action |
| ----------------------+------------------------- |
| Total                 | 4 deterministic routes   |
+--------------------------------------------------+
```

### Stage-by-Stage Data Flow

1. **Ingress & Guardrails (`apps/web/src/app/api/chat/route.ts` & `packages/ai/src/mastra-v2/guardrails.ts`):**
   - Authenticates the user inside `withUserTenant`, resolves image attachments (`resolve-image-part.ts`), and screens the user message for prompt injection (`isInjectionAttempt`).
2. **Integer-Cent Budget Reservation (`packages/ai/src/budget/budget-reservations.ts`):**
   - Atomically reserves estimated cost in integer cents (`ai_budget_reservations` + `daily_ai_spend`) using `WHERE total_usd_cents + reserved_cents <= daily_cap_cents`.
3. **Working Memory & Gameplan Context (`packages/ai/src/mastra-v2/context/prepare.ts`):**
   - Seeds Mastra working memory with the trader's historical win rate, average R-multiple, common mistakes (`syncTraderProfileToWorkingMemory`), and today's locked Pre-Session Gameplan (`maxDailyR`, `primaryRule`, `mindset`).
4. **Unified Routing (`packages/ai/src/mastra-v2/planning/router.ts`):**
   - Checks installed plugin intent patterns (`detectInstalledPluginIntent`), mutation verbs (`classifyMutationRequest`), symbol extraction (`extractSymbolsFromText`), and analysis mode (`single` vs. `full`) to emit a frozen `ExecutionPlan`.

---

## 2. The 4-Desk Specialist Committee Workflow (`symbol-research` & `multi-symbol-research`)

When `routeUnified` selects `symbol-research` or `multi-symbol-research`, Kestrel runs a deterministic 4-step Mastra workflow (`packages/ai/src/committee/`):

```
+--------------- [ 4-DESK COMMITTEE ] ---------------+
|                                                    |
| ●  step 1: collect     30s symbol research packet  |
| │                                                  |
| ●  step 2: parallel    tech + fund + risk + sent   |
| │                                                  |
| ●  step 3: verify      strict 4-of-4 grounding     |
| │                                                  |
| ●  step 4: fusion      conflict-aware synthesis    |
+----------------------------------------------------+
```

| Specialist Desk                         | Focus & Inputs from `SymbolResearchPacket`                                                                                                                                                                                              | Structured Output (`OpinionSchema`)                                                                                 |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| **1. Technical Desk** (`technical`)     | Multi-timeframe OHLCV candles (`15m`, `1h`, `4h`, `1d`), EMA 20/50/200, RSI-14, ATR-14, MACD, Bollinger Bands, daily pivots, swing highs/lows, PDH/PDL, and Asian session range.                                                        | `stance` (`bullish`/`bearish`/`neutral`), `confidence` (`0..1`), `thesis`, `keyLevels`, `invalidation`, `citations` |
| **2. Fundamental Desk** (`fundamental`) | Upcoming high-impact economic calendar events, FRED 10Y real yields (`DFII10`), Dollar Index (`DTWEXBGS`), 10Y breakeven inflation (`T10YIE`), CFTC Commitments of Traders (CoT) net positioning, and 45-day OLS intermarket resonance. | `stance`, `confidence`, `thesis`, `macroDrivers`, `eventRisks`, `citations`                                         |
| **3. Risk & Sizing Desk** (`risk`)      | ATR volatility regime, user's open Paper Trading positions & account equity (`packet-enricher.ts`), Pre-Session Gameplan (`maxDailyR`), and reward-to-risk geometry.                                                                    | `stance`, `confidence`, `sizingGuidance`, `stopPlacement`, `maxLossWarning`, `citations`                            |
| **4. Sentiment Desk** (`sentiment`)     | Screened Marketaux breaking news headlines, article sentiment scores, and retail/institutional positioning skew.                                                                                                                        | `stance`, `confidence`, `narrativeSummary`, `crowdingRisk`, `citations`                                             |

### Why This Architecture Prevents Hallucinations

- **Zero Cross-Contamination During Deliberation:** All 4 specialist desks run in `Promise.all` with `readOnlyMemoryOptions` over the exact same frozen `SymbolResearchPacket` snapshot—so no desk can anchor or bias another desk.
- **Strict 4-of-4 Verification Gate (`verifier.ts`):** Every specialist opinion is checked against `packetEvidenceValues` (`±0.5` numeric tolerance). If a desk cites an ungrounded price or fails to disclose stale data (`priceAgeSeconds > 60`), `runSpecialistGeneration` triggers a 1-shot repair prompt; if any desk still fails in `full` mode, the workflow fails closed (`MastraModeStrictFailureError`).
- **Conflict-Aware Fusion (`synthesizer/synthesis.ts` & `fusion-verifier.ts`):** The Fusion Synthesizer receives all verified specialist opinions, explicitly surfaces disagreements between desks (e.g., Technical bullish vs. Fundamental FOMC event risk), and passes through `verifyFusionAnswer` before streaming to the UI and saving per-desk records to `agent_opinions`.

---

## 3. Hybrid `pgvector` HNSW + Full-Text Search RAG Pipeline

When the AI searches longitudinal memory (`search_knowledge` tool or automatic context retrieval in `packages/ai/src/models/rag/search.ts`), it combines semantic vector similarity with exact keyword matching:

```
+----------------- [ HYBRID RAG ] -----------------+
|                                                  |
| ●  1. embed query    byok or server embedding    |
| │                                                |
| ●  2. hnsw vector    pgvector cosine (ef=200)    |
| │                                                |
| ●  3. postgres fts   websearch_to_tsquery rank   |
| │                                                |
| ●  4. rrf fusion     1/(60+rank) + time decay    |
| │                                                |
| ●  5. screen text    strip indirect injections   |
+--------------------------------------------------+
```

1. **Memory Indexing (`packages/ai/src/memory/memory-index/`):** Whenever a trade journal entry is logged (`rememberJournalEntry`), a daily briefing is generated (`rememberBriefing`), or a market regime is recorded (`rememberRegime`), Kestrel embeds the text into `memory_embeddings` (`vector(1536)` / `pgvector` HNSW index) scoped by `tenant_id` and `user_id`.
2. **Parallel Retrieval (`packages/ai/src/models/rag/queries.ts`):** Queries both the `pgvector` HNSW index (`hnsw.ef_search = 200`, `hnsw.iterative_scan = 'relaxed_order'`) and the PostgreSQL `tsvector` GIN index in parallel.
3. **Reciprocal Rank Fusion (`packages/ai/src/models/rag/fusion.ts`):** Merges vector and keyword rankings via `RRF_K = 60`, applies an exponential recency decay so recent trades and briefings rank higher, and screens every snippet through `external-content-screen.ts` before injecting into the LLM prompt.

---

## 4. Human-in-the-Loop Mutation Confirmation Flow

No AI agent in Kestrel can silently create an alert, log a real journal entry, or place a personal paper trade without explicit user confirmation (except in the isolated `AI Agent Sandbox` paper account):

```
+-------------- [ MUTATION SAFETY ] ---------------+
|                                                  |
| ●  1. detect intent   regex + tool call intercept|
| │                                                |
| ●  2. level sanity    check 10x/50x atr distance |
| │                                                |
| ●  3. suspend card    render confirm ui in chat  |
| │                                                |
| ●  4. user clicks     verify hmac / tool args    |
| │                                                |
| ●  5. execute write   insert + idempotency key   |
+--------------------------------------------------+
```

- **Core Chat Mutations (`set_alert`, `log_journal`, `share_snapshot`, `run_system_action`):** Validated against live price and ATR bands (`level-sanity.ts`), signed with an HMAC token (`tokens.ts`), rendered as an interactive `<MutationConfirmationCard />` in chat, and executed idempotently (`mutation_executions` table) via `POST /api/chat/mutations/confirm`.
- **Plugin Write Tools (`paper_place_order`, `paper_close_position`, etc.):** Intercepted in `packages/ai/src/plugins/mastra-tools.ts`, returning a `_ui: { kind: 'plugin-tool-confirm' }` card that executes only when the user clicks Confirm (`POST /api/plugins/[pluginId]/tools/[toolId]/confirm`).
