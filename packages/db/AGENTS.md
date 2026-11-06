# @kestrel/db — agent rules

Drizzle schema, migrations, RLS helpers, and canonical SQL queries.

## Conventions

- **Column types:** money that accumulates (balances, costs, PnL) is `numeric(20, 8)`; OHLC price bars and ticks use `double precision` (`src/schema/market/candles-1m.ts`). Never widen a money column back to float.
- **Migrations:** Drizzle v1 layout — add `drizzle/<YYYYMMDDHHMMSS>_<name>/migration.sql` plus its `snapshot.json`, generated with `pnpm --filter @kestrel/db migrate:gen` and validated with `migrate:check`. Folder names must sort after their parent (the timestamp prefix does that; keep the numeric prefix in the name suffix when two migrations share a second). Never edit an applied migration.
- **RLS and `kestrel_app`:** new tables must be reachable by the non-bypass `kestrel_app` role and carry `tenant_isolation` policies. Follow `0119_grant_app_role_privileges.sql`; that migration re-arms default privileges so later tables inherit grants.
- **Tenant scope helpers:** `withUserTenant(userId, ...)` for writes, `withUserTenantRO` for read-only callbacks, `withAdminDb(...)` for cross-tenant system work (`src/connection/scope.ts`, `src/tenant/with-user-tenant.ts`). Under `kestrel_app` an unscoped query silently returns zero rows.
- **Canonical queries** live in `src/queries/*` and are re-exported from `src/index.ts`. Do not add a second implementation of a query that `@kestrel/ai` already owns in `src/*/persistence/`.
