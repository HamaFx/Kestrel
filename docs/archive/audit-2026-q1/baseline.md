# Baseline Metrics — Audit Upgrade Plan (Phase 0.4)

> Snapshot taken 2026-10-10 before Phase 1 implementation, on `main` at
> `db0d07c7` (+ untracked `docs/plans/`). Reference for Phase 2 latency/token
> comparisons and the Checkpoint 4 knip target.

## Commands

- `pnpm typecheck` — **green** (exit 0, turbo cached ~75ms on warm run).
- `pnpm --filter @kestrel/ai test` — **green** (baseline suite; see counts below).
- `pnpm lint` — green at baseline.
- `knip` — see "knip baseline" below (run `pnpm knip` to reproduce; target at
  Phase 4 checkpoint: unused-export count ↓30% vs this baseline).

## Test suite (packages/ai)

Recorded from the baseline run before any Phase 1 changes:

- Files: 161 test files passed / 1 skipped (162).
- Tests: 1357 passed / 22 skipped (1379).
- Coverage thresholds enforced by `packages/ai/vitest.config.ts`:
  statements 55, branches 70, functions 60, lines 55 (global floor).

## Key structural facts measured during the audit

- `committee/workflow.ts` — per-request factory, 339 LOC, retryConfig
  `{attempts: 2, delay: 2000}`.
- Packet serialization: `serializeSymbolResearchPacket` called once per
  specialist + once per fusion prompt (5× per Full run).
- `/api/chat` route: `maxDuration = 60`, `ROUTE_TIMEOUT_MS = 55_000`.
- Durable Full: `FULL_ANALYSIS_LEASE_MS = 90_000`, heartbeat 30s,
  `FULL_ANALYSIS_ESTIMATE_USD = 0.05 + observational allowance`.
- Circuit breaker: in-memory `Map` only (`model-circuit-breaker.ts`), threshold
  3 failures / 30s open / 60s window.

## Latency

Committee p95 latency was not captured in Langfuse at baseline (tracing is
optional in deployments). Phase 2 checkpoint should measure p95 for `single`
and `full` from `chat_telemetry` (`mastra_mode` / `mastra_full_job` rows)
instead of relying on this file.

## Baseline behavior contracts (pre-upgrade)

- Modes: `single | quick | standard | full | auto` (`resolveMode`).
- `single`/`auto` + XAUUSD → legacy XAUUSD path; quick/standard + symbol →
  synchronous committee; full → durable queue; else canonical chat.
- `MODE_POLICY`: only `full.strict = true`; single/quick/standard continue on
  partial failure.
- `/api/chat` rejects Full-mode `modelOverride` with 400 INVALID_MODEL_OVERRIDE.
- Budget: `reserveTurnBudget` throws `BudgetExceededError` when the daily cap
  is hit; `/api/chat` maps it to 429 BUDGET_EXCEEDED.
- Guardrails: research guardrails strict only when `NODE_ENV=production` or
  `MASTRA_STRICT_GUARDRAILS=true`; canonical chat hard-codes strict.
