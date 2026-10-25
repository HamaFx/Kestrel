# Kestrel Remaining Size-Debt Audit

**Scope:** every source file still over the DEC-05 limits after the Part 1/Part 2 roadmap:

- Backend/AI/Worker/Plugin `.ts` files over **350 lines**
- React `.tsx` files over **250 lines**, or over **4 `useState`** / **2 `useEffect`**

**Result:** **158 files** (79 `.ts`, 79 `.tsx`; 9 of the `.tsx` are hook-count violations only).
All are pre-existing, tracked in `scripts/maintainability-baseline.json` (ratchet: they cannot grow).

**Method:** each file was measured and its exports/functions/hooks/imports/try-blocks inspected; natural
decomposition seams were identified from its own function names and responsibilities. Files were sorted into
three tiers:

- **Tier 1 — safe & quick (17 files):** presentational components, static schemas/types/prompt catalogs, and
  barrels. No behavioural risk; mechanical extraction.
- **Tier 2 — moderate (67 files):** UI forms/screens and small services with clear seams. Needs a state hook
  or section extraction; covered by existing UI tests.
- **Tier 3 — core/risky (74 files):** database layer, worker bootstrap, chat pipeline, alert delivery,
  paper-trading fills, auth actions, plugin host. Must be split with care and verified by the existing
  high-value suites after each batch.

**Effort:** 81 small (S), 70 medium (M), 7 large (L).

## Tier 1 (17 files)

| Lines | Type            | Effort | Recommended action                                                                                              | File                                                           |
| ----: | --------------- | ------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
|   809 | tsx (hooks 4/0) | S      | Split scenario data / canvas visuals / controls / results panel into a `landing-simulator/` folder.             | `apps/web/src/components/landing/landing-simulator.tsx`        |
|   718 | tsx (hooks 4/1) | M      | Split into character profiles/data, pixel primitives, and the 3 exported containers.                            | `apps/web/src/components/chat/parts/pixel-desk/pixel-desk.tsx` |
|   571 | tsx (hooks 3/1) | S      | Extract step definitions + each step panel + progress rail.                                                     | `apps/web/src/components/landing/landing-stepper.tsx`          |
|   526 | ts              | S      | Split type groups: manifest/tools, jobs/agents, UI/settings, alert channels.                                    | `packages/plugin-sdk/src/types.ts`                             |
|   523 | tsx (hooks 0/0) | S      | See above — presentation only.                                                                                  | `apps/web/src/components/chat/parts/agent-deliberation.tsx`    |
|   486 | ts              | S      | Split run, sweep, knowledge-base, and strategy schemas.                                                         | `plugins/backtesting/src/schemas.ts`                           |
|   483 | tsx (hooks 0/0) | S      | Extract DayOfWeekChart and hold-time/equity sections into chart components.                                     | `apps/web/src/app/(app)/journal/_components/stats-summary.tsx` |
|   478 | tsx (hooks 1/0) | S      | Extract hero copy/cards/CTA into 3 presentational pieces + data.                                                | `apps/web/src/components/landing/landing-hero.tsx`             |
|   475 | ts              | S      | Split specialist prompts, fusion prompts, critique/debate prompts, and comparison prompts.                      | `packages/ai/src/committee/prompts.ts`                         |
|   466 | tsx (hooks 2/1) | S      | Extract desk cards + section header + copy data.                                                                | `apps/web/src/components/landing/landing-desks.tsx`            |
|   450 | tsx (hooks 2/0) | S      | Extract each architecture diagram layer into its own component.                                                 | `apps/web/src/components/landing/landing-architecture.tsx`     |
|   446 | ts              | S      | Split export blocks into `index/budget.ts`, `index/agents.ts`, `index/tools.ts` re-exported by the root barrel. | `packages/ai/src/index.ts`                                     |
|   445 | tsx (hooks 0/0) | S      | Split the part registry by domain (core tools / plugin tools / bespoke parts) with a merge barrel.              | `apps/web/src/components/chat/parts/registry.tsx`              |
|   400 | ts              | S      | Split analysis mode types, opinion types, and fusion/verdict types.                                             | `packages/ai/src/committee/types.ts`                           |
|   391 | tsx (hooks 0/0) | S      | Extract header, add-key form, and key list sections.                                                            | `apps/web/src/app/(app)/settings/api-keys/page.tsx`            |
|   383 | tsx (hooks 0/1) | S      | Extract 3D scene setup from render/controls.                                                                    | `apps/web/src/components/landing/landing-3d-hologram.tsx`      |
|   374 | ts              | S      | Split tool input/output schemas by domain (orders/positions/accounts).                                          | `plugins/paper-trading/src/schemas.ts`                         |

