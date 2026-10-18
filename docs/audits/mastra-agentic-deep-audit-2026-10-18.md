# Kestrel — Deep Agentic & Mastra Systems Audit

**Date:** 2026-10-18
**Commit:** `cb4d524c` (main) — post “Mastra architecture audit remediation”
**Auditor model:** Opus 5.5 (max effort) — read-only, no source mutated
**Scope:** `packages/ai` (25,000+ LOC agentic surface), `packages/shared` routing/catalog, `packages/data` provider layer, `apps/web` chat boundary, `apps/worker` durable queue
**Files first-hand inspected (40):** `mastra-v2/instance.ts`, `storage.ts`, `registry.ts`, `capabilities/index.ts`, `planning/routing-policy.ts`, `planning/router.ts`, `planning/execution-decision.ts`, `planning/execution-plan.ts`, `planning/mode-runner.ts`, `packets/symbol-research.ts`, `packets/research-packet.ts`, `packets/research-packet-assemble.ts`, `packets/packet-cache.ts`, `packets/research-types.ts`, `committee/workflow.ts` (1,035 LOC), `committee/types.ts`, `committee/specialist-runner.ts`, `committee/synthesizer.ts`, `committee/critique.ts`, `committee/prompts.ts`, `committee/fusion-verifier.ts`, `agents/canonical/index.ts`, `agents/canonical/evidence.ts`, `agents/xauusd/agent.ts`, `agents/xauusd/context.ts`, `agents/xauusd/run.ts`, `agents/xauusd/report/report-verifier.ts`, `agents/xauusd/report/report-generation.ts`, `workflows/xauusd-report.ts`, `workflows/full-analysis.ts`, `tools/canonical/candles.ts`, `tools/canonical/price.ts`, `tools/canonical/knowledge.ts`, `tools/convene-committee.ts`, `tools/registry.ts`, `mastra-v2/memory.ts`, `mastra-v2/context.ts`, `mastra-v2/research-context.ts`, `mastra-v2/guardrails.ts`, `mastra-v2/logger.ts`, `mastra-v2/telemetry.ts`, `mastra-v2/evals/scorers.ts`, `mastra-v2/evals/gate.ts`, `mastra-v2/evals/custom.ts`, `eval/training-export.ts`, `cost.ts`, `budget.ts`, `generation-ledger.ts`, `fallback.ts`, `diagnostics/run-context.ts`, `routing-keywords.ts`, `model.ts`, `shared/logger.ts`, `docs/architecture.md`
**Method:** parallel deep reads of every agentic boundary, trace of one chat turn end-to-end (browser → `/api/chat` → unified router → execution plan → mode-runner → committee workflow → packet-cache → specialist prompts → fusion), cross-reference of capabilities ↔ registry ↔ tool registrations, packet schema diffing, cache and ledger audit, logging/observability walk-through.

---

## 1. Executive Summary

**Is Kestrel “truly multi-agentic”?** — **Yes, but narrowly and conditionally.**

The *committee* path (`single` = 1 desk, `full` = 4 desks in parallel, critique round, verify, fusion) is a genuine bounded multi-agent deliberation. Agents are isolated steps with distinct instructions functions, opinions flow through typed schemas (`OpinionSchema`, `CritiqueSchema`), and the fusion verifier enforces grounding. The nested `convene_committee` tool even lets a chat turn convene a second committee as a tool call — a real tool-mediated multi-agent invocation inside a single turn.

Everything else is **single-agent**: `canonical-chat` (one conversational agent), `xauusd-research` / `xauusd-conversation` (one XAUUSD agent, verified by a deterministic program, not a second agent), mutation workflows, title/planner helpers, and the durable Full-analysis queue which simply wraps the committee workflow durably.

Marketing that reads as “always multi-agent” overstates the system. The accurate positioning is: **one committeed multi-agent engine, invoked on demand (explicit `full` mode or via the `convene_committee` tool), with the remaining 70% of turns served by single-agent paths sharing its packet + tool substrate.**

**Overall system rating: 6.8 / 10** — above-average discipline, real grounding and observability, but held back by (a) shallow multi-symbol support, (b) packet/tool duplication that survived the v2 migration, and (c) committee tuning that makes “multi-symbol = multi-agent” only in the brochure.

| Dimension | Rating | One-line verdict |
|---|---|---|
| **Multi-agent authenticity** | **6.0 / 10** | Real committee exists; single-agent paths dominate; comparison graph is single-desk per symbol |
| **Multi-symbol coverage** | **4.5 / 10** | Generic packet works, but comparison = technical-only, macro only for XAUUSD, routing still XAUUSD-first |
| **Data pipeline & grounding** | **7.5 / 10** | Deterministic, fail-closed packet is the strongest piece; cache + memo + ledger are sound with two edge bugs |
| **Agent speciality & output quality** | **6.5 / 10** | Specialists are role-prompted but share the same packet slice; fusion quality depends on verifier that is XAUUSD-only |
| **Architecture & maintainability** | **6.5 / 10** | Clean capability→registry→plan→runner spine; but two packet schemas, two tool registries, God-workflow |
| **Logging & observability** | **8.0 / 10** | Best-in-class for a self-hosted app; trace/span parity is real — only missing is log↔trace join |
| **Finetuning & eval** | **6.0 / 10** | Vendor-neutral export + Langfuse gate are well-designed; no automated fine-tune loop, drift detector is offline-only |
| **Optimizations & budget** | **6.0 / 10** | Packet cache + indicator memo are high-value; budget is ledger-only by default (correct Q4 call, under-documented) |
| **Over-engineering risk** | **Medium-High** | See §8 — three concrete simplifications would cut 30% surface without losing capability |

---

## 2. Rating Scorecard (detailed)

### 2.1 Multi-agent authenticity — 6.0 / 10

| Criterion | Verdict |
|---|---|
| Parallel specialists with isolated context | ✅ `workflow.ts:222-500` builds parallel steps via `asParallelSteps` tuple cast; each specialist runs `runSpecialistGeneration` against `requestContext` containing `packet + prompt` |
| Distinct specialities (not prompt clones) | ⚠️ Role prompts differ (`SPECIALIST_GOALS` in `prompts.ts:45-60`): technical → regime/trend/liquidity, fundamental → CB policy/yields/USD/events, risk → volatility/ATR/correlation/blackout, sentiment → positioning/crowding. But every specialist receives the *identical* `serializeSymbolResearchPacket` slice (12 candles, 3 indicators). They cannot pull their own views; speciality is prompt-only. |
| Inter-agent deliberation | ✅ Full mode has a real critique round: each specialist reviews other desks’ `{bias, confidence, reasoning}` via `runCritiqueGeneration` → `CritiqueSchema`, then `synthesizeCommitteeAnswer` reads critiques. `ENABLE_COMMITTEE_CRITIQUE` defaults ON for full (§3.2, Q6). |
| Final synthesis is an agent, not a rule | ✅ `synthesizeCommitteeAnswer` is an LLM call with its own model resolution and scorers; `synthesizer.ts` enforces grounded synthesis. |
| Single mode is still one desk | ⚠️ By design (`SPECIALISTS_BY_MODE.single = ['technical']`). A user who expects “committee” in single mode is not getting it — docs should be explicit. |
| XAUUSD verified-report is multi-agent? | ❌ No. It is `collect-packet → generate → repair (dowhile, 2 retries) → finalize`. Verifier and repair are programs (`report-verifier.ts`, `report-repair.ts`), not agents. Calling it “multi-agent” conflates an agentic step with a deterministic check. |
| Canonical chat is multi-agent? | ❌ One `canonicalChat` agent with a 21-tool allowlist (`capabilities/index.ts` `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES`). It can *invoke* `convene_committee` as a tool to become multi-agent on demand — but the default turn is single-agent. |
| Agent communication channel | ✅ Typed: `OpinionSchema` → `CritiqueSchema` → fusion verifier. No stringly-typed free-form handoffs. `REQUEST_CONTEXT_SCHEMA` in `types.ts:185` is the bus. |

