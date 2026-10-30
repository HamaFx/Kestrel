# Kestrel Logging, Debugging, Telemetry, Jev Decision Models & Training Systems — Master Audit & Roadmap

**Date:** October 29, 2026  
**Repository Audited:** `hamafx/kestrel` (`/home/ubuntu/Kestrel`)  
**Status:** Architectural Decisions Locked by Hama — Ready for Agent Execution Across Phases 1–4

## Master Roadmap Index

This audit is paired with four self-contained, agent-executable implementation plans written in Kestrel's `docs/audits/` + `superpowers:writing-plans` format:

1. **`10_Roadmap_Phase1_Diagnostic_Traces_Run_Telemetry_And_Cost_Histograms.md`** — Fixes the missing `withDiagnostics` scope on `canonical-chat`, synchronous `symbol-research`, `multi-symbol-research`, and `@handle` custom-agent routes; fixes `run-telemetry.ts` hardcoding `kestrel-xauusd-research-poc` across all Mastra runs; introduces dedicated USD cost histogram buckets (`HISTOGRAM_BUCKET_BOUNDS_USD`) for `turn_cost_usd` and `committee_step_cost_usd`; and fixes `validateTelemetryStartup` + Langfuse deep-link correlation.
2. **`11_Roadmap_Phase2_Admin_Health_SLOs_Legacy_Table_Purge_And_Cleanup.md`** — Fixes the Critical Admin System Health `queryChatAggregate` bug (`WHERE kind IS NULL` always returning `0` turns and forcing `degraded` status); removes the retired "Sentiment Specialist" SLI card (`Decision 2B`); drops unused legacy tables `ai_shadow_comparisons` and `ai_quality_results` via migration `0118` (`Decision 1A`); and removes dead shadow metrics, retired `TELEMETRY_KINDS`, and orphaned `logForAgent` / `traceQuery` helpers.
3. **`12_Roadmap_Phase3_Jev_Comparison_Calibration_Regime_Outcomes_And_BYOK_UI.md`** — Adds `enrichPacketForUser` and per-symbol `scorePacketWithJev` calibration to the multi-symbol comparison workflow (`comparison-workflow/collect-step.ts`); adds `positioning_bias` to `scorePacketWithJev` so the `sentiment` desk gets a dedicated COT/macro anchor; wires `opinion-calibration.ts` to update `rememberMarketRegime` with realized 4-hour outcomes (`OUTCOME_4H`, `MFE`, `MAE`); fixes `_actions-api-keys-save.ts` and `_actions-api-keys-transfer.ts` wiping non-chat BYOK keys (`opencode`, `liquid`, `typesafe`, `finnhub`); and adds the **Jev Decision Model Keys** section to Settings → API Keys (`Decision 4A`).
4. **`13_Roadmap_Phase4_Training_Export_Jev_Rubric_Gate_And_CI_Eval_Harness.md`** — Unifies manual Admin dataset export (`POST /api/admin/eval-datasets/export`) and nightly worker export (`dataset-export.ts`) so clicking "Export now" writes `dataset.jsonl`, `manifest.json`, and `jev-rlcd.jsonl` with real tool calls joined from `chat_tool_telemetry` (`Decision 3A`); upgrades `recordsToGateObserved()` (`mastra-v2/evals/gate.ts`) to enforce all 5 Jev rubric dimensions (`faithfulness`, `answerRelevancy`, `noHallucination`, `unbiasedScenarios`, `nonToxic`); and fixes `eval-gate.ts` + `.github/workflows/evals-nightly.yml` with a tracked baseline artifact.

---

## Locked-In Architectural Decisions (Approved by Hama)

| # | Decision Area | Locked Choice | Rationale |
| :--- | :--- | :--- | :--- |
| **1** | **Unused Legacy Database Tables (`ai_shadow_comparisons` & `ai_quality_results`)** | **Option A — Remove Cleanly** | Zero production code writes to `ai_shadow_comparisons` or `ai_quality_results` (only retention and account-deletion touch them). Drop both tables in Drizzle migration `0118_drop_legacy_shadow_and_quality_tables.sql`, remove their schema/query files, and delete dead `mastra_shadow_*` metrics. |
| **2** | **Sentiment Specialist Health Card on Admin Dashboard** | **Option B — Remove Single-Desk Card** | `queryOperationalAggregate` queried retired pre-Mastra `multi_specialist_sentiment` telemetry kinds, leaving the card permanently `null`. Remove the single-desk card from `probe-queries.ts`, `probe-types.ts`, `anomaly-builder.ts`, and `sli-builder.ts`; `full_mode_completion` already tracks the committee. |
| **3** | **Admin "Export Now" Training Dataset Button (`/api/admin/eval-datasets/export`)** | **Option A — Full File + RLCD + Tool-Call Export** | Clicking "Export now" in Admin previously discarded `jsonlContent` and only inserted a metadata row in Postgres. Unify it with the worker pipeline so manual exports enrich feedback pairs with `chat_tool_telemetry` tool names, write `dataset.jsonl`, `manifest.json`, and `jev-rlcd.jsonl` to `DATASETS_DIR/<version>/`, and trigger optional Langfuse/B2 publishing. |
| **4** | **Jev Decision Model API Keys in Settings UI** | **Option A — Add Jev Provider Inputs & Preserve Keys** | Fix `updateApiKeysAction` and `importKeysAction` so saving/importing chat LLM keys never wipes `opencode`, `liquid`, `typesafe`, or `finnhub` keys on `ByokPayload`, and add a dedicated **Decision Model Keys (Jev System One)** card in Settings → API Keys for **OpenCode (`jev-1.13-free`)**, **Liquid AI (`d1-ultra` / `d1.1`)**, and **TypeSafe AI (`jev-latest`)**. |