## Tier 2 (67 files)

| Lines | Type             | Effort | Recommended action                                                                            | File                                                                               |
| ----: | ---------------- | ------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
|   676 | tsx (hooks 9/1)  | M      | Extract `use-symbols-form.ts` (useReducer) + symbol list + add/edit panel + validation.       | `apps/web/src/app/(app)/settings/_components/symbols/symbols-form.tsx`             |
|   659 | tsx (hooks 9/2)  | M      | Extract `use-trace-filters.ts` + filters bar + trace detail + export button.                  | `apps/web/src/app/(app)/admin/_components/admin-diagnostic-traces.tsx`             |
|   637 | tsx (hooks 15/2) | M      | Extract `use-alert-form.ts` (useReducer) + trigger/conditions/notifications/preview sections. | `apps/web/src/app/(app)/alerts/_components/alert-form.tsx`                         |
|   613 | tsx (hooks 1/1)  | M      | Extract `use-dashboard-layout.ts` + widget registry + AddWidgetMenu + SortableWidget.         | `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx`                |
|   585 | tsx (hooks 8/1)  | M      | Extract `use-plugin-store.ts` + PluginCard + UninstallDrawer (already named).                 | `apps/web/src/app/(app)/settings/plugins/_components/plugin-store-grid.tsx`        |
|   566 | tsx (hooks 12/3) | M      | Extract `use-sweep-panel.ts` (useReducer) + results table + controls.                         | `plugins/backtesting/src/ui/sweep-panel.tsx`                                       |
|   556 | tsx (hooks 7/1)  | M      | Extract `use-plugin-setup.ts` + per-step field groups.                                        | `apps/web/src/app/(app)/settings/plugins/_components/plugin-setup-drawer.tsx`      |
|   542 | tsx (hooks 4/2)  | S      | Extract OverallBanner/ErrorBudgetGauge/SliCard/AnomalyList/SpendWatchBar (already named).     | `apps/web/src/app/(app)/admin/_components/admin-system-health.tsx`                 |
|   497 | tsx (hooks 5/0)  | S      | Extract row menu/actions + tag list + screenshot preview.                                     | `apps/web/src/app/(app)/journal/_components/entry-row.tsx`                         |
|   461 | tsx (hooks 1/1)  | S      | Extract replay controls + chart + trade list.                                                 | `apps/web/src/app/(app)/journal/_components/setup-replay-modal.tsx`                |
|   440 | tsx (hooks 3/0)  | S      | Extract status/usage badges + key actions.                                                    | `apps/web/src/app/(app)/settings/api-keys/_components/api-key-card.tsx`            |
|   439 | tsx (hooks 13/0) | M      | Extract `use-entry-form.ts` (useReducer) + field groups + screenshot upload.                  | `apps/web/src/app/(app)/journal/_components/entry-form.tsx`                        |
|   424 | tsx (hooks 3/0)  | S      | Extract presentational subcomponents by section.                                              | `apps/web/src/app/(app)/admin/_components/admin-ai-eval.tsx`                       |
|   424 | tsx (hooks 17/0) | M      | Extract `use-new-run-form.ts` (useReducer) + field groups.                                    | `plugins/backtesting/src/ui/new-run-form.tsx`                                      |
|   404 | tsx (hooks 4/1)  | S      | Extract data actions + usage summary sections.                                                | `apps/web/src/app/(app)/settings/_components/data/data-card.tsx`                   |
|   387 | tsx (hooks 2/0)  | S      | Extract alert row + bulk actions.                                                             | `apps/web/src/app/(app)/alerts/_components/alert-list.tsx`                         |
|   387 | tsx (hooks 4/2)  | S      | Extract rule list + rule editor.                                                              | `apps/web/src/app/(app)/settings/_components/notifications/noise-control-card.tsx` |
|   374 | tsx (hooks 1/1)  | S      | Extract payload preview + actions.                                                            | `apps/web/src/components/chat/parts/auto-plugin-tool-card.tsx`                     |
|   374 | tsx (hooks 4/1)  | S      | Extract setup form hook + status sections.                                                    | `plugins/telegram-bot/src/ui/telegram-page.tsx`                                    |
|   367 | tsx (hooks 3/0)  | S      | Extract field renderer per schema type + form shell.                                          | `apps/web/src/app/(app)/settings/plugins/_components/auto-zod-settings-form.tsx`   |
|   359 | tsx (hooks 3/1)  | S      | Extract catalog fetch hook + provider group + model row.                                      | `apps/web/src/app/(app)/settings/models/_components/model-picker.tsx`              |
|   356 | tsx (hooks 6/0)  | S      | Extract grouping/filter controls + list section.                                              | `apps/web/src/app/(app)/journal/_components/entry-list.tsx`                        |
|   353 | tsx (hooks 4/5)  | S      | Extract command registry hook + result group components.                                      | `apps/web/src/components/layout/command-palette.tsx`                               |
|   352 | tsx (hooks 6/3)  | S      | Extract event-stream hook + log list + controls.                                              | `apps/web/src/app/(app)/admin/_components/admin-log-viewer.tsx`                    |
|   352 | tsx (hooks 8/1)  | S      | Extract checklist state hook + item sections.                                                 | `apps/web/src/app/(app)/dashboard/_components/pre-session-checklist-drawer.tsx`    |
|   351 | tsx (hooks 2/0)  | S      | Extract heatmap data hook + chart renderer.                                                   | `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget.tsx`      |
|   350 | tsx (hooks 8/0)  | S      | Extract 2FA flow stages into components + shared state hook.                                  | `apps/web/src/app/(app)/settings/_components/security/two-factor-setup.tsx`        |
|   347 | tsx (hooks 5/1)  | S      | Extract account summary + positions table + orders table sections.                            | `plugins/paper-trading/src/ui/paper-page.tsx`                                      |
|   344 | tsx (hooks 2/3)  | S      | Extract fetch hook + row component.                                                           | `apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget.tsx`        |
|   339 | tsx (hooks 2/0)  | S      | Extract model/mode/thread selectors into subcomponents.                                       | `apps/web/src/components/chat/chat-top-bar.tsx`                                    |
|   337 | tsx (hooks 12/2) | M      | Extract tabs hook + per-tab panels.                                                           | `plugins/backtesting/src/ui/backtest-page.tsx`                                     |
|   334 | tsx (hooks 10/2) | S      | Extract table + row actions + filters.                                                        | `apps/web/src/app/(app)/admin/_components/admin-user-table.tsx`                    |
|   332 | tsx (hooks 0/0)  | S      | Extract usage sections (spend/tokens/models).                                                 | `apps/web/src/app/(app)/settings/usage/page.tsx`                                   |
|   331 | tsx (hooks 0/0)  | S      | Extract indicator grouping/formatting from render.                                            | `apps/web/src/components/chat/parts/get-indicators.tsx`                            |
|   325 | tsx (hooks 1/0)  | S      | Extract impact badge + time formatting + actions.                                             | `apps/web/src/components/calendar/event-card.tsx`                                  |
|   324 | tsx (hooks 6/2)  | S      | Extract search hook + group sections.                                                         | `apps/web/src/components/chat/_components/thread-switcher.tsx`                     |
|   320 | tsx (hooks 3/3)  | S      | Extract filters + article list + detail.                                                      | `apps/web/src/app/(app)/news/_components/news-view.tsx`                            |
|   320 | tsx (hooks 5/1)  | M      | Extract run summary + trades table + metrics tabs.                                            | `plugins/backtesting/src/ui/run-detail-page.tsx`                                   |
|   317 | tsx (hooks 0/1)  | S      | Extract section registry + layout.                                                            | `apps/web/src/app/(app)/admin/page.tsx`                                            |
|   314 | tsx (hooks 0/0)  | S      | Extract nav groups + footer.                                                                  | `apps/web/src/components/layout/desktop-sidebar.tsx`                               |
|   308 | tsx (hooks 3/2)  | S      | Extract catalog hook + provider group.                                                        | `apps/web/src/components/chat/_components/regen-model-picker.tsx`                  |
|   308 | tsx (hooks 15/0) | M      | Extract `use-place-order.ts` (useReducer) + fields + preview.                                 | `plugins/paper-trading/src/ui/place-order-form.tsx`                                |
|   307 | tsx (hooks 8/4)  | M      | Extract `use-onboarding-wizard.ts` + per-step panels.                                         | `apps/web/src/components/onboarding/wizard.tsx`                                    |
|   289 | tsx (hooks 3/0)  | S      | Extract presentational subcomponents by section.                                              | `apps/web/src/app/(app)/journal/_components/journal-view.tsx`                      |
|   288 | tsx (hooks 0/3)  | S      | Extract 3 effects into one preferences hook.                                                  | `apps/web/src/app/(app)/settings/_components/agent/ai-prefs-card.tsx`              |
|   287 | tsx (hooks 2/1)  | S      | Extract streaming text/citation render helpers.                                               | `apps/web/src/components/chat/parts/text.tsx`                                      |
|   284 | tsx (hooks 9/2)  | S      | Extract login form hook + SSO/2FA sections.                                                   | `apps/web/src/app/(auth)/login/page.tsx`                                           |
|   278 | tsx (hooks 1/1)  | S      | Extract presentational subcomponents by section.                                              | `apps/web/src/components/ui/segmented.tsx`                                         |
|   278 | tsx (hooks 0/0)  | S      | Extract tab panels (chart/committee/report).                                                  | `apps/web/src/components/chat/thread-views-dock.tsx`                               |
|   275 | tsx (hooks 7/0)  | S      | Extract export/import handlers hook + two buttons sections.                                   | `apps/web/src/app/(app)/settings/api-keys/_components/export-import-keys.tsx`      |
|   271 | tsx (hooks 4/1)  | S      | Extract presentational subcomponents by section.                                              | `apps/web/src/app/(app)/admin/_components/admin-mastra-runs.tsx`                   |
|   271 | tsx (hooks 0/0)  | S      | Extract presentational subcomponents by section.                                              | `apps/web/src/app/(app)/settings/_components/settings-nav.tsx`                     |
|   267 | tsx (hooks 0/0)  | S      | Extract verdict summary + desk cards.                                                         | `apps/web/src/components/chat/parts/convene-committee.tsx`                         |
|   264 | tsx (hooks 9/0)  | S      | Extract document list + editor + upload.                                                      | `plugins/backtesting/src/ui/knowledge-base.tsx`                                    |
|   263 | tsx (hooks 0/0)  | S      | Extract probe hook + status rows.                                                             | `apps/web/src/app/(app)/settings/_components/system-status-card.tsx`               |
|   262 | tsx (hooks 0/0)  | S      | Extract candle table/formatting from render.                                                  | `apps/web/src/components/chat/parts/get-candles.tsx`                               |
|   260 | tsx (hooks 0/1)  | S      | Extract animation logic from markup.                                                          | `apps/web/src/components/layout/hanging-pendant.tsx`                               |
|   260 | tsx (hooks 0/1)  | S      | Extract nav groups + drawer shell.                                                            | `apps/web/src/components/layout/nav-drawer.tsx`                                    |
|   230 | tsx (hooks 8/1)  | M      | Extract `use-agent-studio.ts` (useReducer) + gallery/details sections.                        | `plugins/custom-agents/src/ui/agent-studio-page.tsx`                               |
|   223 | tsx (hooks 1/3)  | S      | Collapse 3 effects into one virtualization/scroll effect.                                     | `apps/web/src/components/chat/message-list.tsx`                                    |
|   221 | tsx (hooks 0/3)  | S      | Collapse 3 effects into one chart-setup effect.                                               | `apps/web/src/components/chart/performance-chart.tsx`                              |
|   212 | tsx (hooks 7/1)  | S      | Extract `use-dev-tools.ts` to reduce 7 useState.                                              | `apps/web/src/app/(app)/admin/_components/admin-dev-tools.tsx`                     |
|   205 | tsx (hooks 0/3)  | S      | Collapse 3 effects into one preferences hook.                                                 | `apps/web/src/app/(app)/settings/_components/data/preferences-card.tsx`            |
|   189 | tsx (hooks 5/1)  | S      | Extract install-detection hook to reduce 5 useState.                                          | `apps/web/src/components/layout/install-nudge.tsx`                                 |
|   183 | tsx (hooks 6/1)  | S      | Extract `use-onboarding-control.ts`.                                                          | `apps/web/src/app/(app)/admin/_components/admin-onboarding-control.tsx`            |
|   145 | tsx (hooks 1/3)  | S      | Collapse 3 effects into one dirty-tracking effect.                                            | `apps/web/src/app/(app)/settings/api-keys/_components/save-bar.tsx`                |
|    66 | tsx (hooks 1/3)  | S      | Collapse 3 effects into one animation effect.                                                 | `apps/web/src/components/ui/animated-number.tsx`                                   |