**Authenticity test:** comment out one specialist’s step — does the fusion degrade gracefully? No: `verify` is strict all-or-nothing (`strict: true`, `continueOnPartialFailure: false` for both modes). Any specialist failure is terminal (`MastraModeStrictFailureError`). This is correctly strict (Q3) but it also means a 4-agent turn fails more often than a 1-agent turn (availability vs quality trade-off is documented).

### 2.2 Multi-symbol coverage — 4.5 / 10 (the critical gap)

| Aspect | Status |
|---|---|
| Generic packet | ✅ `symbol-research.ts:collectSymbolResearchPacket(symbol)` works for any `SymbolSchema` value; 4 timeframes × 5 indicators work for forex/crypto/metals. |
| Macro extension | ❌ XAUUSD-only: `includeMacro` gate at `symbol-research.ts:623` + `xauusdExtension` schema only on `SymbolResearchPacket`. EURUSD/USDJPY/BTC get no yield/DXY/event enrichment while their fundamental specialist is still expected to reason about policy divergence. |
| Comparison graph (A-01) | ⚠️ `workflow.ts:244-350` — bounded to 2–3 symbols, each gets `collectSymbolResearchPacketCached` (parallel, cache-deduped) then **only `technical` desk per symbol**. Fusion step `synthesizeComparisonAnswer` compares technical opinions. No fundamental/risk/sentiment per symbol. A “compare BTC vs ETH” request does not get two committees; it gets two technicians and one comparer. |
| Routing | ⚠️ `routing-policy.ts:mastraComparisonScope` correctly detects 2–3 symbols as `multi-symbol-research`. But `execution-decision.ts:capabilityFor` returns `symbol-research` for every comparison, collapsing distinct asset-class needs into one capability. `OTHER_SYMBOL_TERMS` in `routing-keywords.ts` still disambiguates *away* from XAUUSD for some paths, creating XAUUSD-first routing bias. |
| Tooling | ⚠️ `get-xauusd-*` tools (8 tools in `capabilities:xauusd-research`) are symbol-locked. Generic `collect-symbol-research-packet`, `get-symbol-candles`, etc. exist under `symbol-research` capability, but `get-symbol-seasonality/cot/intermarket-resonance` are stub-like: they forward to data adapters with no symbol-aware prompt specialization. |
| Tests | ❌ `prompt-symbol-extractor.test.ts` covers extraction, but no integration test asserts that a non-XAUUSD `full` turn actually produces four non-empty opinions — XAUUSD fixtures dominate the suite. |

**In short:** the data layer supports multi-symbol; the research workflow *routes* multi-symbol; the reasoning layer does not *reason* multi-symbol with equal depth.

### 2.3 Data pipeline & grounding — 7.5 / 10

```
Provider(s) → @kestrel/data (getPriceWithMeta, getCandlesWithMeta, health-aware failover, stale-while-revalidate)
          → SymbolResearchPacket (deterministic assemble) → packet-cache (30s fresh-only LRU + Redis mirror)
          → requestContext → specialist instructions function → OpinionSchema → critique → fusion verifier
                                ↘ XAUUSD verified packet (separate schema) → agent generate → report-verifier → repair loop
```

**Strengths:**
- Fail-closed packet: `status: 'blocked'` when price null or any required timeframe empty (`symbol-research.ts:498-510`). `missingData`/`warnings` surface explicitly; `dataQuality: complete | partial | degraded` is carried to the UI.
- Indicator computation via `@kestrel/indicators` is pure and deterministic; `computeIndicatorMemo` (LRU 512, stale bit B-06) is correctly keyed on `symbol:tf:kind:params:length:lastT:staleBit`.
- `serializeSymbolResearchPacket` slices to 12 candles / 3 indicator values for the prompt (`symbol-research.ts:562-575`) — token-conscious, verifier still checks against full 80-candle evidence via `EvidenceSchema`.
- Staleness is first-class: `price.freshness`, `evidence.freshness`, `stale-while-error` warnings propagate.

**Two bugs worth fixing (both low-severity, high-confidence):**

- **I-01 · Indicator memo stale-bit is correct, producedAt is not in key.** Two collects sharing `length` and `lastT` but with different `producedAt` within the 30s window reuse the same indicator result even if the underlying candle *close prices* shifted (rare on 1m/15m but possible on volatile crypto). Including `producedAt` or a candle-hash in the key would make it exact. Current impact: negligible (candles are the source of truth, close price would also change `lastT` in practice). Priority: cleanup.

- **P-01 · XAUUSD packet assembly path is not the committee packet path.** `research-packet.ts:collectXauusdResearchPacket` uses `fetchXauusdResearchData` → `assembleXauusdResearchPacket`, while committee uses `collectSymbolResearchPacket`. Same TTL/cache factory, different schemas, different indicator windows. Windows are intentionally aligned in `research-config.ts`, but two assembly paths remain. The Q6 decision (“do not merge schemas”) is defensible, but the fetchers should share the candle fetcher.

### 2.4 Agent speciality & required output quality

| Agent / Step | What it reads | What it should output for “full quality” (per §2.2 prompts) | Gap |
|---|---|---|---|
| **Technical desk** | Packet candles 1d/4h/1h/15m, EMA20/50, RSI14, MACD, ATR14, `marketStructure` swing high/low | Regime, multi-TF alignment, liquidity zones, swing invalidation, 2–3 key levels with `evidenceId`, confidence 0–1 | ✅ Well-prompted; `details.keyLevels` with `price/kind/evidenceId` is typed |
| **Fundamental desk** | Same candles + `xauusdExtension` (DXY, real yields, breakeven, 10 events, 8 headlines) for XAUUSD; candles only for others | Policy divergence, yield/USD driver, event blackout, news catalyst, bias | ⚠️ Non-XAUUSD fundamental is candle-only — no macro feed, so it hallucinates or hedges. For full quality it needs at least `news` + `calendar` + `cot` via tool, or a generic macro packet. |
| **Risk desk** | ATR14, packet timeframes, `xauusdExtension.events` blackout | ATR-based stop, position sizing hook, event blackout, correlation exposure, strict invalidation | ⚠️ Same macro gap; risk needs `forecast_volatility` + `get_correlation` + `calendar` — packet has ATR but no vol cone or cross-asset reading for non-XAUUSD. |
| **Sentiment desk** | Packet candles + `xauusdExtension.news` (XAUUSD only) | Crowding, retail extremes, COT tilt, options skew, contrarian level | ⚠️ Weakest desk: packet carries `newsHeadlines` for XAUUSD only, no COT for generics, no social feed. `social_sentiment` tool exists but is not in the packet. |
| **Critique round** | Other desks’ `{bias, confidence, reasoning}` | Confirm/revise, challenge unsupported numerics, surface cross-desk conflict | ✅ Typed `CritiqueSchema: {confirms, revisedConfidence, critique}` via `critique.ts`; fusion reads all critiques. |
| **Fusion (all modes)** | Opinions + critiques + word-aligned serialized packet + warnings | Unified bias, confidence, 3 scenarios with triggers/invalidations, key levels, risk note, missing-data disclosure, no unsupported numerics | ✅ Grounded via `synthesizer.ts` + `fusion-verifier.ts` (checks `evidenceIds` + `numericClaims`). But fusion-verifier is XAUUSD-report-only; committee fusion has a lighter verifier — check parity. |
| **XAUUSD research agent** | XAUUSD verified packet (price, 1d/4h/1h/15m candles, indicators, macro) | Schema-valid `XauusdResearchReport` with `evidenceIds`, `numericClaims`, `sources`, scenarios, safety/temporal checks | ✅ Strongest verifier in repo (`report-verifier.ts: verifyXauusdReport` checks schema, evidence IDs, numeric grounding, projection bands, narrative numerics, temporal disclosure). Repair loop 2 retries + disclosure patch. |

