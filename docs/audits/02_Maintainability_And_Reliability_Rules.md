# Maintainability, Reliability & Vibe-Coding Rules & Standards for Kestrel

> **Purpose:** Enforceable engineering standards tailored specifically to Kestrel's TypeScript 7 + Next.js 16 + Mastra v1.78 + Drizzle ORM monorepo. Grounded in [ISO/IEC 25010 Maintainability](https://www.sonarsource.com/resources/library/iso-iec-25010-explained/), [Software Improvement Group Quality Benchmarks](https://www.softwareimprovementgroup.com/blog/how-to-measure-code-quality/), [Vibe-Coding Maintainability Practices](https://joylo.ai/blog/keep-ai-generated-codebase-maintainable), and [TypeScript Reliability Patterns](https://dev.to/young_gao/error-handling-patterns-in-typescript-beyond-try-catch-3p8k).

## 1. Project-Specific File Size & Modularity Rules (`DEC-05`)

Every file in Kestrel must be small and cohesive enough that a human developer or AI coding agent can read, reason about, and modify the entire file in one pass without losing context.

| Rule ID      | Scope                                    |           Hard CI Ceiling            |             Target Ideal              | Structural Rule & Enforcement (`scripts/check-maintainability.mjs`)                                                                                                       |
| :----------- | :--------------------------------------- | :----------------------------------: | :-----------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RULE-F01** | **Backend, AI, Worker & DB `.ts` Files** |            **≤ 350 LOC**             |            **120–240 LOC**            | One primary responsibility per file (never mix Zod schema definitions, pure domain math, and Postgres queries in the same file).                                          |
| **RULE-F02** | **React `.tsx` Components & Pages**      |            **≤ 250 LOC**             |            **80–160 LOC**             | Separate state hooks (`use-<feature>.ts`), container/data logic, and presentational sub-components (`<feature>-section.tsx`).                                             |
| **RULE-F03** | **React Hook Density Cap**               | **≤ 4 `useState` / ≤ 2 `useEffect`** |   **1 custom hook or `useReducer`**   | Any component requiring 5+ state variables or complex multi-field form state must extract a dedicated `use-<name>.ts` hook or `useReducer`.                               |
| **RULE-F04** | **Static Catalogs & Seed Data**          |            **≤ 500 LOC**             |            **150–300 LOC**            | Pure declarative catalogs (e.g., `symbol-catalog.ts`, prompt templates, indicator definitions) may reach 500 LOC if they contain zero branching logic.                    |
| **RULE-F05** | **Directory Flat-File Cap**              |   **≤ 10 loose files per folder**    |       **4–8 files per folder**        | Package `src/` roots (`packages/ai/src/`, `apps/web/src/lib/`) may only contain `index.ts` and domain folders (`models/`, `routing/`, `budget/`, `auth/`, `http/`).       |
| **RULE-F06** | **Zero Sedimentary Duplication**         |    **0 parallel legacy modules**     | **Delete superseded code in same PR** | When replacing a subsystem (e.g., `mastra` → `mastra-v2`, Core Portfolio → `plugin-paper-trading`, Core Bot → `plugin-telegram-bot`), delete the old code in the same PR. |

## 2. High-Value Testing Policy (`DEC-06` — Strictly No Coverage-Padding Tests)

Writing random or superficial tests just to boost line coverage slows down refactoring, creates brittle mocks that break on every internal rename, and gives false confidence.

### 2.1 What MUST Be Tested (High-Value Targets Only)

Write tests **only** for these five high-leverage categories:

1. **Financial, Risk & Indicator Math Determinism:**
   - Margin/risk sizing, stop-loss/take-profit/trailing-stop fills (`plugins/paper-trading`), bar-by-bar backtest execution & point-in-time feature lookahead prevention (`plugins/backtesting`), indicator math (`packages/indicators`), and BYOK local spend budget calculations (`packages/ai/src/budget/`).
2. **Multi-Tenant Security, Auth & PostgreSQL RLS Isolation:**
   - Cross-tenant data isolation (`withTenantDb` / `app.current_tenant`), HMAC confirmation tokens for state-mutating AI actions (`mutation-policy.ts`), route auth boundaries, and BYOK key encryption/decryption (`vault.ts`).
3. **External Boundary & Contract Validation:**
   - Zod input/output contracts for AI tools (`contract-tool-outputs.test.ts`), market provider failover and stale-cache degradation (`packages/data`), and SSE stream framing/abort handling.