## Tier 3 (74 files)

| Lines | Type            | Effort | Recommended action                                                                                         | File                                                                    |
| ----: | --------------- | ------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
|   704 | ts              | L      | Split provider adapters (Exa/Tavily/Brave), HTTP/cache, result normalization, and the tool definition.     | `packages/ai/src/tools/web-search.ts`                                   |
|   661 | ts              | L      | Split context assembly, route validation, run orchestration, and result mapping.                           | `packages/ai/src/mastra-v2/planning/mode-runner.ts`                     |
|   636 | ts              | L      | Split bootstrap into phases: env/logging, plugin+queue registration, HTTP servers, feed workers, shutdown. | `apps/worker/src/index.ts`                                              |
|   632 | ts              | M      | Split CRUD, stats/replay math, and row mapping.                                                            | `packages/ai/src/journal/persistence.ts`                                |
|   632 | ts              | L      | Split account queries, position queries, order/fill queries, strategy-run queries, and seed/reset.         | `plugins/paper-trading/src/db/queries.ts`                               |
|   628 | ts              | L      | Split login, register, password reset, and verification actions + shared rate-limit helpers.               | `apps/web/src/app/(auth)/actions.ts`                                    |
|   607 | ts              | L      | Split pool/connection resolution, tenant/RLS scope, retry, and health/close. Keep the public barrel.       | `packages/db/src/client.ts`                                             |
|   606 | ts              | L      | Split request validation, mode dispatch, response/stream handling, and error mapping.                      | `apps/web/src/app/api/chat/route.ts`                                    |
|   563 | ts              | M      | SplitRegistry storage, plugin validation, and tool/agent/skill resolution.                                 | `packages/plugin-sdk/src/host.ts`                                       |
|   557 | ts              | M      | Split lifecycle transitions, claim/lease, stats, and retention/purge.                                      | `packages/db/src/queries/full-analysis-queue.ts`                        |
|   547 | ts              | M      | Split channel adapters (email/Telegram/push), message rendering, and orchestration.                        | `packages/ai/src/alerts/delivery.ts`                                    |
|   534 | ts              | M      | Split pure math (sizing/fees/margin), price/quote helpers, evaluation, and shared types.                   | `plugins/paper-trading/src/domain.ts`                                   |
|   533 | ts              | M      | Split schema definition, resolvers (DB URLs), and AI-env picker.                                           | `packages/shared/src/env.ts`                                            |
|   529 | ts              | M      | Split job body, sweep throttling, and payload/snapshot helpers.                                            | `apps/worker/src/jobs/multi-agent-analysis.ts`                          |
|   528 | ts              | M      | Split store metadata building, lifecycle actions, and rate limiting.                                       | `apps/web/src/lib/services/plugin-manage.ts`                            |
|   528 | ts              | M      | Split QuickJS loader/limits, Kestrel globals bridge, and strategy contract.                                | `plugins/backtesting/src/engine/sandbox.ts`                             |
|   525 | ts              | M      | Split thread CRUD, fork/cursor helpers, and memory cleanup.                                                | `packages/ai/src/persistence/thread-persistence.ts`                     |
|   521 | ts              | M      | Split route groups (runs, sweeps, knowledge).                                                              | `plugins/backtesting/src/api/routes.ts`                                 |
|   520 | ts              | M      | Split schemas/types, packet collection, and indicator memo.                                                | `packages/ai/src/mastra-v2/packets/symbol-research.ts`                  |
|   515 | ts              | M      | Split bar loop, trade/equity accounting, and metrics.                                                      | `plugins/backtesting/src/engine/simulator.ts`                           |
|   502 | ts              | M      | Split indicator-spec parsing, bar reading, and evaluation loop.                                            | `packages/ai/src/alerts/evaluator.ts`                                   |
|   483 | ts              | M      | Split SSE/JSON/DSML normalizers and provider factory.                                                      | `packages/ai/src/_providers/helpers.ts`                                 |
|   483 | ts              | M      | Split command groups: market data, alerts, briefings, account/settings.                                    | `plugins/telegram-bot/src/bot/commands.ts`                              |
|   477 | ts              | M      | Split action groups (profile, UI, AI prefs, notifications, symbols, locale, usage).                        | `apps/web/src/app/(app)/settings/_actions-preferences.ts`               |
|   473 | ts              | M      | Split user CRUD, sessions, verification tokens, and 2FA.                                                   | `packages/db/src/queries/auth.ts`                                       |
|   464 | ts              | M      | Split memory call options, working-memory seeding, and history backfill.                                   | `packages/ai/src/mastra-v2/context.ts`                                  |
|   464 | ts              | M      | Split LRU/redis storage from collect APIs.                                                                 | `packages/ai/src/mastra-v2/packets/packet-cache.ts`                     |
|   460 | ts              | M      | Split sanitizers, view mapping, CRUD, and runtime MCP resolution.                                          | `plugins/custom-agents/src/services/agents.ts`                          |
|   444 | ts              | M      | Split DTO/schema, CRUD services, and replay/coach services.                                                | `apps/web/src/lib/services/journal.ts`                                  |
|   442 | ts              | S      | Split XAUUSD macro from generic macro assembly.                                                            | `packages/ai/src/mastra-v2/packets/research-packet-macro.ts`            |
|   440 | ts              | M      | Split GET serialization, PATCH action handlers, and validation.                                            | `apps/web/src/app/api/admin/platform-config/route.ts`                   |
|   440 | ts              | M      | Split by domain group (types/consts vs side-effecting functions).                                          | `packages/shared/src/metrics-export.ts`                                 |
|   438 | ts              | M      | Split by domain group (types/consts vs side-effecting functions).                                          | `packages/ai/src/alerts/persistence.ts`                                 |
|   437 | ts              | M      | Split middleware/auth helpers, body parsing, and error response.                                           | `apps/web/src/lib/http/api.ts`                                          |
|   437 | ts              | S      | Split config from delete/vacuum jobs.                                                                      | `packages/db/src/retention.ts`                                          |
|   436 | ts              | S      | Split executor factory from route handler.                                                                 | `apps/web/src/app/api/chat/mutations/confirm/route.ts`                  |
|   431 | ts              | M      | Split 2FA, sessions, password, and account deletion actions.                                               | `apps/web/src/app/(app)/settings/_actions-security.ts`                  |
|   431 | ts              | M      | Split remember-* writers from search/count.                                                                | `packages/ai/src/memory/memory-index.ts`                                |
|   422 | ts              | S      | Split clear-history and export actions.                                                                    | `apps/web/src/app/(app)/settings/_actions-data.ts`                      |
|   421 | ts              | M      | Split connection-string resolution, storage factory/cache, and retention pruning.                          | `packages/ai/src/mastra-v2/storage.ts`                                  |
|   420 | ts              | M      | Split structured fusion, rendering, and comparison synthesis.                                              | `packages/ai/src/committee/synthesizer.ts`                              |
|   419 | ts              | M      | Split verdict mapping, grounded fallback, and tool definition.                                             | `packages/ai/src/tools/convene-committee.ts`                            |
|   415 | ts              | M      | Split token schemas/issuing, verification, and mutation gates.                                             | `packages/ai/src/mastra-v2/mutation/mutation-policy.ts`                 |
|   410 | ts              | M      | Split tool definitions by domain (orders/positions/accounts).                                              | `plugins/paper-trading/src/tools.ts`                                    |
|   409 | ts              | M      | Split tool definitions by domain (runs/sweeps/knowledge).                                                  | `plugins/backtesting/src/tools.ts`                                      |
|   404 | ts              | M      | Split step graph from step bodies.                                                                         | `packages/ai/src/committee/comparison-workflow.ts`                      |
|   402 | ts              | M      | Split request building, parsing, and batch symbols.                                                        | `packages/data/src/providers/biquote/rest.ts`                           |
|   399 | ts              | M      | Split step graph from step bodies.                                                                         | `packages/ai/src/committee/single-workflow.ts`                          |
|   399 | ts              | M      | Split AI command handlers from action dispatch.                                                            | `plugins/telegram-bot/src/bot/ai-commands.ts`                           |
|   397 | ts              | M      | Split data gathering, prompt assembly, and persistence.                                                    | `packages/ai/src/briefings/generate.ts`                                 |
|   385 | ts              | S      | Split adapters from stream-part parsing.                                                                   | `packages/ai/src/mastra-v2/agents/xauusd/legacy-tool-adapter.ts`        |
|   384 | ts              | M      | Split key CRUD, test, and import/export actions.                                                           | `apps/web/src/app/(app)/settings/_actions-api-keys.ts`                  |
|   382 | ts              | M      | Split step graph from step bodies.                                                                         | `packages/ai/src/mastra-v2/workflows/xauusd-report.ts`                  |
|   377 | ts              | S      | Split emission dedupe from storage queries.                                                                | `packages/ai/src/briefings/persistence.ts`                              |
|   375 | ts              | M      | Split connection lifecycle from message handling.                                                          | `apps/worker/src/signalr/consumer.ts`                                   |
|   374 | ts              | M      | Split by domain group (types/consts vs side-effecting functions).                                          | `packages/ai/src/models/rag.ts`                                         |
|   374 | ts              | S      | Split AsyncLocalStorage wiring from trace lifecycle.                                                       | `packages/ai/src/diagnostics/run-context.ts`                            |
|   373 | ts              | M      | Split stream framing, tool-part extraction, and telemetry finalize.                                        | `apps/web/src/lib/services/mastra/chat/mastra-canonical-chat-stream.ts` |
|   373 | ts              | M      | Split runner loop from result normalization.                                                               | `packages/ai/src/committee/specialist-runner.ts`                        |
|   373 | ts              | S      | Split installed-plugin queries from storage queries.                                                       | `packages/db/src/queries/plugins.ts`                                    |
|   372 | ts              | S      | Split write/retention from read/list.                                                                      | `packages/db/src/queries/diagnostic-traces.ts`                          |
|   371 | ts              | M      | Split outbox scanning from replay handlers.                                                                | `packages/ai/src/persistence/recovery.ts`                               |
|   371 | ts              | M      | Split scorer factories by profile.                                                                         | `packages/ai/src/mastra-v2/evals/scorers.ts`                            |
|   369 | ts              | M      | Split by domain group (types/consts vs side-effecting functions).                                          | `packages/ai/src/_providers/xai-deepseek-iamhc.ts`                      |
|   369 | ts              | M      | Split probes by dependency (db/redis/feed).                                                                | `packages/data/src/health.ts`                                           |
|   368 | ts              | M      | Split job registry from cron scheduling.                                                                   | `apps/worker/src/scheduler.ts`                                          |
|   367 | ts              | M      | Split route groups.                                                                                        | `plugins/paper-trading/src/api/routes.ts`                               |
|   365 | ts              | S      | Split view mapping from query helpers.                                                                     | `packages/ai/src/mastra-v2/observability-view.ts`                       |
|   363 | ts              | M      | Same pattern as canonical stream.                                                                          | `apps/web/src/lib/services/mastra/chat/mastra-custom-agent-stream.ts`   |
|   363 | ts              | M      | Split agent CRUD routes from run/preview routes.                                                           | `plugins/custom-agents/src/api/routes.ts`                               |
|   362 | ts              | S      | Split run queries from knowledge queries.                                                                  | `plugins/backtesting/src/db/queries.ts`                                 |
|   356 | ts              | M      | Split by domain group (types/consts vs side-effecting functions).                                          | `packages/shared/src/logger.ts`                                         |
|   352 | ts              | M      | Split critique prompt assembly from parsing.                                                               | `packages/ai/src/committee/critique.ts`                                 |
|   265 | tsx (hooks 0/0) | S      | Split UI component registry by component group.                                                            | `packages/plugin-sdk/src/ui.tsx`                                        |