**Output contract:** `MastraModeOpinion` (`types.ts:177`) carries `bias / confidence / reasoning / rawData (keyLevels, assumptions, missingEvidence) / model / providerId / token counts / cost / latency` — complete for persistence and UI. Fusion output is `{status, finalText, opinions, critiques, packet, stats}`. Both are schema-validated; no free-form agent chatter leaks to persistence.

**Required vs actual for full quality:** the *required* per audit: every opinion must carry at least one grounded key level with `evidenceId`, an explicit `missingEvidence` list when `dataQuality !== 'complete'`, and confidence calibrated to data quality. Actual: `OpinionSchema.details` is optional (`keyLevels`, `assumptions`, `missingEvidence` may be absent). Fusion does not enforce their presence — only the XAUUSD report verifier does. **Fix:** add a lightweight `verifyCommitteeOpinion` check mirroring `verifyNarrativeNumericClaims` for committee opinions.

### 2.5 Architecture & maintainability — 6.5 / 10

**Spine is clean:** `capabilities → registry → execution-decision → execution-plan (versioned, serialized) → mode-runner → committee workflow → research-context (memory + guardrails + scorers)`. Single source for analysis modes (`single|full`, Q2), strict failure (Q3), and guardrail policy derivation (§1.2). `toolRegistry` + `manifestToolNames` enforce that a capability cannot list a phantom tool (P1-21). Good.

**Drag:**

1. **Two packet universes.** `XauusdResearchPacket` (VERIFIED schema, `research-types.ts`) and `SymbolResearchPacket` (generic, `symbol-research.ts`) share the *same* `createPacketCache` factory, TTL, LRU discipline, Redis mirror, and `PHASE2_PACKET_CACHE` rollback flag — but keep separate fetch + assemble + types + window constants. The window alignment in `research-config.ts` is a manual sync point. One wrong window edit silently desyncs them.

2. **Two tool registries.** Native Mastra `createTool` registrations in `mastra-v2/tools/canonical/` and the legacy AI SDK `Tool` shims in `src/tools/` (kept for one release). `registerAllTools()` at `instance.ts:57` import-side-effects both. The barrel in `src/mastra/index.ts` re-exports `mastra-v2` with a deprecation warning. This transitional state is correct to keep in 2026-10 but needs a deletion date (the shims have no feature flag).

3. **God workflow.** `committee/workflow.ts` at 1,035 LOC owns two graphs (single-symbol and comparison) via `if (comparisonSymbols.length >= 2)` branching. Comparison steps rebuild a parallel specialist dep object by copying 12 fields from `deps`. Testing both graphs requires separate fixtures. Splitting into `committee/committee-workflow.ts` + `committee/comparison-workflow.ts` with a thin dispatcher would match the `mode-runner`’s own dispatch.

4. **Shared `storage.ts` at 520+ LOC** handling connection strings, SSL, retention, global cache, and maintenance helper after the D-01/C-01 ownership clarification. The split ownership (instance owns storage in normal operation, `getSharedMastraStorage` for cron/maintenance) is correctly documented but easy to violate without the barrel guard.

### 2.6 Logging system — 8.0 / 10

| Layer | Implementation | Verdict |
|---|---|---|
| Structured log stream | `packages/shared/src/logger.ts` — pino `TeeDestination` (stdout + `logStreamHub`), `LOG_CATEGORIES` (15 categories), `traceIdStorage`/`requestIdStorage`/`runIdStorage` via `AsyncLocalStorage`, `redactDiagnosticPayload` (key + string patterns), `logErrorContext` with `findErrorPattern` enrichment | ✅ Best-in-class for self-hosted |
| Mastra adapter | `mastra-v2/logger.ts` — `MastraPinoLogger implements IMastraLogger`, empty `listLogs`/`listLogsByRunId` (intentional: Kestrel owns persistence), `createRunLogger`/`logWorkflowStart/End/Error` with explicit `runId/workflowId/stepId` | ✅ Correct: framework logs ride the pino stream with trace correlation |
| Diagnostic context | `diagnostics/run-context.ts` — `withDiagnostics` wraps a turn in `AsyncLocalStorage<RunDiagnosticContext>`, `recordStep`/`completeStep`/`recordError`, `exportDiagnosticContext` | ✅ Per-turn trace, redacted at record time + final pass |
| Trace persistence | `diagnostics/trace-persistence.ts` — `persistTrace` to `diagnosticTraces` (upsert), `persistToFile` opt-in via `DEBUG_TRACE_PATH`, outbox on failure | ✅ Non-blocking: `Promise.allSettled` + `enqueuePersistenceFailure` |
| Redaction | `redactDiagnosticPayload` + logger `redact.paths` (30 paths) + scrubbing of `apiKey/secret/cookie/authorization` in `trace-persistence` | ✅ Dual-layer: logger + diagnostic redaction; secret string patterns cover `Bearer` + `api_key=` |
| Correlation gap | Logs carry `traceId` via ALS, Mastra logs carry `runId` explicitly, Langfuse traces carry `runId/userId/threadId` via `runTracingOptions`. **No join table between `diagnosticTraces.traceId` and `mastra.observation` Langfuse trace**. Admin viewer must open two lookups. | ⚠️ Medium: add `langfuseTraceUrl(runId)` + `traceId` to `finishMastraRun` payload and vice versa. |

**Not a bug:** `logger.ts:listLogs` returning empty is intentional — admin “Log viewer” reads `diagnosticTraces`, not Mastra log transport. Documented.

### 2.7 Finetuning & eval — 6.0 / 10

