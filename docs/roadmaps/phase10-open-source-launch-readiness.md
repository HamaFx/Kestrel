# Phase 10: Open-Source Launch Readiness Plan

> **For AI Coding Agents (Claude Code, OpenCode, Codex, Cursor):**
> REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Canonical plan file: [`docs/superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md`](../superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md)

**Goal:** Complete the final 5 repository-hygiene, configuration, test-hermeticity, and asset-cleanup tasks to make Kestrel 100% ready for public open-source release under Apache-2.0.

**Completed in Phase 10A (Documentation & Cloud Metadata Scrubbing):**

- [x] Created root [`SECURITY.md`](../../SECURITY.md) with private vulnerability reporting instructions, security architecture boundaries, and operator responsibilities.
- [x] Created root [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) (Contributor Covenant v2.1).
- [x] Rewrote [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and [`SUPPORT.md`](../../SUPPORT.md) for external open-source contributors and operators.
- [x] Updated [`README.md`](../../README.md), [`docs/README.md`](../README.md), [`docs/configuration.md`](../configuration.md), and [`CHANGELOG.md`](../../CHANGELOG.md) to fix the broken `#-quickstart` anchor, add links to `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DEPLOY.md`, and `docs/architecture/README.md`, and replace `"private repository"` / `"source-available"` wording with `"open-source"`.
- [x] Scrubbed live GCP project IDs (`gen-lang-client-REDACTED`), project numbers (`000000000000`), Cloud Run URLs (`*.run.app`), `/opt/kestrel/.env`, and Cloudflare account IDs (`REDACTED_CLOUDFLARE_ACCOUNT`) from `docs/audit/kestrel-cloud-run-deployment-2026-11-02.md` and `docs/audit/kestrel-cloudflare-hosting-analysis-2026-11-01.md`.

**Remaining Tasks for Agent Execution (Phase 10B — Code, Scripts, Tests & Git Plumbing):**
See [`docs/superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md`](../superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md) for full step-by-step instructions:

- [ ] **Task 1:** Fix `.gitignore` rule ordering (`.env*` at line 84 overriding `!.env.example` at line 25), untrack `.entire/*` and `.opencode/*` (`git rm --cached`), and remove `entire` CLI hooks from `.claude/settings.json` and `.codex/hooks.json`.
- [ ] **Task 2:** Update `.github/CODEOWNERS` from the former organization team handle to `* @HamaFx` and replace the hardcoded personal Vercel URLs in `scripts/deploy-cloud.mjs`, `scripts/verify-production.mjs`, and `tools/lighthouse/run.mjs` with the neutral `https://kestrel.example.com` example.
- [ ] **Task 3:** Fix `isSemanticRoutingEnabled(env)` in `packages/ai/src/routing/index.ts` so `AI_SEMANTIC_ROUTING_ENABLED=0` (the documented default) is respected and `packages/ai/test/mastra-router.test.ts` no longer makes 4 live HTTPS POST requests to `generativelanguage.googleapis.com` during `pnpm test`.
- [ ] **Task 4:** Delete the 3 unused candidate JPGs in `apps/web/public/landing/candidates/` (~2.0 MB) and clean redundant `entry` hints in `knip.json`.
- [ ] **Task 5:** Delete local/remote `entire-checkpoint`, `refs/entire/*`, and `refs/agent/*` Git refs and run the full verification suite (`pnpm format:check && pnpm check:guards && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build:packages`).