4. **Stateful Workflow & Concurrency Invariants:**
   - Idempotency under retries (outbox recovery, duplicate webhook/cron execution, Postgres advisory lock contention, and concurrent budget reservations).
5. **Confirmed Production Bug Regressions:**
   - Every fixed bug gets one focused regression test reproducing the exact input that triggered the failure.

### 2.2 What MUST NEVER Be Written (Banned Low-Value Tests)

- **NO Tautological / Mock-Echo Tests:** Never write a test that mocks a database or LLM function to return `X` and then asserts that the wrapper returned `X` without testing any transformation, branching, or error handling.
- **NO Trivial Existence or Getter Tests:** Never write `expect(myFunction).toBeDefined()`, `expect(component).toBeTruthy()`, or tests that merely assert static constant values.
- **NO Static File-Size or Directory Checks Inside Vitest:** Do not create `.test.ts` files just to check line counts or directory structure; enforce all static code-shape rules in `scripts/check-maintainability.mjs` so `vitest` stays 100% focused on runtime behavior.
- **NO Brittle Implementation-Detail Snapshots:** Do not assert internal React state hook call counts or full HTML DOM snapshots that break whenever Tailwind classes are tweaked.

## 3. Database Schema & Query Architecture Rules (`DEC-04`)

To keep `@kestrel/db` simple, fast, and maintainable without breaking Drizzle Kit or `withTenantDb`:

1. **RULE-DB01: 4 Domain Schema Sub-Barrels in `packages/db/src/schema/`**
   - Organize `packages/db/src/schema/` into four clean domain sub-barrels re-exported by `packages/db/src/schema/index.ts`:
     - **`schema/core/`**: `auth.ts`, `chat.ts`, `settings`, `share.ts`, `symbol-catalog.ts`
     - **`schema/market/`**: `live-ticks.ts`, `candles-1m.ts`, `news.ts`, `calendar.ts`, `cot.ts`, `intermarket-resonance.ts`, `snapshots.ts`
     - **`schema/ai/`**: `agent-opinions.ts`, `memory.ts`, `memory-projection.ts`, `daily-ai-spend.ts`, `budget-reservations.ts`, `mutation-executions.ts`, `full-analysis-queue.ts`, `briefings.ts`
     - **`schema/ops/`**: `alerts.ts`, `journal.ts`, `notifications`, `push.ts`, `noise-control.ts`, `telemetry.ts`, `tool-telemetry.ts`, `diagnostic-traces.ts`, `cron-runs.ts`, `rate-limits.ts`, `provider-daily-quota.ts`, `feature-flags.ts`, `admin-audit.ts`, `plugins.ts` (`user_installed_plugins`, `plugin_storage`)
2. **RULE-DB02: Plugin-Owned Schemas Live in `plugins/<name>/src/db/tables.ts`**
   - Feature plugins (`backtesting`, `paper-trading`, `custom-agents`, `telegram-bot`) define their own Drizzle table schemas and queries inside `plugins/<name>/src/db/`. Core `packages/db` only owns the generic `user_installed_plugins` and `plugin_storage` host tables.

## 4. Reliability & Error-Handling Rules ("Errors as Values")

1. **RULE-R01: Ban Silent `catch {}` Blocks (Replace All 108 Occurrences)**
   - Every `catch` block must use one of three explicit patterns from `@kestrel/shared`:
     - **`safeParseJson<T>(raw, fallback)`**: For non-critical JSON parsing fallbacks (eliminates ~25 `try/catch` blocks across `chat-transport.ts`, `api-client.ts`, and `chat-screen.tsx`).
     - **`bestEffort(fn, { operation, logger, fallback })`**: Executes non-critical side effects (cache cleanup, optional prefetch, telemetry flush) and logs a structured `debug`/`warn` diagnostic if it fails.
     - **`Result<T, AppError>` (`ok(val)` / `err(error)`)**: For domain services (`paper-trading`, `budget`, `full-analysis`) so callers explicitly handle expected operational errors.
2. **RULE-R02: Zero Side-Effects on Module Import**
   - Importing `@kestrel/ai` or `@kestrel/data` must never mutate global singletons or execute initialization code at top-level module scope. Use explicit, idempotent `ensureAiBootstrapped()` and `ensureDataProvidersRegistered()` calls in `apps/web/src/instrumentation.ts` and `apps/worker/src/index.ts`.
3. **RULE-R03: Typed Test Context Factories (`createMockToolContext`)**
   - Replace the 38 `{ } as any` casts in `packages/ai/test/` with a strictly typed `createMockToolContext(overrides)` helper in `@kestrel/test-utils`.