| Piece | What exists | Gap |
|---|---|---|
| Training export | `eval/training-export.ts` — `buildTrainingRecords` (hashes + tool names + terminal status + liveScores join) + `buildDatasetManifest` (counts + sha256) + `writeTrainingExport` (JSONL + manifest) | ✅ Vendor-neutral, PII-safe by default (`assistantText` only with `approvedBy`, redacted via `redactString`, sensitive detector blocks email/phone/credential) |
| Live scorers | `mastra-v2/evals/scorers.ts` — 5 prebuilt Mastra scorers (faithfulness, hallucination, answer-relevancy, bias, toxicity) at 5–10% sampling + 2 deterministic custom scorers (`kestrel-grounding` = report verifier, `kestrel-citation` = citation-oracle 0..1) | ✅ Grounded in real verifier; profiles `conversation` vs `research` share one `AGENT_SCORER_PROFILES` table (I-04) |
| Quality gate | `mastra-v2/evals/gate.ts` — `recordsToGateObserved` groups by `runId`, maps 7 scorer rows → one logical case, adapts to `eval/quality-gate.ts` thresholds | ✅ CI gate works for both legacy runner and Mastra `scores` domain |
| Drift & baselines | `eval/drift.ts`, `eval/baseline.ts`, `eval/annotation-resolver.ts` | ✅ Drift checks exist but are **offline** (`eval/runner.ts` posts to a running `/api/chat`). No scheduled cron drift job; no auto-alert on gate fail |
| Langfuse publisher | `eval/langfuse-publisher.ts` | ✅ Publishes dataset runs to Langfuse experiments |
| Automated fine-tune | None | ❌ `training-export` writes JSONL + manifest only. No trainer invocation, no prompt-tuning loop, no LoRA. The “fine-tuning” label in the audit request maps to this export + the nightly eval gate, not an automated fine-tune. |

**Honest labeling needed:** the archive docs that mention “fine-tuning” should say “training-set export for external fine-tuning” to avoid implying an automated loop that does not exist.

### 2.8 Optimizations & cost — 6.0 / 10

| Optimization | Detail | Verdict |
|---|---|---|
| 30s fresh-only packet cache | `packet-cache.ts:createPacketCache` — LRU (60 entries) + inflight dedup + Redis mirror (ioredis, lazyConnect) + bucket probing (3 buckets @15s) | ✅ High-value; burst-dedup is real. Bucket math is subtle (see bug B-02 below). `PHASE2_PACKET_CACHE=0` rollback is correct. |
| Indicator memo | `symbol-research.ts:computeIndicatorMemo` — 512-entry LRU keyed on `symbol:tf:kind:params:length:lastT:staleBit`, values sliced to last 8 | ✅ Cheap win. Stale-bit fix (B-06) landed in §4.6; LRU size is generous for one packet (4×5=20 keys). |
| Generation ledger | `generation-ledger.ts` — idempotent per-entry (`Map<id, entry>`, dupe `record` returns false), per-kind buckets (`primary/auxiliary/specialist/fusion/title/semantic-routing`), restored from snapshot for durable resume | ✅ Prevents double-billing on retry/resume. `convenience_committee` tool correctly uses a nested ledger then folds cost via `ctx.ledger.recordCost(committee:runId)` |
| Budget reservation | `cost.ts + budget.ts` — daily atomic reservation (`daily_ai_spend` + `ai_budget_reservations` via `ON CONFLICT DO UPDATE … WHERE`), `UNCAPPED_DAILY_USD = 1,000,000` when `ENFORCE_BUDGET != true`, reconcile on observed cost | ✅ Q4 decision (ledger-only by default) is correct for self-hosted UX; hard-cap is opt-in. Dual-row atomicity is the strong part. |
| Fallback classifier | `fallback.ts:classifyStreamError` — 401/403 auth, 429 rate-limit, 5xx upstream, context-overflow, timeout; XAUUSD path falls back to fast tier (not user’s flagship model) at `xauusd/context.ts` | ✅ M6 fix prevents `mistral-large` 120s reports blowing the 55s window |
| Prompt-caching hint | `model-helpers.ts:supportsPromptCaching` — model family allowlist | ⚠️ Not wired to token accounting; no cache-hit metric |

**Cost of guardrails & scorers:** each chat turn may invoke a fast-tier injection detector (`PromptInjectionDetector` via `guardrails.ts`) and, when sampled, hallucination/faithfulness judges. Both resolve via BYOK fast tier. On a 4-desk `full` turn that is ~5 LLM calls (4 specialists + fusion); guardrails + sampling add 0–1 extra. Acceptable, but the token budget should call this out.

---

## 3. Is the Agentic System “Multi-Symbol, Not Just XAUUSD?”

**Answer: the data path is multi-symbol; the research path is multi-symbol-capable; the reasoning depth is not.**

Evidence that it *is* multi-symbol:

- `ALL_SYMBOLS` from `@kestrel/shared/symbol-catalog.ts` includes forex majors, crypto, metals, indices. `extractSymbolsFromText` + `mastraComparisonScope` correctly extract up to 3 symbols and route to `multi-symbol-research` / `symbol-research`.
- `collectSymbolResearchPacket(symbol)` fetches real OHLC + indicators for any symbol via `getCandlesWithMeta(symbol, tf)` and `getPriceWithMeta(symbol)`.
- `collectMultiSymbolPackets` fans out via the same cache, deduplicates per symbol, and enforces `MAX_COMPARISON_SYMBOLS = 3` as a fail-closed backstop.

Evidence that it *isn’t* equally deep:

1. **Comparison is technical-only.** A 3-symbol compare runs 3 `technical` desks (one per symbol) + one cross-symbol fusion. No fundamental, risk, or sentiment desk per symbol. The four-desk deliberation that justifies “multi-agentic” is single-symbol only.
2. **Macro is XAUUSD-only.** The fundamental desk’s strongest evidence — DXY, real yields, breakeven, 10 events, 8 headlines — lives in `xauusdExtension` which only `symbol === 'XAUUSD'` gets. A EURUSD ask about ECB vs Fed divergence is answered from candles alone.
3. **Tool allowlists diverge.** `xauusd-research` tools are `get-xauusd-*` (locked), `symbol-research` tools are `collect-symbol-research-packet + get-symbol-seasonality/cot/intermarket-resonance + search-untrusted-*`. Seasonality/COT for BTC is a passthrough with no prompt speciality. XAUUSD report verifier is the only strong verifier; committee opinions have no equivalent programmatic check.
4. **Routing bias.** `XAUUSD_TERMS` + `OTHER_SYMBOL_TERMS` still frame “XAUUSD vs other” in `routing-policy.ts`. A prompt saying “analyze gold and bitcoin” correctly hits the comparison path, but “analyze EURUSD” without an explicit pair relies on the extractor; ambiguous prompts without a symbol fall through to `canonical-chat`.

**What “fully multi-symbol” would require:** per-symbol packet macro appropriate to the asset class (FX → DXY + yields per currency, crypto → BTC dominance + on-chain proxy, indices → VIX proxy), fundamental packet for comparisons, and at least a two-desk (technical + risk) compare, or document the single-desk scope explicitly if that is the v1 contract.

---

## 4. How Agents Read Data, Their Speciality, and Required Output Quality

### 4.1 Read path by agent

