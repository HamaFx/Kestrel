# @kestrel/db — agent rules

Drizzle schema, migrations, RLS helpers, and canonical SQL queries.

## Conventions

- **Column types:** money that accumulates (balances, costs, PnL) is `numeric(20, 8)`; OHLC price bars and ticks use `double precision` (`src/schema/market/candles-1m.ts`). Never widen a money column back to float.
- **Migrations:** add `drizzle/NNNN_name.sql` plus a journal entry in `drizzle/meta/_journal.json`. The entry `when` must be strictly greater than the previous entry (last is `0122_audit_phase4_cleanup`). Never edit an applied migration.
- **RLS and `kestrel_app`:** new tables must be reachable by the non-bypass `kestrel_app` role and carry `tenant_isolation` policies. Follow `0119_grant_app_role_privileges.sql`; that migration re-arms default privileges so later tables inherit grants.
- **Tenant scope helpers:** `withUserTenant(userId, ...)` for writes, `withUserTenantRO` for read-only callbacks, `withAdminDb(...)` for cross-tenant system work (`src/connection/scope.ts`, `src/with-user-tenant.ts`). Under `kestrel_app` an unscoped query silently returns zero rows.
- **Canonical queries** live in `src/queries/*` and are re-exported from `src/index.ts`. Do not add a second implementation of a query that `@kestrel/ai` already owns in `src/*/persistence/`.
