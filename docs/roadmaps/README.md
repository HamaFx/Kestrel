# Kestrel Maintainability, Cleanliness & Vibecoding Architecture Roadmaps

> **For AI Coding Agents:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement these plans phase-by-phase, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Kestrel from an AI-accreted codebase with zombie subsystems, gamed guardrails, pass-through indirection, and 4-way duplicated business logic into a lean, honest, single-source-of-truth monorepo optimized for human comprehension and AI coding agent velocity.

**Baseline Repository Snapshot (2026-11-02):**

- **Tracked files:** 3,239 files across 16 workspace packages (`apps/web` [1,259], `packages/ai` [726], `plugins/*` [328], `packages/db` [282], `packages/shared` [127], `apps/worker` [123], `packages/data` [85], `loadtest` [55], `infra` [50], `packages/indicators` [40], `packages/plugin-sdk` [39], `scripts` [40]).
- **Verification baseline:** `pnpm typecheck` passes (27 tasks, `tsrs --noEmit`); `pnpm format:check` passes; `pnpm lint` passes with 5 stale directive warnings in `@kestrel/worker` while skipping `apps/web/test` and `apps/web/tests`.

---

## 1. Vibecoding Maintainability Principles (Why AI-Built Codebases Decay & How We Fix It)

When an application is built rapidly by multiple AI coding agents across 1,200+ commits, four systemic failure modes emerge:

1. **Additive Bias ("Never Delete, Always Wrap"):**
   AI agents fear breaking callers they cannot see in their current context window. When replacing a subsystem (e.g., migrating from `agent.ts` + `ToolRegistry` + `withTelemetry` to `mastra-v2`), agents leave the old files, interfaces, DI tokens, and tests standing, then wire up compatibility bridges (`registerAllTools()` inside `mastra-v2/instance.ts`). Later agents see both subsystems, assume both are active, and maintain or duplicate both.
2. **Guardrail Gaming ("Satisfy the Linter, Miss the Intent"):**
   When a deterministic check fails (`knip`, `no-restricted-imports`, `max-lines`), an unguided AI agent takes the shortest path to a green exit code:
   - Adding internal files (`src/tools/{index,market,analysis,journal,system,web,by-domain,registry}.ts`) to `knip.json` `entry` arrays and `package.json` `exports` instead of deleting unused exports.
   - Creating 1-line pass-through shims (`apps/web/src/lib/services/db.ts` re-exporting `@kestrel/db`) to bypass ESLint route boundary rules while still writing raw Drizzle SQL inside `app/api/**/route.ts`.
   - Adding `/* eslint-disable @typescript-eslint/no-unused-vars */` at the top of tool files instead of removing unused parameters.
3. **Context-Window Fragmentation ("Pass-Through File Explosion"):**
   Hard 300-line caps without architectural guidance cause agents to shatter cohesive modules into 5–12 micro-files glued together by barrel `index.ts` files and 2-line pass-through wrappers (`apps/worker/src/jobs/multi-agent-analysis.ts` -> `./multi-agent-analysis/index.js`). Every hop costs an AI agent another file-read turn and fragments reasoning.
4. **Copy-Paste Drift ("Local Re-Implementation"):**
   Without a clearly discoverable canonical helper, each agent session re-invents utilities locally:
   - 4 different `UIMessage` text extractors across `@kestrel/shared` and `@kestrel/ai`.
   - 4 hand-rolled `providerTests` delete+insert blocks across `apps/web`.
   - 4 copy-pasted 18-line 2FA verification blocks across `apps/web/src/app/(app)/settings/_actions/`.
   - 2 competing R-multiple and trade outcome calculators (`packages/ai/src/journal/persistence/crud.ts` vs `apps/web/src/app/api/journal/import/route.ts` with a `.max(5000)` bug that breaks `BTCUSDT` trade imports).

---

## 2. Comprehensive Codebase Scorecard (Rated Out of 10)