| Agent | Read path | Evidence budget |
|---|---|---|
| **Technical desk** | `requestContext.packet` → `serializeSymbolResearchPacket(packet)` interpolated into `instructionsForRequest` (not a tool call) | 12 most recent candles per timeframe + last 3 indicator values + `marketStructure` |
| **Fundamental desk** | Same packet + `xauusdExtension` when symbol=XAUUSD | Same slice + DXY/yields/events/news for XAUUSD; candles-only for others |
| **Risk desk** | Same packet | ATR14 + events blackout + packet warnings; no vol cone for generics |
| **Sentiment desk** | Same packet | News slice (XAUUSD) + packet timeframes; no COT/social for generics |
| **Critique author (per desk)** | Other desks’ `{bias, confidence, reasoning}` + same packet | Reasoning + confidence recalibration |
| **Fusion** | All opinions + all critiques + packet warnings + missingData | Unified answer + bias/confidence + scenarios with triggers/invalidations |
| **XAUUSD research agent** | `XauusdResearchPacket` via `contextForRun` | Full verified packet; generates structured `XauusdResearchReport` under `XauusdResearchReportSchema` |
| **Canonical chat agent** | Tools (`get_candles`, `get_price`, `get_indicators`, `search_knowledge`, `get_news`, `get_calendar`, etc.) — agent decides which to call | Up to `maxSteps` (6) tool calls per turn, then streams |
| **Convene-committee (inside chat)** | `collectSymbolResearchPacketCached(symbol)` deterministically + committee workflow as above | 4 opinions + fusion, then `computeGradeAndGoNoGo` renders a `ConveneCommitteeOutput` card (`A/B/C/D`, `go/caution/no-go`) |

### 4.2 Speciality contracts (from `committee/prompts.ts` + `tools/*.ts`)

Speciality is prompt-contract, not tool-contract. Each specialist’s `instructionsForRequest` bakes `SPECIALIST_GOALS[desk] + SPECIALIST_PLAYBOOK[desk]` and the serialized packet. No specialist calls tools; all evidence is packet-provided. This is intentional (grounding), but it caps depth at what the packet chose to include (4 TTFs × 5 indicators × price × market-structure + XAUUSD macro). A specialist needing an unpacketed view (e.g. COT for USDJPY) cannot get it without a new packet field.

### 4.3 Output quality bar — what each agent must emit

| Output | Required fields (for “full quality” per §2.2) | Current guarantee |
|---|---|---|
| `MastraModeOpinion` | `bias` (bull/bear/neutral), `confidence` 0–1, `reasoning` (≥1 sentence), `details.keyLevels` (support/resistance/trigger/invalidation with price + evidenceId), `details.assumptions`, `details.missingEvidence` | `bias/confidence/reasoning` guaranteed; `details.*` optional — gaps not enforced |
| `CommitteeCritique` | `confirms` bool, `revisedConfidence`, `critique` ≥1 sentence | Guaranteed (`CritiqueSchema`) |
| Fusion `finalText` | Bias + confidence + key levels + scenarios + invalidation + risk + disclosure of `missingData/warnings` | Enforced by synthesizer instructions + `fusion-verifier` (XAUUSD) but lightweight for committee |
| `XauusdResearchReport` | `evidenceIds`, `numericClaims` with `evidenceId`, `sources`, `scenarios[]` with `evidenceIds`, safety/temporal checks | Strictly enforced (`report-verifier.ts`: evidence-id check, `verifyNumericClaims` via role label, `verifyScenarioProjectionClaims` band check, `verifyTemporalDisclosure`) + repair loop |
| `ConveneCommitteeOutput` | `symbol/side/entry/stop/target`, 4 `verdicts[]` with keyPoints/risk/recommendation, `grade`, `goNoGo`, `consensus` | `buildPacketGroundedFallbackVerdicts` guarantees a packet-grounded fallback even when LLM fails (deterministic ATR + EMA/RSI heuristics) — strong. `computeGradeAndGoNoGo` thresholds scale with verdict count (good). |

**Quality takeaway:** XAUUSD report quality is *proven* programmatically; committee quality is *prompted* and only sampled by LLM judges. Closing that verifier gap for committee opinions is the highest-leverage quality fix.

---

## 5. Logging, Finetuning & Optimizations — Deep Read

### 5.1 Logging — what to keep, what to add

Keep: pino TeeDestination + ALS correlation + diagnostic context + `MastraPinoLogger` adapter + trace persistence with outbox. This is ahead of typical self-hosted apps.

Add (small, high-value):

- **Log↔trace join** — `finishMastraRun` already has `runId, userId, threadId`; persist `traceId` alongside it and include `runId` in `diagnosticTraces.trace` so the admin run viewer deep-links to `langfuseTraceUrl(runId)` and vice versa.
- **Budget ledger → log** — `acquireBudget` returns `effectiveCap`; log the `spent/max/effectiveCap` tuple once per turn so “why didn’t the budget block?” has a one-line answer.
- **Packet-cache hit rate dashboard** — `packet_cache_hit_total / packet_cache_miss_total` already emit via `metrics`; add a Grafana/Langfuse panel or at least an admin `/api/admin/health-slo` counter.

### 5.2 Finetuning — honest scope

The system does **not** fine-tune models automatically. It *prepares* for external fine-tuning by exporting vendor-neutral records. If the product intends “fine-tuning” as a claim, reword to “training-set export” or build the loop (rated as a Phase C task below). The current export is strong enough to be the fine-tune source of truth — just not a loop.

### 5.3 Optimizations — what’s worth it

Worth keeping verbatim: packet cache (30s bucket + Redis mirror + inflight dedup), indicator memo, generation ledger, budget reservation.

Worth refining:

- **Bucket probing (B-02)** — 15s buckets probed at depth 3 can return a 45s-old packet that passed its `storedAt + 30s` TTL check only because `storedAt` was near the bucket end. TTL enforcement on `lruGet` mitigates it, but the probe depth adds needless Redis reads. Recommend probe depth = 2 (current bucket + previous) with the TTL as the sole freshness arbiter, and document the invariant: *freshness is TTL, not bucket*.
- **Guardrail model reuse** — `buildGuardrailInputProcessors` resolves a fast-tier model per turn via BYOK; the same model is already resolved as `resolution.modelId` in `mode-runner`. Passing it in avoids a second `resolveChatModel` call.
- **Observational memory allowance** — `observationalMemoryAllowanceUsd` is well-modeled (2 refinements × $0.004). Make the per-turn ledger pre-charge it when `forceObservationalMemory` is on, so the budget trace shows it.

---

## 6. Bugs, Mistakes & Reliability Findings

### 6.1 Confirmed issues (evidence-linked)

