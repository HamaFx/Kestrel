<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Kestrel web rules

- **API routes** (`src/app/api/**/*.ts`): wrap handlers with `withAuth` (user session) or `withAdminAuth` (admin). Cron routes use `withCronAuth` (`src/lib/http/cron.ts`). Parse bodies with `parseJsonBody` and return failures with `errorResponse` (`src/lib/http/api/*`). Routes and their `_lib` helpers call `@/lib/services/*`; do not import `@kestrel/ai`, `@kestrel/data`, or `@kestrel/db` directly (ESLint enforces this). The one exception is `@kestrel/shared` (pure types, Zod schemas, `AppError` helpers).
- **Service layer:** `src/lib/services/*` owns domain orchestration, raw Drizzle queries, and cross-tenant scoping. A service must never be a 1-line re-export of a package; there is no `services/db.ts` convenience barrel.
- **Tenant scope in RSCs and Server Actions:** wrap tenant reads in `withUserTenantRO(userId, ...)` and writes in `withUserTenant(userId, ...)` from `@kestrel/db`. Under the non-bypass `kestrel_app` role an unscoped query does not error, it silently returns zero rows.
- **UI surfaces:** use the `surface-panel`, `surface-well`, and `surface-chip` utilities from `src/app/globals.css` for containers instead of ad-hoc borders and backgrounds, and stay on the semantic tokens (`--background`, `--surface`, `--foreground`, `--accent`, `--border`). Keep `.tsx` files under 250 LOC with `<= 4` `useState` and `<= 2` `useEffect` (`pnpm check:maintainability`).
