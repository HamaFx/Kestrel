# Phase 4: Plugin Pruning (`custom-agents`), Dead Subsystem Removal & Worker Consolidation

> **Goal:** Keep the modular `@kestrel/plugin-sdk` architecture and the 3 core trader plugins (`@kestrel/plugin-backtesting`, `@kestrel/plugin-paper-trading`, `@kestrel/plugin-telegram-bot`), remove the extra `@kestrel/plugin-custom-agents` package, delete unused enterprise database subsystems (`persistence_outbox`, ML dataset exports, `memory_projection_state`), and slim `@kestrel/worker` from 15 jobs down to the 6 essential trader jobs.

---

> **Status:** Complete (2026-11-03). `pnpm check:guards` 7/7, `pnpm knip` 0 findings, `pnpm check:fast` 29/29 tasks.

## Overview of Tasks

- [x] **Task 4.1:** Remove `@kestrel/plugin-custom-agents` while keeping `@kestrel/plugin-sdk`, `backtesting`, `paper-trading`, and `telegram-bot` intact.
- [x] **Task 4.2:** Delete enterprise bloat tables & modules (`persistence_outbox`, `eval_datasets`, `ai_regression_cases`, `dataset-export`, `memory_projection_state`, `notification_noise_state`).
- [x] **Task 4.3:** Consolidate `@kestrel/worker` from 15 jobs down to 6 essential jobs and remove legacy Botkeep / GCP `cron-vm` scripts.

---

## Task 4.1: Remove `@kestrel/plugin-custom-agents` (Keep Plugin SDK + 3 Core Plugins)

### Why

Kestrel's plugin architecture (`@kestrel/plugin-sdk`) is a great boundary for developing and maintaining **Backtesting**, **Paper Trading**, and **Telegram Copilot** independently. However, `@kestrel/plugin-custom-agents` ("build custom `@handle` chatbots with remote MCP servers") is a separate product direction that adds routing, UI, and security surface area without helping core trading research.

### Files & Directories to Delete

- `plugins/custom-agents/` (entire workspace package)
- `apps/web/src/lib/services/plugin-custom-agents.ts`
- `apps/web/src/app/api/chat/_lib/custom-agent-dispatch.ts`
- Any dedicated custom-agents test files in `apps/web/test/` or `packages/ai/test/`

### Files to Modify

- `plugins/package.json`: Remove `"@kestrel/plugin-custom-agents": "workspace:*"`
- `plugins/registry.ts` & `plugins/ui-registry.ts`: Remove `customAgentsPlugin` and `customAgentsUi` registrations (keep `backtesting`, `paper-trading`, `telegram-bot`).
- `apps/web/next.config.mjs`: Remove `'@kestrel/plugin-custom-agents'` from `transpilePackages`.
- `apps/web/src/app/api/chat/route.ts`: Remove `dispatchCustomAgent` call and `agentSlug` handling.
- `packages/plugin-sdk/`: Remove `agentCatalogs` hooks if only used by `custom-agents`.
- `turbo.json`, `knip.json`, and root `package.json`: Remove `@kestrel/plugin-custom-agents` references if any.

### Verification

- Run `pnpm install`, `pnpm knip`, and `pnpm check:fast`.

---

## Task 4.2: Delete Enterprise Bloat Subsystems (`persistence_outbox`, ML Dataset Exports, Memory Projection)

### Subsystems to Remove

1. **Transactional Outbox (`persistence_outbox`):**
   - Delete `packages/db/src/schema/ai/persistence-outbox.ts`
   - Delete `packages/ai/src/persistence/outbox.ts` and `packages/ai/src/persistence/recovery/`
   - Delete `apps/worker/src/jobs/persistence-recovery.ts`
   - Update message/telemetry writers in `@kestrel/ai` to write directly via `withDbRetry` (and log on failure) rather than queueing failed writes into `persistence_outbox`.
2. **Nightly Backblaze B2 ML Training Dataset Exports (`dataset-export`, `eval_datasets`, `ai_regression_cases`):**
   - Delete `apps/worker/src/jobs/dataset-export.ts` and `apps/worker/test/dataset-export.test.ts`
   - Delete `packages/db/src/schema/ai/eval-datasets.ts` and `packages/db/src/schema/ai/ai-regression-cases.ts`
   - Remove unused eval/regression admin routes and services in `apps/web/src/lib/services/`
3. **Redundant State Tables (`memory_projection_state`, `notification_noise_state`):**
   - Delete `packages/db/src/schema/ai/memory-projection.ts` (and simplify Mastra memory sync)
   - Add a single clean database migration (`packages/db/drizzle/0124_drop_bloat_tables.sql`) with `DROP TABLE IF EXISTS` for `persistence_outbox`, `eval_datasets`, `ai_regression_cases`, `memory_projection_state`, and `full_analysis_queue` (from Phase 2).

### Verification

- Run `pnpm --filter @kestrel/db test`, `pnpm --filter @kestrel/ai test`, and `pnpm knip`.

---

## Task 4.3: Consolidate `@kestrel/worker` to 6 Essential Jobs & Clean Up Deployment Scripts