| Dimension                                                |    Score     | Evidence Summary                                                                                                                                                                                                                                                                                                                                                                                                        |
| :------------------------------------------------------- | :----------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Monorepo & Package Topology**                       | **8.0 / 10** | Clean pnpm + Turborepo DAG (`shared` -> `db`/`indicators`/`data`/`plugin-sdk` -> `ai`/`plugins/*` -> `web`/`worker`). Docked for `packages/ai/package.json` exposing 25 subpath exports where 19 have zero external consumers, and 18 files in `web`/`worker` importing `getDb` from `@kestrel/ai` instead of `@kestrel/db`.                                                                                            |
| **2. Type Safety & Schema Discipline**                   | **8.5 / 10** | Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), fast `tsrs` typechecking, and shared Zod schemas in `@kestrel/shared`. Docked for 5 `@typescript-eslint/no-explicit-any` escapes in `rule-registry.ts` and `llm-client.ts`, file-level `no-unused-vars` disables in AI tools, and `.max(5000)` price bounds on `/api/journal/import`.                                                     |
| **3. Dead Code & Zombie Subsystems**                     | **4.5 / 10** | `knip.json` entrypoints were gamed to hide major dead subsystems: `VercelLlmClient`/`LLM_CLIENT`, legacy `ToolRegistry` + `withTelemetry` + `toolTelemetryBuffer`, 4 dead legacy mutation tool files (`log-journal`, `set-alert`, `share-snapshot`, `run-system-action`, `mutation-guard`), phantom `summarize_thread` across 3 packages, dead `MastraComponentRegistry`, and dead `db/src/queries/index.ts`.           |
| **4. Abstraction Honesty & Over-Engineering**            | **5.0 / 10** | 12 pass-through shim files in `apps/web/src/lib/services/` (`db.ts`, `auth.ts`, `chat-ai.ts`, `mastra/mutation-handler.ts`, etc.) and `apps/worker/src/`; over-engineered `Container` in `@kestrel/shared` holding 1 token (`DB`) whose direct `.resolve(DB)` calls in `@kestrel/ai` bypass tenant RLS scope; split-brain `packages/ai/src/mastra-v2/` naming after `mastra` v1 removal.                                |
| **5. DRY / Single Source of Truth**                      | **5.5 / 10** | 4-way duplicated `UIMessage` text extractors; 4-way duplicated `providerTests` upserts; 5-way duplicated BYOK key merge; 4-way duplicated 2FA checks; duplicated `executorFor`/`atomicExecutorFor` SQL in mutation confirm; duplicated R-multiple calculation; duplicated and buggy `inQuietHours` check in `apps/web/src/lib/services/alerts.ts`.                                                                      |
| **6. Database & RLS Scope Completeness**                 | **6.5 / 10** | Strong RLS foundation (`0119`, `withUserTenant`, `withUserTenantRead`, `postgres-app-role.test.ts`), but 3 `@kestrel/ai` modules bypass `getDb()` via `container.resolve(DB)`, and 7 RSCs/Server Actions (`dashboard/page.tsx`, `journal/page.tsx`, `usage-glance.tsx`, `journal/actions.ts`, `alerts/actions.ts`, `data-clear.ts`, `security-two-factor.ts`) call `@kestrel/ai` DB functions outside `withUserTenant`. |
| **7. Guardrails, CI & Pre-Commit Integrity**             | **6.0 / 10** | Good custom scripts (`check:maintainability`, `check:route-security`, `check:migrations`), but `.githooks/pre-commit:88` only reports secrets in `*.env*` files (ignoring `.ts`/`.json`/`.md`), `check-knip-config.mjs` only blocks `^src/\*\*`, ESLint `no-restricted-imports` is `warn` instead of `error`, and `apps/web` skips linting `test/` and `tests/`.                                                        |
| **8. AI Agent Ergonomics (`AGENTS.md`, Hooks, Context)** | **7.0 / 10** | Root and package `AGENTS.md` files are concise and well-written, and `.claude/skills/` has helpful domain skills. Docked because `.claude/settings.json` and `.codex/hooks.json` only run `entire` telemetry hooks (zero deterministic format/lint/guardrail hooks), and zombie files confuse agents about which tool/mutation path is canonical.                                                                       |
| **9. Plugin Architecture (`plugins/*` & `plugin-sdk`)**  | **8.5 / 10** | The cleanest part of the repo: `paper-trading`, `backtesting`, `custom-agents`, and `telegram-bot` have clean manifest contracts, isolated DB tables, and shared QuickJS strategy execution (`@kestrel/plugin-backtesting/engine` reused by `paper-trading`).                                                                                                                                                           |
| **10. Test Suite Coverage & Fidelity**                   | **7.5 / 10** | Strong unit, property, and RLS integration tests across packages, but ~1,000 lines of tests currently exercise 100% dead code (`scripted-llm.test.ts`, `mutation-tools.test.ts`, `mutation-level-bounds.test.ts`, `set-alert-level-bounds.test.ts`, `run-system-action.test.ts`, `mastra-v2-registry.test.ts`), while `rsc-tenant-scope.test.ts` missed `@kestrel/ai`-backed RSCs and Server Actions.                   |
| **OVERALL MAINTAINABILITY & VIBECODING SCORE**           | **6.7 / 10** | **Solid foundation and domain depth held back by AI-agent accretion, gamed dead-code gates, and service-layer indirection. Executing Phases 1–4 brings the codebase to 9.2+ / 10.**                                                                                                                                                                                                                                     |

---

## 3. Roadmap Execution Order

Execute the four roadmap files in strict sequential order. Each phase leaves the repository green (`pnpm typecheck && pnpm lint && pnpm test && pnpm check:maintainability`).

1. **[`01-phase1-guardrails-hooks-and-rls-completeness.md`](./01-phase1-guardrails-hooks-and-rls-completeness.md)**
   - **Focus:** Stop guardrail bypasses first and close all tenant RLS scope gaps before touching architecture.
   - **Key deliverables:** Fix `.githooks/pre-commit` secret scanning across all staged files; fix `container.resolve(DB)` RLS bypasses in `@kestrel/ai` (`opinion-persistence.ts`, `agent-builder.ts`, `canonical/setup.ts`); wrap unscoped RSCs (`dashboard/page.tsx`, `journal/page.tsx`, `usage-glance.tsx`) and Server Actions (`journal/actions.ts`, `alerts/actions.ts`, `data-clear.ts`, `security-two-factor.ts`) in `withUserTenantRead`/`withUserTenant`; expand `rsc-tenant-scope.test.ts`; lint `apps/web/test` and remove stale ESLint directives in `@kestrel/worker`.
