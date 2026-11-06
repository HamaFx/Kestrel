## Description

Summarize the change and the problem it solves. Link the issue it closes.

Fixes #

## Type of change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Documentation or tooling change

## Verification

- [ ] `pnpm format:check`
- [ ] `pnpm check:guards`
- [ ] `pnpm knip --no-progress`
- [ ] `pnpm check:fast` (or targeted `pnpm typecheck` / package tests)
- [ ] `pnpm test:postgres-rls` when the change touches database queries, RLS, or migrations

## Checklist

- [ ] I reviewed the change myself and kept it focused.
- [ ] Tenant reads and writes run inside `withUserTenant` / `withUserTenantRO`; cross-tenant system work uses `withAdminDb`.
- [ ] New migrations are included under `packages/db/drizzle` and keep forced RLS.
- [ ] Files stay within the code-shape limits (`.ts` 500 LOC, `.tsx` 450 LOC).
- [ ] Documentation figures use the mdxcn dialect and `pnpm check:figures` passes.
- [ ] No secrets, `.env` files, cloud identifiers, or personal credentials are included.
- [ ] I added behavioral tests only where the invariant is not already covered by the static guards.