| ID | Severity | Location | Finding | Fix |
|---|---|---|---|---|
| **B-02** | Medium | `packets/packet-cache.ts:get` | Probe depth 3 + 15s buckets + 30s TTL can keep a packet nominally fresh up to 45s via cross-bucket Redis read that bypasses the TTL’s intent. `lruGet` TTL mitigates for local store, but Redis reads for depth=2 still bypass the 30s window when `storedAt` is stale but not yet GC’d. | Reduce `CACHE_PROBE_DEPTH` to 2; keep `PACKET_CACHE_TTL_MS` as the only freshness gate; add assertion `probeKeys.length === 2`. |
| **I-01** | Low | `packets/symbol-research.ts:computeIndicatorMemo` | Key omits `producedAt`; two packets with identical `length/lastT` but different candle closes (intra-bar tick) reuse prior indicator values. Rare (candles close on fixed boundaries). | Add `producedAt` or candle open hash to key, or simply bust on `freshness === 'stale'` (already via staleBit). |
| **D-01** | Medium | `mastra-v2/workflows/xauusd-report.ts:generateStep` | `a bail()` on `packet.status === 'blocked'` returns a terminal `blocked` output, but `finalize` still computes `packet` via `getStepResult('collect-packet').packet`. When `collect-packet` bailed, `getStepResult('collect-packet')` may return the bail payload (workflow impl detail) rather than a step result — correct today on Mastra, fragile on upgrade. | Read `packet` from bail payload explicitly or make `collect-packet` return a normal output with `status: 'blocked'` instead of `bail()`. |
| **F-01** | Medium | `committee/workflow.ts:246-290` (comparison) | Comparison verdict falls back to `missingData` wall text via `bail()` when any symbol’s packet is blocked; but the comparison `finalize`/fusion is never reached, so a single blocked symbol blocks the whole comparison even when the other symbols are healthy. | Return `packets: partial` plus per-symbol `blocked` flag, let fusion note the gap and compare the healthy subset. |
| **F-02** | Medium | `tools/convene-committee.ts:buildPacketGroundedFallbackVerdicts` | Fallback synthesizes `econVerdict/techBias/riskVerdict` from live indicators without calling `verifyNumericClaims`-style checks. A service that renders `ConveneCommitteeOutput` without LLM could show deterministic-looking levels that bypass the “no unsupported numerics” policy. | Document fallback as *heuristic, not verified* in `consensus` prefix; optionally gate fallback behind `packet.dataQuality === 'complete'`. |
| **C-02** | Low | `model.ts` barrel re-exports | `envFallbackKeys` and `parsePickedModelId` are internal but sibling modules import them directly from `model-helpers.ts`, bypassing the barrel. Not a bug, but makes the barrel lie about the API surface. | Re-export explicitly or mark as `@internal`. |
| **N-01** | Low | `diagnostics/run-context.ts:withDiagnostics` | `recordError` is called for every caught exception including `AbortError` from deadline/cancel. A 45s deadline abort records an error even though the caller surfaces `MastraModeStrictFailureError` — double-counts aborts in error telemetry. | Skip `recordError` for `AbortError`/deadline aborts. |

### 6.2 Not bugs (verified, no fix needed)

- Empty `listLogs` on `MastraPinoLogger` — intentional; admin reads `diagnosticTraces`.
- `getSharedMastraStorage` barrel removal (D-01/C-01) — correct: instance owns storage, helper is maintenance-only; the global cache is HMR-safe via `globalThis`.
- `withToolContext` nesting in `convenience_committee` — correct: nested ledger prevents double-count id collisions, folded via `committee:runId`.

### 6.3 Prior deep-dive bugs still worth confirming

The 2026-10-18 deep-dive testing/build/performance audit flagged worker shutdown ordering, `auth()` DB round-trip cost, and telemetry transaction width. Those are outside the agentic surface but still apply — verify after the worker’s next change that `closeDb` stays after `stopScheduler` in `apps/worker/src/index.ts:416-491`.

---

## 7. Over-Engineering & Maintainability Verdict

**Is anything over-engineered?** Yes — three places where the cure is heavier than the disease, and none where cutting would lose capability.

| Over-engineered area | Why it feels heavy | Cheaper alternative without losing capability |
|---|---|---|
| **Two packet schemas** (`SymbolResearchPacket` + `XauusdResearchPacket`) | Two Zod schemas, two fetch paths, two window tables, manual `research-config.ts` sync, one shared cache that papers over the split | Keep both schemas (Q6) but unify the *fetcher*: one `fetchCandlesForPacket(symbol, windows, signal)` that both assemblers call. Windows defined once. Saves ~120 LOC and one drift class. |
| **Committee workflow god-class** | 1,035 LOC, two graphs in one function, field-by-field dep copy for comparison steps, `asParallelSteps` cast | Split `committee/workflow.ts` → `committee/workflow-shared.ts` (helpers) + `committee/single-workflow.ts` + `committee/comparison-workflow.ts`; `mode-runner` dispatches on `comparisonSymbols.length`. Each file <400 LOC, each test fixture only covers one graph. |
| **Training export + drift baseline + eval gate triplication** | `eval/training-export.ts` + `eval/drift.ts` + `eval/baseline.ts` + `mastra-v2/evals/gate.ts` wrap the same thresholds/observed shape with different groupings | Collapse `gate.ts`’s `recordsToGateObserved` to delegate directly to `eval/quality-gate.ts:evaluateEvalQualityGate` (already does) and make `drift.ts` a consumer of `training-export`’s `liveScores`, not a parallel scorer. The split is correct for vendor-neutral export, but the two gates should not each own threshold constants. |

**Not over-engineered (keep as-is):**

- Packet cache + Redis mirror + rollback flag (`PHASE2_PACKET_CACHE`) — the complexity earns its keep on market-open bursts; rollback is cheap safety.
- Generation ledger idempotency — retry/resume budgets would double-bill without it; the Map is tiny and correct.
- Capability manifest + registry + execution plan — the 6-capability table *is* the security boundary. Keeping it explicit is cheaper than debugging implicit tool leakage.

---

## 8. Improvement, Polish & Upgrade Opportunities

### 8.1 Must-have (P0) — required for “multi-symbol” claim to be honest

| ID | Work | Files | Acceptance |
|---|---|---|---|
| **M-01** | Clarify comparison scope in product copy and system prompt: “compare” returns one technical desk per symbol + cross-symbol fusion, not per-symbol 4-desk committees | `committee/prompts.ts`, docs, landing copy | UI shows “Synthesis across 3 technicians” not “3× committees”; docs call out the scope |
| **M-02** | Supply a **generic macro packet** for non-XAUUSD symbols (at least `news + calendar + COT` via packet, not via tool) so the fundamental/risk desks are not candle-only for forex/crypto | `packets/symbol-research.ts` (new `GenericMacroExtension`), `packets/research-packet-macro.ts` | EURUSD `full` turn yields non-empty `assumptions` + `missingEvidence` on fundamental/risk opinions; no new XAUUSD-only code path |

### 8.2 High-value enhancements (P1)

| ID | Work | Files | Acceptance |
|---|---|---|---|
| **P1-01** | Add `verifyCommitteeOpinion` (light `report-verifier` analog: reject unsupported numeric claims via `evidenceIds`, require temporal disclosure when `packet.warnings` non-empty) — fail the specialist step, not the whole workflow, so the judge can normalize grounding without inventing repair loops | `committee/verifier.ts` (new), `specialist-runner.ts` | A specialist emitting “price at 2,002” without an `evidenceId` is retried once then marked failed; unit test covers the path |
| **P1-02** | Fix **B-02** (probe depth 3 → 2) + add invariant test that no packet older than `TTL_MS` can be returned from cache | `packets/packet-cache.ts` + test | `packet cache returns stale after TTL` test passes at TTL±1ms |
| **P1-03** | Fix **F-01** (partial comparison on blocked symbol): let comparison run with healthy subset + explicit gap in fusion | `committee/workflow.ts:comparisonCollectStep`, `synthesizer.ts:synthesizeComparisonAnswer` | Compare `["XAUUSD","BROKEN"]` where BROKEN returns `blocked` still yields 1 opinion + `missingData` disclosure |
| **P1-04** | Give comparison a second desk (risk) — `technical + risk` per symbol, 6 LLM calls per comparison instead of 3. Cost ~2× for comparisons only; quality meaningfully higher. | `committee/workflow.ts` (comparison branch), `types.ts:comparison` specialists | Comparison output contains `risk`-tagged opinions (`agentName: 'risk', symbol`) and fusion references them |
| **P1-05** | Wire `supportsPromptCaching` to accounting — emit `prompt_cached_tokens` / `cache_hit` metric so the operator can attribute the savings | `model-helpers.ts`, `mastra-v2/shared/telemetry.ts` | Metric visible in Langfuse payload + pino log |

