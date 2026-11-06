# Migrations

Drizzle Kit v1 layout: one folder per migration.

```
drizzle/
  <YYYYMMDDHHMMSS>_<name>/
    migration.sql
    snapshot.json
```

## Rules

- Add migrations with `pnpm --filter @kestrel/db migrate:gen` (or
  `migrate:gen:custom` for hand-written SQL). Never create `migration.sql`
  by hand without a snapshot.
- Validate with `pnpm --filter @kestrel/db migrate:check`.
- Never edit an applied `migration.sql`. Its SHA-256 is recorded in
  `drizzle.__drizzle_migrations.hash`.
- Folder order is name order. The 14-digit UTC prefix carries the
  timestamp; when two migrations share a second, keep the numeric prefix in
  the suffix (`..._0011_alert_snooze`) so the order stays deterministic.

## Historical snapshots

The chain was converted from the pre-v1 `meta/_journal.json` layout without
the original v0 snapshot files (the repository never had them). Every
folder before `0127_tenant_fk_indexes` therefore carries a placeholder
snapshot; `0127` and everything generated after it carry real snapshots, and
the tip is authoritative for `src/schema`. Consequences:

- `drizzle-kit generate` and `drizzle-kit check` are correct: they diff
  against the tip, which matches the TypeScript schema.
- Historical snapshots are **not** a record of the schema at that point in
  time. Do not use them for archaeology or for reconstructing an old
  database state; replay the SQL instead.

The migration SQL files and their hashes are unchanged from the v0 folder,
so databases that already applied them stay applied. `migrate()` backfills
`name` / `applied_at` on the first v1 run.