## Detailed plans for the ten biggest files

1. **`apps/web/src/components/landing/landing-simulator.tsx` (809)** — split into
   `landing-simulator/scenarios.ts` (data), `simulator-canvas.tsx` (visuals), `simulator-controls.tsx`,
   `simulator-results.tsx`, and a thin `index.tsx`. Presentation only, no state risk.
2. **`apps/web/src/components/chat/parts/pixel-desk/pixel-desk.tsx` (718)** — `character-profiles.ts`,
   `pixel-primitives.tsx` (glyph/animation), then the three exported containers in separate files.
3. **`packages/ai/src/tools/web-search.ts` (704)** — `providers/exa.ts`, `providers/tavily.ts`,
   `providers/brave.ts`, `web-search-config.ts` (provider order/keys), `web-search-cache.ts`,
   `web-search-normalize.ts`, and a slim `web-search.ts` tool definition.
4. **`apps/web/src/app/(app)/settings/_components/symbols/symbols-form.tsx` (676, 9 hooks)** —
   `use-symbols-form.ts` (`useReducer`), `symbol-list.tsx`, `symbol-editor.tsx`, `symbol-validation.ts`.
5. **`packages/ai/src/mastra-v2/planning/mode-runner.ts` (661)** — `mode-context.ts` (run context),
   `mode-route.ts` (plan/route validation), `mode-run.ts` (orchestration), `mode-result.ts` (mapping).