### 8.3 Polish & cleanups (P2)

| ID | Work | Files |
|---|---|---|
| **P2-01** | Delete `src/tools/` shims on a dated commit (they are one-release compat). Gate with `PHASE_TOOLS_SHIMS=0` first, then remove. | `packages/ai/src/tools/*.ts` shims vs `mastra-v2/tools/canonical/*` |
| **P2-02** | Extract `fetchCandlesForPacket(symbol, windows)` shared helper so `symbol-research.ts` and `research-packet.ts` stop duplicating candle fetch | `packets/research-packet-fetch.ts` |
| **P2-03** | Guardrail model reuse: pass `resolution.model` into `buildGuardrailInputProcessors` instead of re-resolving fast tier inside guardrails | `mastra-v2/guardrails.ts`, `planning/mode-runner.ts`, `agents/canonical/index.ts` |
| **P2-04** | Skip `recordError` for `AbortError`/deadline in `diagnostics/run-context.ts` (N-01) | `diagnostics/run-context.ts` |
| **P2-05** | Make fallback verdicts explicitly heuristic: prefix `consensus` with “Heuristic review (no LLM) —” when `convene_committee` falls through to `buildPacketGroundedFallbackVerdicts` | `tools/convene-committee.ts` |
| **P2-06** | Add `langfuseTraceUrl(runId)` to `diagnosticTraces` deep-link set (log↔trace join) | `mastra-v2/shared/telemetry.ts`, `diagnostics/trace-persistence.ts` |
| **P2-07** | Tighten turbo/dist hygiene flagged by prior audit (B1/B5/B6): declare `public/sw.js` as web output, `.dockerignore` `**/dist`, `sourcemap: false` for worker prod | `turbo.json`, `.dockerignore`, `apps/worker/build` |

---

## 9. Implementation Plan for the Executing Agent

> **Agent instructions:** you are the *implementer*. Do not re-audit. Execute the plan below in order. Every phase ends with `pnpm typecheck && pnpm lint && pnpm test` (skipping only `RUN_PG_TESTS` suites when DB is unavailable) and a green `check:route-security`. Commit after each phase with a conventional prefix. No no-value tests — every test must assert a failure mode that the fix *eliminates*.

### Remediation tracking

Status: ⬜ pending · 🟨 in progress · ✅ done (linked to the fixing commit).

| Phase | Scope | Status | Commit |
|---|---|---|---|
| 0 | Scaffolding: `ENABLE_GENERIC_MACRO`, audit-to-git, architecture.md reference | ✅ | `c2690239` |
| 1 | B-02, I-01, N-01, F-01 | ✅ | `fc700e1c` |
| 2 | M-01 (comparison scope copy), M-02 (generic macro packet) | ✅ | `6fabe290` |
| 3 | P1-01 (committee opinion verifier), P1-04 (comparison risk desk) | ✅ | `3b9c2f6b` |
| 4 | P2-02 (shared candle fetcher), P2-03 (guardrail model reuse), god-workflow split | ✅ | `e699bf76` |
| 5 | P2-05 (heuristic consensus), P2-06 (log↔trace join), P2-01 (tool shims) | 🟨 | — |
| 6 | Verification: coverage floors, knip, route security, Studio smoke | ⬜ | — |

### Phase 0 — Scaffolding (0.5 day)

- Create a feature flag `ENABLE_GENERIC_MACRO` (default `true` in dev, `false` in prod until M-02 lands) so later merges stay safe.
- Add `docs/audits/mastra-agentic-deep-audit-2026-10-18.md` (this file) to git and reference it in `docs/architecture.md` changelog line.

### Phase 1 — Bugs that pay back immediately (P0-adjacent, 2 days)

1. **Fix B-02 + I-01 + N-01.**
   - Edit `packets/packet-cache.ts:probeKeys` to depth 2, update `CACHE_PROBE_DEPTH` constant and its JSDoc, add a focused unit test `packet-cache-probe.test.ts` that asserts TTL-bound freshness (no packet >30s old).
   - Add `producedAt` or candle hash to `computeIndicatorMemo` key *only if* a reproduction test can show a collision within a 30s window; otherwise add a test that documents the invariant and leave the key as-is (prevents no-value churn).
   - Edit `diagnostics/run-context.ts:withDiagnostics` to skip `recordError` when `err.name === 'AbortError'` or `isDeadlineAbort`.
   - Tests: 2–3 new tests total, each with a “would have failed before” variant.
2. **Fix F-01 (partial comparison).**
   - Change `comparisonCollectStep` to partition `packets` into `healthy` vs `blocked`; `bail()` only when *all* blocked; otherwise pass `packets: healthy` + `blockedSymbols: string[]` into the specialist steps and fusion prompt.
   - Update `synthesizeComparisonAnswer` prompt fragment to include “Data unavailable for: {blockedSymbols.join(', ')}”.
   - Test: `"compare XAUUSD + BROKEN returns 1 opinion with blocked disclosure"` (mock `collectSymbolResearchPacket` to return one ready, one blocked).

### Phase 2 — Multi-symbol honesty (M-01 + M-02, 5–7 days)

1. **Product copy + UI label (M-01).**
   - Edit `committee/prompts.ts:synthesizeComparisonAnswer` preamble and the `ConveneCommitteePart`/alert copy to state “Single-desk per symbol + cross-symbol fusion” explicitly. No logic change.

2. **Generic macro packet (M-02).**
   - New type `GenericMacroExtension { news: Headline[], events: CalendarEvent[], cot?: CotRow[] }` alongside `XauusdExtension` in `packets/symbol-research.ts`.
   - New fetcher `fetchGenericMacroData(symbol, signal)` that reuses existing data adapters: `get_news(symbol)` (2 headlines), `get_calendar(symbol’s currencies)` (next 5 events), and `get_cot(symbol)` where available (gracefully null for crypto).
   - Wire `collectSymbolResearchPacket(symbol, { includeMacro: symbol !== 'XAUUSD' })` to call it; gate behind `ENABLE_GENERIC_MACRO`.
   - Packet cache predicate `isFreshCacheablePacket` already gates on `warnings/missingData`; no change needed — degraded macro just adds warnings.
   - Specialist prompts: add a conditional `macroForSymbol` block in `prompts.ts:instructionsForRequest` so fundamental/risk/sentiment desks see headlines+events for non-XAUUSD. Keep the injection to a compact bullet list (≤8 lines) to bound tokens.
   - Tests: **contract test** — `collectSymbolResearchPacket('EURUSD', {includeMacro:true})` returns `genericMacro.events.length >0 OR warnings include 'macro unavailable'` (never throws); plus a packet snapshot update.
   - Rollback: `ENABLE_GENERIC_MACRO=0` reverts to prior candle-only behavior (no code removal).