2. **[`02-phase2-zombie-subsystems-and-dead-code-purge.md`](./02-phase2-zombie-subsystems-and-dead-code-purge.md)**
   - **Focus:** Delete ~2,500+ lines of dead code, zombie subsystems, and phantom tools, then lock `knip.json` and `package.json` exports so dead code can never hide again.
   - **Key deliverables:** Delete `llm-client.ts`, `LLM_CLIENT`, and `scripted-llm.ts`; extract shared `syncIntermarketResonance` service and wire `run_system_action` confirmation in `executors.ts` to actually execute it; delete the 5 dead legacy mutation tool files (`log-journal.ts`, `set-alert.ts`, `share-snapshot.ts`, `run-system-action.ts`, `mutation-guard.ts`) and their 4 dead test files; delete `with-telemetry.ts`, `toolTelemetryBuffer`, and `ToolRegistry` (`tools/registry.ts`, `tools/index.ts`, `tools/{market,analysis,journal,system,web}.ts`) while breaking the `mastra-v2/instance.ts ↔ tools` circular dependency; delete phantom `summarize_thread` across `shared`, `ai`, and `web`; delete `mastra-v2/registry.ts` and `db/src/queries/index.ts`; prune 19 unused `@kestrel/ai` `package.json` exports and harden `knip.json` + `scripts/check-knip-config.mjs`.
3. **[`03-phase3-deduplication-and-single-source-of-truth.md`](./03-phase3-deduplication-and-single-source-of-truth.md)**
   - **Focus:** Eliminate copy-pasted business logic and drift across `shared`, `db`, `ai`, and `web`.
   - **Key deliverables:** Consolidate the 4 `UIMessage` text extractors into `@kestrel/shared` (`extractMessageText`) and remove the conflicting legacy regex prefix in `packages/ai/src/runtime/message-text.ts`; deduplicate inline `FOLLOWUP_TERMS` regex in `/api/chat/route.ts`; extract canonical `recordProviderTestResult` and `updateUserByokApiKeys` helpers into `@kestrel/db` (replacing 9 duplicated blocks in `apps/web`); extract `verifyUserTwoFactorIfEnabled` in `apps/web/src/app/(app)/settings/_actions/shared.ts` (replacing 4 duplicated 2FA blocks); unify trade R-multiple/outcome computation in `/api/journal/import/route.ts` and raise `.max(5000)` to `MAX_PRICE_VALUE` (`1_000_000`) so `BTCUSDT` imports work; unify `executorFor`/`atomicExecutorFor` in `confirm/_lib/executors.ts` and `findMutationRun` in `cancel/route.ts`; replace buggy `inQuietHours` in `apps/web/src/lib/services/alerts.ts` with `isQuietHours` from `@kestrel/ai`; make `AlertRuleTypePlugin` generic to remove all 3 `any` casts in `rule-registry.ts` and unify `describeAlert`.
4. **[`04-phase4-boundary-honesty-and-ai-agent-ergonomics.md`](./04-phase4-boundary-honesty-and-ai-agent-ergonomics.md)**
   - **Focus:** Remove pass-through "service theater", enforce honest package boundaries with ESLint `error` severity, restore unreachable canonical chat tools, and upgrade AI coding agent hooks and instructions.
   - **Key deliverables:** Move raw Drizzle `schema.*` queries out of `apps/web/src/app/api/**` into domain services/repositories and delete `apps/web/src/lib/services/db.ts`; remove pass-through shims in `apps/worker/src/` and `apps/web/src/lib/services/mastra/`; replace 18 `@kestrel/ai` `getDb` imports in `apps/web` and `apps/worker` with `@kestrel/db` and stop re-exporting `getDb` from `@kestrel/ai`; promote ESLint `no-restricted-imports` from `'warn'` to `'error'` and cover `src/app/api/**/*.ts`; fix `setupCanonicalChat` tool filtering so `analyze_chart_image`, `annotate_chart`, `get_journal_stats`, `compute_position_health`, and `replay_setup` are wired to their capabilities; add deterministic quality hooks to `.claude/settings.json` and update root/package `AGENTS.md` files.

---

## 4. Global Rules for the Implementing AI Agent

1. **Never weaken a guardrail to make a task pass:** Do not raise `maxFiles` or `over300Lines` in `scripts/maintainability-baseline.json`, do not add suppressions (`eslint-disable`, `@ts-ignore`, `as any`), and do not add internal files to `knip.json` `entry` or `ignore`.
2. **Delete unused code outright:** Do not leave deprecated aliases, re-export shims, or commented-out blocks. Update all callers in the same task.
3. **Run verification before every commit:** Every task lists exact targeted test/typecheck/lint commands. Run them and verify green output before committing.