### Target Worker Job Roster (`apps/worker/src/jobs/index.ts`)

Reduce the `JOBS` registry from 15 jobs to the **6 jobs that directly power trading research and maintenance**:

| Job Name         | Schedule                 | Purpose                                                                                                                                                         |
| :--------------- | :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alerts`         | `* * * * *` (every 1m)   | Evaluates user price, candle, and indicator alerts and dispatches via Telegram / Web Push / Email.                                                              |
| `briefings`      | `*/5 * * * *` (every 5m) | Scans `economic_events` for pre/post high-impact macro release briefings.                                                                                       |
| `cot`            | `0 22 * * 5` (Fridays)   | Ingests weekly CFTC Commitment of Traders positioning reports.                                                                                                  |
| `fred-actuals`   | `30 1 * * *` (daily)     | Backfills realized FRED economic release prints into `economic_events`.                                                                                         |
| `resonance-sync` | `0 23 * * *` (daily)     | Syncs daily US 10Y real yields (`DFII10`), breakeven inflation, DXY, and Gold divergence (`intermarket_resonance`).                                             |
| `retention`      | `15 3 * * *` (daily)     | Runs daily DB retention cleanup **plus** releases stale AI budget reservations (absorbing `budget-recovery` into `retention`) and prunes old `candles_1m` rows. |

_(Note: `embedding-backfill` can either be folded into news ingestion on-write or kept as a lightweight optional 7th job if RAG over news is enabled)._

### Jobs to Delete from `apps/worker/src/jobs/`

- `opinion-calibration.ts` & `opinion-calibration-regime.ts` (removed in Phase 2)
- `multi-agent-analysis/` (removed in Phase 2; `full` mode now streams directly over SSE)
- `persistence-recovery.ts` (removed in Task 4.2)
- `dataset-export.ts` (removed in Task 4.2)
- `metrics-flush.ts` (Grafana Cloud remote-write push every minute; not needed for self-hosted open-source users—remove `packages/shared/src/metrics-export/remote-write.ts` as well)
- `budget-recovery.ts` (fold stale budget reservation release into `retention.ts` or lazy release inside `reserveTurnBudget`)

### Legacy Hosting Scripts to Delete

- `botkeep.sh` and `scripts/botkeep-start.mjs`
- `infra/cron-vm/` (GCP `e2-micro` swapfile bash scripts)
- Update `DEPLOY.md` so it cleanly documents the two supported deployment profiles:
  1. **1-Command Docker Compose (`docker compose up -d`)** for self-hosted open-source users.
  2. **Vercel + Supabase** for cloud deployment.

### Verification

- Run `pnpm --filter @kestrel/worker test`, `pnpm knip`, `pnpm check:guards`, and `pnpm check:fast`.

---

## Completion notes (2026-11-03)

- **Task 4.1:** `plugins/custom-agents/` deleted, including its Agent Studio UI,
  API routes, DB tables, MCP bridge, and skills. Removed the web dispatcher,
  resolution service, chat `agentSlug` plumbing, composer mention menu and
  agent selector, the AI `agent-*` runtime modules, `agentCatalogs` (and the
  core-tool catalog) from `@kestrel/plugin-sdk`, the Telegram `/agents`
  command and `@handle` dispatch, and every dedicated test. Migration `0124`
  drops `plg_custom_agents` and `plg_custom_agents_runs` for existing installs.
- **Task 4.2:** Deleted the transactional outbox (`persistence_outbox`), its
  replay loop, and the worker job; message, telemetry, trace, and opinion
  writers now use `withDbRetry` and log terminal failures. Deleted the ML
  dataset export pipeline (`dataset-export` job, `eval_datasets`,
  `ai_regression_cases`, `training-dataset` queries, Langfuse dataset
  publishing, admin dataset/regression routes and tabs). Deleted
  `memory_projection_state` (Mastra backfill no longer writes a checkpoint) and
  `notification_noise_state` (dedup/cooldown state is process-local; the
  user-facing noise config still lives in `user_settings`). Migration
  `0124_drop_bloat_tables.sql` drops every retired table, including the
  Phase 2 `full_analysis_queue` for databases that skipped `0123`.
- **Task 4.3:** The worker registry now contains the six core trader jobs
  (`alerts`, `briefings`, `cot`, `fred-actuals`, `resonance-sync`,
  `retention`) plus the documented optional seventh `embedding-backfill` for
  news RAG. `budget-recovery` is folded into `retention` (which also fixed a
  dangling `full_analysis_queue` reference in the stale-reservation query),
  and `metrics-flush` plus the Prometheus remote-write exporter are gone.
  `snapshots` and `weekly-review` remain available as manual
  `/api/cron/snapshots` and `/api/cron/weekly-review` routes. Deleted
  `botkeep.sh`, `scripts/botkeep-start.mjs`, and `infra/cron-vm/`, and rewrote
  `DEPLOY.md` for the two supported profiles (Docker Compose, Vercel +
  Supabase). The deployment guard's stale `infra/cron-vm` fixture reference was
  removed; all supported-profile assertions are unchanged.