- **Documentation counterpart:** update `docs/architecture.md` packet diagram to show `symbol_research_packet { price, timeframes[4], indicators[5], marketStructure, (xauusdExtension | genericMacro) }`.

### Phase 3 — Agentic depth (P1-01 + P1-04, 3 days)

1. **Committee opinion verifier (P1-01).**
   - New file `committee/verifier.ts:verifyCommitteeOpinion(opinion, packet): string[]` — mirrors `report-verifier` but lightweight: check every `numericClaims` price mention has an `evidenceId` in `availableEvidenceIds(packet)`, and any mention of packet warning keywords (“stale”, “missing”) has a disclosure sentence. Return findings; `specialist-runner.ts` retries the specialist once on findings (bounded), then marks it `failed`.
   - Do **not** add a repair loop — one retry is enough for a specialist; the committee’s strict failure already surfaces the gap.

2. **Comparison second desk (P1-04).**
   - Change comparison branch to `specialistsForComparison = ['technical','risk'] as const` (risk is the highest-leverage second desk for comparables; fundamental would require per-symbol news corpus rank — defer). This makes a 3-symbol compare 6 calls + fusion (from 3+fusion). Keep `SPECIALISTS_BY_MODE` unchanged for single-symbol.

### Phase 4 — Structural paydown (P2-02 + P2-03 + god-workflow split, 3 days)

1. **Shared candle fetcher (P2-02).**
   - Extract `fetchPacketCandles(symbol, windows, signal): Promise<Map<Timeframe, CandleFetchResult>>` from both `research-packet-fetch.ts` and `symbol-research.ts` into `packets/candle-fetcher.ts`. Both callers import it; windows remain in `research-config.ts`.
   - Proof: `rg "getCandlesWithMeta"` shows exactly one definition site after.

2. **Guardrail model reuse (P2-03).**
   - Thread `resolution.model` (already resolved in `mode-runner`/`canonical/index.ts`) into `buildGuardrailInputProcessors({ ... , model })` so the detector reuses instead of re-resolving fast-tier. Keep the env fallback inside guardrails for paths without a pre-resolved model (legacy callers).

3. **Split the god workflow.**
   - `workflow.ts` → `committe-shared.ts` (policy + progress + helpers) + `single-workflow.ts` + `comparison-workflow.ts` + `index.ts` dispatcher `createCommitteeWorkflow(deps, mode, id) -> Workflow`.
   - Each new file enforces `max 400 LOC`; existing integration tests run unchanged (the dispatcher is transparent).

### Phase 5 — Observability & cleanup (P2-05 + P2-06 + P2-01, 1 day)

- Prefix heuristic consensus (P2-05), add log↔trace join (P2-06), then remove legacy shims behind a flag then by deletion (P2-01). The shim removal needs a one-release deprecation window — add an entry to `CHANGELOG.md`.

### Phase 6 — Verification (0.5 day)

- Run `pnpm test:coverage` and confirm per-workspace floors hold (ai 65% global, data 70%, etc.); `knip` clean; `check:route-security` passes; one manual `full` vs `single` compare in Studio at `http://localhost:4111` with `MASTRA_STORAGE=libsql` showing two technical opinions + fusion text.

**Out of scope for this plan:** automated fine-tune loop, vector RAG re-rank tuning, worker shutdown/DB pool fixes (tracked by the prior audit), E2E CI rebuild.

---

## 10. Testing Guidance (no-value-test guard)

- Do not add tests that only assert a file exists, a schema round-trips, or a mock was called.
- Every new test must encode a failure that would have passed before the fix: stale packet returned after TTL, comparison blocked-by-one, missing evidenceId caught by `verifyCommitteeOpinion`, guardrail model resolved twice, etc.
- Prefer one integration test over three unit tests when the integration test covers the contract end-to-end (e.g. packet collect → memo → cache → ledger).
- Delete or quarantine any test that never exercises a branch (keep the suite green, not inflated).

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Generic macro fetch slows `full` turn (two providers) | Run `fetchGenericMacroData` in the same `Promise.all` as price/candles — budget is already concurrent; cache macro for 30s alongside packet; observe `mastra_setup_latency_ms{phase=packet}` |
| Comparison second desk doubles cost (3 symbols → 6 LLM calls) | Gate `P1-04` behind `ENABLE_COMPARISON_RISK_DESK`; operator can keep single-desk compares where cost matters |
| Verifier retry adds latency | One bounded retry per specialist (max 1); `deadlineSignalFor(COMMITTEE_DEADLINE_MS)` already cancels late retries; budget for it is pre-charged |
| Packet cache depth reduction regresses hit rate | Depth 2 still covers the 30s window (two 15s buckets); monitor `packet_cache_hit_total` for one deploy week before removing depth-3 fallback |

---

## 12. Appendix — Evidence Map

| Claim | Source file & line |
|---|---|
| Capability manifest (6 caps) | `mastra-v2/capabilities/index.ts:MASTRA_CAPABILITIES` |
| Registry completeness check | `mastra-v2/registry.ts:assertMastraRegistryComplete` |
| Two-mode contract single|full | `mastra-v2/planning/routing-policy.ts:autoDetectMode, resolveMode` |
| Comparison cap 3 | `mastra-v2/shared/constants.ts:MAX_COMPARISON_SYMBOLS = 3` + `packets/packet-cache.ts:MAX_COMPARISON_SYMBOLS` |
| Instruction function pattern (packet via requestContext) | `committee/prompts.ts:32` + `mastra-v2/agents/xauusd/report/report-generation.ts` |
| Specialist goals & playbooks | `committee/prompts.ts:SPECIALIST_GOALS` |
| Strict all-or-nothing (Q3) | `committee/types.ts:MODE_POLICY` all `strict: true` + `mastraModeStrictFailureError` |
| Committee graph & comparison branch | `committee/workflow.ts:244-350` |
| Packet windows & indicators | `packets/symbol-research.ts:RESEARCH_TIMEFRAMES/RESEARCH_INDICATORS` |
| Fresh-only cache predicate | `packets/packet-cache.ts:isFreshCacheablePacket` + `packets/research-packet.ts:isFreshCacheableXauusdPacket` |
| Budgets & ledger | `cost.ts:RATES + tryReserveBudget`, `budget.ts:UNCAPPED_DAILY_USD`, `generation-ledger.ts` |
| Fallback & XAUUSD fast-tier pin | `fallback.ts`, `mastra-v2/agents/xauusd/context.ts:resolveXauusdMastraModel` |
| Guardrails (Unicode + PromptInjectionDetector) | `mastra-v2/guardrails.ts` |
| Evals & gate | `mastra-v2/evals/{scorers,gate,custom}.ts` + `eval/training-export.ts` |
| Logger + trace correlation | `packages/shared/src/logger.ts:traceIdStorage/requestIdStorage/runIdStorage` + `mastra-v2/logger.ts:MastraPinoLogger` + `diagnostics/run-context.ts:withDiagnostics` |
| Architecture spine asserted in CI | `scripts/check-architecture-tree.mjs` vs `docs/architecture.md` tree |

---

*End of audit — implement via §9 in order. When a phase’s acceptance is green, update the corresponding tri-state checkbox in `docs/audits/mastra-agentic-deep-audit-2026-10-18.md` (⬜/🟨/✅) and link the fixing commit SHA.*