6. **`apps/web/src/app/(app)/admin/_components/admin-diagnostic-traces.tsx` (659, 9 hooks)** —
   `use-trace-filters.ts`, `trace-list.tsx`, `trace-detail.tsx`, `trace-export.ts`.
7. **`apps/web/src/app/(app)/alerts/_components/alert-form.tsx` (637, 15 hooks)** —
   `use-alert-form.ts` (`useReducer`), `alert-trigger-section.tsx`, `alert-conditions-section.tsx`,
   `alert-delivery-section.tsx`, `alert-preview.tsx`.
8. **`apps/worker/src/index.ts` (636, 8 try blocks)** — `bootstrap/env.ts`, `bootstrap/plugins.ts`,
   `bootstrap/http-servers.ts`, `bootstrap/feeds.ts`, `bootstrap/shutdown.ts`, slim `index.ts`.
9. **`packages/ai/src/journal/persistence.ts` (632)** — `journal-crud.ts`, `journal-stats.ts`
   (R-multiple, buckets), `journal-mapping.ts`.
10. **`plugins/paper-trading/src/db/queries.ts` (632, 36 exports)** — `queries/accounts.ts`,
    `queries/positions.ts`, `queries/orders.ts`, `queries/fills.ts`, `queries/strategy-runs.ts`,
    `queries/seed.ts`, re-exported by the existing path.

