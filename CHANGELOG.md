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

> The release is a private self-hosted multi-user BYOK platform with Postgres Row Level Security.

### Added

- **PWA / add-to-home upgrade (2026-10-25, `docs/pwa.md`):** the manifest is now installable end-to-end — pinned `id`/`scope`, `display_override` window-controls-overlay, `launch_handler`, `orientation: any`, a 1024px iOS icon, explicit `any`/`maskable` purposes, four install-dialog screenshots (two narrow, two wide) and described shortcuts. The install flow gained an engagement gate, progressive snooze (3 days → 14 days → stop) with `/settings/install` as a permanent escape hatch, `appinstalled` confirmation, and platform-specific instructions for iOS, macOS Safari and Chromium. Generated assets are driven by two shared inputs (`src/lib/pwa/pwa-theme.json`, `src/lib/pwa/splash-devices.json`): a real `favicon.ico`, iPad icon sizes, and correct per-device Apple launch images in both orientations (previously one image was reused for every media query). Push subscriptions now survive a push-service rotation (`pushsubscriptionchange` → IndexedDB → `/api/push/subscribe`), alerts set the app-icon badge, and notification targets are normalized to same-origin paths. New contracts: `test/pwa-manifest.test.ts`, `test/pwa-brand-contract.test.ts`, `test/pwa-install-preference.test.ts`, `tests/e2e/pwa-install.spec.ts`.
- **Plugin follow-ups (2026-10-25):** parameter sweeps on the durable `backtest-sweep` queue with a Studio Sweeps tab; 1-click deploy of a completed backtest to the autonomous Paper Sandbox with a minute strategy runner, pause/resume/stop and linked positions; per-user `PluginPacketEnricher` wiring (Paper Trading exposes open exposure); plugin-first `telegram` alert delivery; Custom Agent run history (`0111`), PDF knowledge upload and a QuickJS calculation sandbox. Migrations `0111`–`0113` add run history, sweeps and deployed strategy runs with forced RLS.
- **Custom Agents plugin (2026-10-25, Phase 6):** the Agent Studio at `/plugins/custom-agents` lets each user create standalone Mastra agents with a `@handle`, system instructions, Markdown skills (upload, paste, or installed-plugin playbooks), an allowlisted tool set, an optional model pin and remote MCP servers. Four starter agents ship on install (`@ict-mentor`, `@pine-coder`, `@macro-fed-watcher`, `@prop-risk-coach`). Agents run via `@handle` in chat/Telegram, the composer selector, or as read-only subagents delegated by the canonical agent. Migration `0110` adds `plg_custom_agents` with forced tenant RLS; MCP URLs are SSRF-checked and authorization headers are encrypted at rest.
- **Subscription + credit billing (2026-10-19, `docs/plans/kestrel-subscription-credit-billing-plan.md`):** exact-integer credit wallets, an append-only `credit_ledger`, reservation/reconcile/release lifecycle, monthly plan grants, top-up packs, Stripe checkout/webhook/portal, NOWPayments top-up parity, wallet/ledger APIs, admin wallet lookup + audited adjustments, billing/credit dashboards, shadow metering (`CREDITS_ENFORCEMENT_ENABLED=0`), 402 entitlement/credit gates, and reconciliation/reclaim crons. BYOK turns remain free; managed turns consume credits at 1 credit = $0.001. Migrations `0099`–`0104` add the tables, Stripe columns, telemetry attribution, seeded catalogue, and wallet backfill.

### Changed

