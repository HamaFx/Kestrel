# @kestrel/ai — agent rules

AI engine: Mastra v2 agents and workflows, tool registry, memory/RAG, and the integer-cent budget ledger.

## Conventions

- **Mastra v2 lives in `src/mastra-v2/`.** Agents register native Mastra tools with `createTool`; the canonical seven market tools are in `src/mastra-v2/tools/canonical/` with input schemas in `input-schemas.ts`. Tool names are the contract with the capability manifest and agent domain filters, so never rename one without updating callers.
- **Tool execute cores** accept an optional `AbortSignal` and fall back to `maybeGetToolContext()?.signal` (`@ai/runtime/tool-context`). Read-only tools must disclose freshness/staleness fields from `@kestrel/data` instead of dropping them.
- **Run-scoped cost ledger:** record every generation through `createGenerationLedger()` (`src/persistence/generation-ledger.ts`). Entry IDs are idempotency keys, so retries and duplicate callbacks cannot inflate the parent cost.
- **Budgets are integer USD cents.** Reservations are committed with their daily-counter increment in one transaction (`src/budget/budget-reservations.ts`); terminal transitions lock the ledger row `FOR UPDATE`. Never add a float-based path or a second reservation ledger.
- **Persistence for AI-owned domains** (alerts, journal, threads, telemetry, push, CoT, news) lives in `src/*/persistence/`; do not create parallel query layers in `@kestrel/db`.
- Use the intra-package `@ai/*` alias (mapped in `tsconfig.json`, aliased in `vitest.config.ts`, rewritten to relative by `scripts/rewrite-dist-imports.mjs`) instead of deep relative imports.