---

## End-to-End Scorecard & Architecture Audit Summary

| Subsystem | Current Rating | Target Rating (Post-Roadmap) | Key Strengths | Key Bugs & Gaps Remediated by Phases 1–4 |
| :--- | :---: | :---: | :--- | :--- |
| **1. Logging & Redaction** (`packages/shared/src/logger`, `bug-report.ts`, `mastra-v2/logger.ts`) | **8.5 / 10** | **9.8 / 10** | Single Pino JSON pipeline across web, worker, and Mastra (`MastraPinoLogger`); 29 redaction paths + regex secret scrubbing; `AsyncLocalStorage` correlation stores (`traceIdStorage`, `requestIdStorage`, `runIdStorage`). | Missing `withDiagnostics` scope on 3 of 4 web chat routes drops `traceId`/`runId` from logs; `run-telemetry.ts` logs every chat/mode run as `"Mastra XAUUSD run started"`; `logForAgent` is unused dead code. |
| **2. Debugging & Dev Flows** (`log-stream.ts`, `diagnostics/`, Admin Trace Explorer & Mastra Runs) | **7.8 / 10** | **9.7 / 10** | Dev SSE log streaming (`LogStreamHub`), Admin Trace Explorer timeline across 6 tables, Mastra Runs Viewer with step-failure cause extraction, and 1-minute `persistence_outbox` recovery. | `canonical-chat`, synchronous `symbol-research`, `multi-symbol-research`, and `@handle` custom-agent streams never call `withDiagnostics`, writing **0 `diagnostic_traces` rows** and leaving `traceId: null`; Langfuse deep links mismatch `runId` vs `traceId`. |
| **3. AI, Agentic & Decision Models** (`packages/ai/src/jev`, `committee/`, `mastra-v2/`) | **9.0 / 10** | **9.9 / 10** | Full Jev System One layer (`opencode-free`, `vercel-gateway`, `liquid`, `typesafe`, `openrouter`) for 1-pass turn routing, `When2Call` tool pruning, input guardrails, pre-specialist packet calibration, post-Wave-1 consensus gating, RAG indirect-injection quarantine, semantic disclosure verification, and Brier-weighted fusion. | `comparison-workflow/collect-step.ts` skips `enrichPacketForUser` and `scorePacketWithJev`; `jev-packet-scorer.ts` lacks a dedicated `positioning_bias` question for the `sentiment` desk; `opinion-calibration.ts` grades 4h outcomes but never updates `rememberMarketRegime` with `OUTCOME_4H`; saving BYOK keys in Settings wipes `opencode`/`liquid`/`typesafe`/`finnhub`. |
| **4. AI Fine-Tuning, Training & Evals** (`packages/ai/src/eval`, `mastra-v2/evals`, `dataset-export.ts`) | **8.2 / 10** | **9.7 / 10** | 100% live turn scoring via `kestrel-jev-rubric`; governed `kestrel.eval-record.v1` and contrastive `kestrel.jev-rlcd.v1` exports with PII/credential refusal guards; Admin feedback review queue auto-syncing failures to `ai_regression_cases`. | Admin `POST /api/admin/eval-datasets/export` drops `jsonlContent` and never writes `dataset.jsonl` or `jev-rlcd.jsonl`; feedback pairs have empty `toolCalls: []` in RLCD exports; `recordsToGateObserved` ignores 4 of 5 Jev rubric scores packed in `reason` JSON; `.github/workflows/evals-nightly.yml` runs `eval:gate` against an empty test DB. |
| **5. Metrics, Telemetry & SLOs** (`packages/shared/src/metrics.ts`, `metrics-export/`, `admin-health.ts`) | **6.8 / 10** | **9.8 / 10** | Dependency-free `MetricsRegistry` with dual Grafana Cloud OTLP JSON and Snappy/Protobuf Prometheus Remote-Write exporters; idempotent `chat_telemetry` and `chat_tool_telemetry` persistence. | `queryChatAggregate` checks `WHERE kind IS NULL` (always `0` in Mastra v2, permanently degrading Admin System Health); `queryOperationalAggregate` queries dead `multi_specialist_sentiment` kinds; `HISTOGRAM_BUCKET_BOUNDS_MS` (`1..120000`) traps all USD cost observations in the `<= 1` bucket; `run-telemetry.ts` tags all metrics as `kestrel-xauusd-research-poc`; `validateTelemetryStartup` hardcodes `'unknown'`. |

---

## Execution Order & Verification Gates

Execute the four plans in numerical order (`10` → `11` → `12` → `13`). After completing each phase, run:

1. `pnpm typecheck` (or `kestrel_task` with `task: "typecheck"`)
2. `pnpm test` (or package-scoped `pnpm --filter <pkg> test`)
3. `pnpm lint`
4. `node scripts/check-architecture-tree.mjs` and `node scripts/check-maintainability.mjs`
