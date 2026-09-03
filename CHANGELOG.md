# Changelog

All notable changes to Kestrel are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** Starting from the documentation overhaul (2026-07-04), this changelog
> is maintained manually for user-facing changes. Internal package versioning is
> handled by [Changesets](https://github.com/changesets/changesets) — see
> [CONTRIBUTING.md](CONTRIBUTING.md) §9 for the release process.

---

## [Unreleased]

> The upcoming public OSS release is a single-user, self-hosted BYOK preview. Shared multi-user/RLS mode and hosted billing are not part of this release.

### Added

- **Beginner-friendly updates:** `pnpm update` checks the newest stable GitHub Release, asks before backups and migrations, preserves local configuration/data, rebuilds Docker installations, and reports health failures.
- **Update documentation:** Added the complete update plan plus user-facing update and recovery instructions.
- **Documentation overhaul:** current procedural docs for the single-user OSS release, replacing the old 15-doc set:
  - `README.md` — public product scope and quick start
  - `docs/deployment-matrix.md` — supported deployment profiles
  - `docs/audit/` — readiness status, findings, history, and validation records
  - `SECURITY.md` — security policy and operator responsibilities
  - `CONTRIBUTING.md` — development and contribution workflow
- **Community docs:** `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`
- Legacy documentation references were removed from the public guide; the current public documentation lives in the repository root and the implementation directories.

### Changed

- Completed Phase 9 of the AI/agentic-system cleanup: shared native-memory preparation, model-visible preference isolation, strict user/thread scope, capability-specific semantic recall, durable/idempotent thread backfill, opt-in independently budgeted observational memory, explicit degraded-memory metadata across traces/UI/worker paths, and Mastra runtime retention pruning.
- Completed Phase 8 of the AI/agentic-system cleanup: typed Full-mode retry semantics (lease/quota/transient/permanent), worker-side execution-plan identity validation, and a budget fix so retryable Full-mode failures keep the enqueue-time reservation until the run reaches a terminal outcome — successful retries now book their actual cost exactly once. Queue-to-Mastra dispatch, FSM transition, and budget exactly-once property tests added.
- Completed Phase 0 of the AI/agentic-system cleanup: baseline invariants (terminal-state matrix, storage authority matrix, route decision matrix), deterministic cost fixtures for every billed generation kind, no-mutation-tool exposure assertions across all read-only capabilities and committee specialists, and chat-route user/thread mismatch + exact idempotency-key coverage.
- Completed Phase 1 of the AI/agentic-system cleanup: Mastra model snapshots, explicit answer/memory metadata, mutation-before-routing classification, bounded background generation, heartbeat/lease error separation, duplicate progress removal, and single-counted committee cost aggregation.
- Completed Phase 10 of the AI/agentic-system cleanup: removed unused Mastra workflow, capability-registry, mode-barrel, and proof-runner compatibility surfaces; committee execution, capability policy, and mode routing now use their canonical modules directly. The removed internal exports were never used by the web or worker release paths.
- Historical documentation indexes and audit/plan artifacts were consolidated into the current architecture, validation, and operational guides.
- Old numbered and review/audit docs were replaced by the current procedural documentation set.
- Community security and contribution guides were refreshed for the OSS release.

### Security

- Documented the historical auth hardening work in `SECURITY.md` and the current auth implementation:
  - Token-version invalidation
  - Signed user-header protection
  - Deleted-user session validation
- Documented data provider licensing gaps — no terms files exist in repo

---

## [0.1.0] — First public beta

The first planned stable application release for the single-user, self-hosted OSS beta. The application release version is independent from workspace package versions.

## [0.0.0] — Historical pre-release

The historical development series shipped through Phases 0–9 plus UX upgrade Phases A–E before the first formal application release.

### Shipped Features (cumulative)

**Phase 0–1:** Project scaffolding, Turborepo monorepo, Next.js 16 PWA, PGlite local dev, Drizzle ORM schema, BiQuote REST provider, Finnhub fallback, basic chat with AI SDK.

**Phase 2:** Alert system, trading journal, economic calendar (FRED), news feed (Marketaux), dashboard with widgets, chart engine (TradingView + lightweight-charts).

**Phase 3:** Multi-user auth (NextAuth v5), BYOK (10-provider registry, AES-256-GCM encryption), web push (VAPID), PWA service worker, CSP headers, CSRF protection, account lockout.

**Phase 4–5:** Security hardening, soft-delete, Postgres enums, FTS, observability (Sentry, Langfuse), incident response playbook, backup/restore scripts.

**Phase 6–7:** AI agent expansion — 33 registered tools, plan-then-act, citation enforcement, budget guardrail, tool telemetry, multi-agent committee (5 agents), decision signal tracking, intermarket resonance, social sentiment, portfolio management.

**Phase 8:** Worker daemon (SignalR consumer, tick buffer, 1m candle aggregator), Binance WS consumer, systemd timers (22 units), healthchecks.io integration, GCE VM infra, self-update mechanism.

**Phase 9:** Multi-tenant v2 — RLS foundation (migrations 0035–0039), BYPASSRLS admin role, tenant constraints, NOWPayments billing (plans, subscriptions, payments, IPN webhook), billing gate (feature gating).

**UX Phases A–E:** Institutional terminal UI redesign, chat UX overhaul, 39 tool UI parts, settings redesign, onboarding flow, dashboard widgets.

### Release boundary and remaining considerations

| Area                       | Current OSS status                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Shared RLS/multi-user mode | Intentionally blocked until every user-data query establishes tenant context and the PostgreSQL isolation suite passes |
| Hosted billing             | Separate hosted-product track; not enabled as a self-hosted OSS service                                                |
| Data provider licensing    | Each operator must review provider terms and obtain any required redistribution rights                                 |
| Disaster recovery          | Docker backup/restore is smoke-tested; operators must still configure off-host copies and rehearse recovery            |
| Secret rotation            | Guarded maintenance utility exists; operators must stop writers and retain recovery material                           |

---

## How This Changelog Is Maintained

- **User-facing changes** (features, breaking changes, security fixes) are recorded here manually
- **Package versioning** is automated via Changesets — the `release.yml` workflow creates version PRs
- **Internal refactors** that don't affect users are not logged here (see git history)
- Each entry links to the relevant PR or commit when available