## Recommended execution order

| Wave | Contents                                                 | Why first                                                    | Files |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------ | ----: |
| 1    | Tier 1 entirely                                          | Zero behaviour risk, clears 17 files and 6 of the 10 biggest |    17 |
| 2    | Dashboard/journal/settings UI (Tier 2 web smaller files) | High visibility, existing component tests                    |   ~20 |
| 3    | Admin + plugin UI forms (Tier 2 larger forms)            | Removes the heaviest hook clusters (15/13/12/9/8 useState)   |   ~18 |
| 4    | AI services (Tier 3 AI/committee/alerts/packets)         | Clear domain seams; covered by `@kestrel/ai` suite           |   ~30 |
| 5    | DB/worker/web routes/auth/plugin SDK (Tier 3 core)       | Highest risk; do last with focused integration tests         |   ~30 |

After each wave: `pnpm check:maintainability`, `pnpm turbo run lint`, `pnpm turbo run typecheck`,
targeted package tests, then remove the shipped entries from the baseline. A file only leaves the
baseline once it is genuinely under the limits.

## Policy notes

- **Pure catalogs** (`plugin-sdk/src/types.ts`, `committee/prompts.ts`, `committee/types.ts`,
  `backtesting/schemas.ts`, `paper-trading/schemas.ts`) still benefit from domain splits, but they are the
  lowest priority: they contain no branching logic.
- **Barrels** (`packages/ai/src/index.ts`) can be split into sub-barrels with zero runtime change.
- **Hook-only violations** (9 files, 40–230 lines) are cheap fixes: collapse multiple `useEffect`s into one
  or extract a small hook; they are listed inside the tier tables.
- **No coverage-padding tests** (DEC-06): every split is verified by the behavioural suites that already
  cover the file's domain; new tests are only added when a split exposes an untested invariant.
