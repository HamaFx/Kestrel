# @kestrel/worker — agent rules

Standalone scheduled-job runtime: pg-boss jobs, candle flush, plugin tick bus. Entrypoint `src/index.ts`; one-shot CLI `src/runner/cli.ts`.

## Conventions

- **Register every job in the `JOBS` registry** (`src/jobs/index.ts`) and extend `JobName` in `src/jobs/types.ts`. The scheduler and runner CLI iterate the registry; do not add if/else dispatch. Each entry declares its cron schedule and healthchecks.io env var.
- **Jobs receive `{ log, signal, tenantRouter }`.** Honour `ctx.signal` (an `AbortSignal`, aborted on SIGTERM) in long loops and pass it through to provider and database calls.
- **Tenant scope:** per-user jobs wrap their work in `withUserTenant(userId, ...)`; cross-tenant system work uses `withAdminDb(...)` from `@kestrel/db`. Under the non-bypass `kestrel_app` role an unscoped query silently returns zero rows, so a missing scope looks like empty data instead of an error.
- **Queues and dead letters:** pg-boss queue and DLQ names come from `@kestrel/db/queue` (e.g. `BACKTEST_RUN_QUEUE` / `BACKTEST_RUN_DLQ`); failed jobs dead-letter instead of disappearing. `src/bootstrap/queue-health.ts` snapshots counts and the newest dead letters for `/api/health`.
- Web `/api/cron/*` routes are fallbacks for Vercel deployments; when job logic changes, keep the worker job and its web fallback in parity.
