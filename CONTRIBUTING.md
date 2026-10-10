# Contributing to Kestrel

This is a private repository. All development lands directly on `main` or via review branches.

## Workflow

1. Create a branch or work directly on `main` for planned slice commits.
2. Make atomic, reviewable commits following the commit convention.
3. Ensure verification passes before landing:
   ```bash
   pnpm check:env-contract
   pnpm turbo run typecheck
   pnpm turbo run lint
   pnpm turbo run test
   ```

## Commit Convention

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`

## Local Development

```bash
pnpm install
pnpm setup          # generates .env and secrets
pnpm dev            # starts local dev environment
```