- **PWA surface completion (2026-10-27, `docs/pwa.md`):** the follow-ups from the reliability pass are in. **Share target** — the manifest now registers `share_target` → `/share/receive` (GET), so another app can hand Kestrel a title/text/link; the receiver sanitises the untrusted payload (control characters and bidi overrides stripped, per-field caps, absolute http(s) URLs only) and fits the composed prompt to a percent-encoded budget before handing it to `/chat?prompt=…`, which creates the thread. **Periodic background sync** — on Chromium, an installed but rarely opened app now discovers deploys on its own: `src/lib/pwa/background-sync.ts` registers a `kestrel-shell-refresh` tag, and the worker's `periodicsync` handler calls `registration.update()` and revalidates the offline document plus the manifest, rate-limited by an IndexedDB stamp. **Phone-ready tables** — every data table (journal analytics and CSV preview, notification preferences, provider capability matrix, model comparison, and all eight admin tables) now stacks into labelled cards below 768px via the `table-stack`/`data-label` contract, with a guard test that fails if a new table is added without it; the journal's virtualized entry list is bounded by the viewport (`min(70svh,750px)`) instead of a fixed 750px that was taller than a phone screen.
- **PWA reliability pass (2026-10-27, `docs/pwa.md`):** the service worker was re-audited and its cache model rebuilt around what actually changes. `/_next/static/*` stays cache-first (content-hashed), while every _unhashed_ asset (`/icons/*`, `/fonts/*`, `/brand/*`, favicon, manifest) moved from cache-first to **stale-while-revalidate** — cache-first pinned the first artwork a device ever saw, and when the build id repeated there was no `activate` to purge it. Cache identity is now `kestrel-shell-v<buildId>-<assetRev>` where `assetRev` digests the precache list, so a repeated build id (same commit rebuilt, or a Docker image with no git metadata) still rotates the cache; Docker/Compose gained a `KESTREL_BUILD_ID` build arg so images can stamp a real release. The **privacy** boundary is now explicit: `/chat` is no longer precached and a failed navigation may only be answered from a public allowlist (`/offline`, `/login`, `/landing`) — previously any cached HTML could be replayed. `activate` repairs a missing offline document, and push payloads may carry up to two notification `actions` (a `dismiss` action closes silently) with malformed entries dropped. Machine-specific: the worker's own source line in `sw-register.tsx`-driven updates is unchanged, but `/sw.js` now embeds the asset digest.
- **Mobile shell geometry (2026-10-27):** a single `--bottom-nav-h` token owns the phone bottom bar, so the bar height, the page's bottom clearance and the floating surfaces can no longer drift. The page previously cleared 80px while the bar could be ~90px tall on a home-indicator iPhone, hiding the last row of a list; toasts and the offline banner now rise above the bar instead of sitting behind it. Drawer navigation rows grew to 44px (the touch-target minimum used everywhere else) while the desktop rail keeps its compact 36px rows via a `dense` flag; the bottom bar's "More" tab now shows the current state for every destination that is not one of the four tabs (Market, Chart, Settings, plugins) instead of leaving the bar with nothing highlighted. Fixed: on macOS, `platform-detect` classified every Mac as an iPad because `'ontouchend' in window` is true in all modern desktop browsers — desktop Safari users were shown iPad install steps and lost "Add to Dock" (the iPadOS branch now requires `maxTouchPoints > 1`). `useCoarsePointer` now watches the media query instead of sampling once, so the command launcher reacts to docking/undocking. `pnpm dev` generates the service worker in a `predev` hook, so a fresh clone registers a real worker instead of 404ing. Cleanup: dead `.touch-swipe-hint` CSS, an undefined `message-composer-safe-bottom` class, an unused `--fab-bottom` token, the inert vaul `shouldScaleBackground` default, and an `offline-banner` retry button that could stick disabled forever.
- **PWA test coverage (2026-10-27):** the service worker is no longer only pattern-matched. `test/service-worker-runtime.test.ts` executes the real template in a service-worker sandbox (caches/fetch/clients/registration/IndexedDB fakes in `test/helpers/`), covering install (per-URL precache, 404/redirect tolerance), activate (stale-cache purge, preload, offline repair), every fetch strategy, the bypass list, the message contract, push rendering/actions/URL normalization, notification clicks and subscription rotation — 33 behavioural tests. Added `pwa-http-contract.test.ts` (headers for `/sw.js`, `/sw-precache.json`, manifest, artwork; public-path policy), `pwa-platform-detect.test.ts` and `pwa-push-store.test.ts` (both previously untested). Generator writes are now isolated behind `KESTREL_SW_OUT_DIR`, so the test suite can no longer race the served `public/sw.js`. `tests/e2e/nav-drawer.spec.ts` was repaired (it still asserted removed "Markets"/"Dashboard"/"Chat" navigation labels) and now also runs under the touch `mobile-chrome` project.
- **iOS shell polish (2026-10-26):** the installed app no longer requests a translucent status bar — iOS 26.1+/27 paints its Liquid Glass bar over the top edge of standalone web apps, which smeared the header underneath it ("the top of the app is blurred" on an iPhone 14 Pro Max). The status bar is now the default style (opaque, tinted from `theme-color` #121212) while `viewport-fit=cover` and `pt-safe` keep the layout correct either way. Also fixed: the mobile bottom nav squeezed its icons into 22px on devices with a home indicator (`h-14` + `pb-safe`), landscape cutouts are now respected (`px-safe` on the shell, left inset on the nav drawer), text fields get a 16px floor on WebKit touch devices so focusing them no longer zooms the page, and the base layer drops the tap-highlight flash, landscape text inflation and the double-tap-zoom delay. `interactive-widget=resizes-content` keeps the chat composer visible above the keyboard on Chromium.
- **PWA hardening (2026-10-25, `docs/pwa.md`):** service-worker fixes — the install precache no longer uses atomic `cache.addAll` (a single 404, such as the missing favicon, left the app with no offline shell at all), `/offline` moved out of the authenticated `(app)` route group so it is genuinely public and precacheable, failed navigations fall back to `/offline` instead of the authenticated `/chat` shell, navigation preload is enabled, `SKIP_WAITING` messages are handled, and updates now wait for explicit consent so a deploy cannot swap JS chunks mid-edit. Personalised responses are still never cached. Design tokens now flow into the manifest, icons, splashes and screenshots from `src/lib/pwa/pwa-theme.json` (previously hardcoded `#0A0A0A` against a `#121212` app background), and the settings navigation gained **Install app**.
- **Audit 2026-10-18 remediation (Phases 0–5, `docs/audits/mastra-agentic-deep-audit-2026-10-18.md`):** packet-cache freshness is now TTL-bound on every path (B-02), the indicator memo keys on data production time (I-01), abort/deadline cancellations no longer count as diagnostic errors (N-01), a blocked comparison symbol no longer fails the whole comparison (F-01); non-XAUUSD packets carry a generic macro extension (news + calendar + COT, `ENABLE_GENERIC_MACRO`; M-02) and comparisons honestly label themselves as per-symbol desk passes plus synthesis (M-01); committee opinions require a degraded-data disclosure and one bounded grounding retry (P1-01), and comparisons run a risk desk per symbol (P1-04, `ENABLE_COMPARISON_RISK_DESK`); the packet pipeline shares one candle fetcher (P2-02), guardrails reuse the turn's resolved model (P2-03), and the committee workflow is split into dispatcher + per-graph modules (Phase 4).

### Deprecated

- **Legacy `packages/ai/src/tools/` AI SDK shims — removal target 2026-12-15 (audit 2026-10-18, P2-01).** The seven tools that already have native Mastra registrations (`get_price`, `get_candles`, `get_indicators`, `get_market_structure`, `get_news`, `get_cot`, `search_knowledge`) keep their AI SDK wrappers for one release of wire compatibility. Operators can verify the native path today with `PHASE_TOOLS_SHIMS=0` (the shims are then not registered; internal consumers resolve the native registrations). The shim modules and their sub-path exports are deleted on the removal target date; see `docs/configuration.md` for the flag.

- **Dependency refresh (2026-10):** every workspace dependency moved to its latest release, including the coupled majors:
  - Next.js 16.4, React 19.3, Zod 4, AI SDK 7 (`@ai-sdk/*` 4.x), Mastra 1.78, Langfuse SDK 6
  - Test tooling: Vitest 5 + Vite 8, jsdom 30, MSW 3, Testing Library updates; `vitest.workspace.ts` replaced by `test.projects`, coverage thresholds recalibrated for the AST-aware V8 remapper
  - Linting: ESLint 10 with the new `no-useless-assignment` / `preserve-caught-error` rules applied
  - Toolchain: pnpm 12 (workspace `overrides` from `pnpm-workspace.yaml` are now actually applied; `allowBuilds` covers esbuild/protobufjs/sharp), Node 22.23.3 pins (CI, Docker, nvmrc), with `minimumReleaseAge` disabled intentionally because this repo tracks same-day releases
  - Remaining `pnpm audit` findings are two upstream transitives with no patched release (`braces`, `sprintf-js`); CI's critical-level gate passes

- **Private self-host debloat:**
  - Removed deprecated `NEXTAUTH_SECRET` grace alias in favor of canonical `AUTH_SECRET`.
  - Development secrets are now stored exclusively in `.kestrel/dev-secrets.json` (migrated from legacy dev paths).
  - Dropped all historical `HAMAFX_*` aliases; canonical `KESTREL_*` environment variables are enforced strictly.
  - Sentry and Google Vertex AI transports removed; AI provider registry streamlined with direct Gemini and BYOK providers.
  - Docker Compose defaults minimal footprint (`db`, `app`, `worker`, `backup`); full Langfuse observability stack moved to `docker-compose.observability.yml` overlay.
  - CI workflows and scripts decluttered for private repository development directly on `main`.
- **Documentation overhaul:** current procedural docs for the multi-user release, replacing the old 15-doc set:
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

The first planned stable application release for the self-hosted beta. The application release version is independent from workspace package versions.

## [0.0.0] — Historical pre-release

The historical development series shipped through Phases 0–9 plus UX upgrade Phases A–E before the first formal application release.

### Shipped Features (cumulative)

**Phase 0–1:** Project scaffolding, Turborepo monorepo, Next.js 16 PWA, local dev, Drizzle ORM schema, BiQuote REST provider, Finnhub fallback, basic chat with AI SDK.

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
