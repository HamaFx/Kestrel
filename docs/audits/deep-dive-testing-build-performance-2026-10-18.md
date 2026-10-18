# Kestrel — Deep-Dive Audit: Testing, Build, Performance & Bugs

**Date:** 2026-10-18
**Commit:** `6d4a4d1d` (main)
**Scope:** 1,184 source files / 174,409 LOC source, 425 test files / 68,629 LOC tests, 8 workspaces, 4 CI workflows.
**Method:** four parallel deep dives (testing architecture, build architecture, web runtime, backend runtime) plus first-hand verification of every headline claim (full monorepo test run, turbo dry-runs, cache inspection, coverage configs, workflows, GitHub API checks, source reads). No source file was modified by the audit.

**Ground truth established personally:**

- Full suite: **3,530 passed / 39 skipped / 0 failed** (all 8 workspaces, `ANTHROPIC_*` unset, ~6 min sequential on a 4-core box).
- `pnpm typecheck` 15/15, `pnpm lint` 14/14, `knip` clean, `check:route-security` (112 routes), `check:env-contract`, `test:empty-guard` (396 files) all pass.
- Zero `.only`, 2 `.skip` occurrences total, 0 TODO/FIXME in source.
- `pnpm outdated`: only deliberate pins remain (`@types/node` 22 LTS; TS 6 for the ESLint toolchain).
- `pnpm audit`: 1 high + 1 moderate, both upstream transitives with no patched release (`braces`, `sprintf-js`).

---

## 1. Scorecard

| Area | Rating | Verdict |
|---|---|---|
| **Testing architecture** | **5.5 / 10** | Green, honest suite with real integration testing for the deterministic core — but security-sensitive web/db surfaces sit at ~25%/23% coverage, one CI step is self-defeating, and 83% of test CPU is module loading. |
| **Build architecture** | **6.0 / 10** | Tuned Docker/turbo craft undermined by mis-declared cache outputs (8 GB of cache for one task), a structurally broken E2E CI job, and missing build-env plumbing. |
| **Web runtime** | **7.0 / 10** | Production-grade primitives with high-leverage defects: per-render DB round-trips for `auth()`, LLM calls inside DB transactions, 154 KB gzip of three.js on the landing page. |
| **Backend runtime** | **7.0 / 10** | Strong systems design (leases, cron locks, single-flight, streaming) with real bugs: newest-messages slicing, shutdown ordering, an O(n²) indicator, a circuit breaker that rarely opens. |
| **Overall** | **≈ 6.5 / 10** | Above-average discipline held back by systemic "declared vs actual" drift: cache keys, coverage thresholds, CI gates, trust boundaries. |

---

## 2. Testing architecture (5.5 / 10)

### 2.1 How it's built

8 Vitest 5 projects (per-workspace configs; web split into `web-node`/`web-jsdom` with zero overlap), Turbo orchestration, Playwright 5 projects, k6 harness, nightly eval gate. Layers: pure-function suites (indicators `fast-check` properties, zero mocks), mocked-boundary service tests, 34 route-handler tests, 42 jsdom component tests, real-Postgres integration suites behind env gates, 29 E2E specs (493 tests across 5 local browser projects).

### 2.2 Verified strengths

- Real behaviour where it matters: AES-GCM round-trips, real Postgres + role switching for RLS ("only real PostgreSQL proves role/RLS semantics"), real Drizzle SQL compilation, property tests.
- No `.only`, no `.todo`, no outbound network in unit tests; fake timers are the house habit (30 usages).
- Turbo hashing is correct for coverage runs — the pass-through `--coverage` changes every task hash.

### 2.3 Critical problems

| # | Finding | Evidence | Impact |
|---|---|---|---|
| T1 | `Report Coverage` CI step fails whenever tests pass | `ci-fast.yml:95-98` + action default `json-summary-path: coverage/coverage-summary.json` + no config sets `coverage.reporter` → summary file never exists; action source does `core.setFailed` + rethrow on missing file | `unit-tests` job can never pass → `required-status` blocks every PR. Also points at root `vitest.config.ts` which has no thresholds. |
| T2 | Middleware matcher test guards a hand-copied regex, already drifted | `apps/web/test/middleware-matcher-coverage.test.ts` duplicates `proxy.ts` matcher; copy missing `offline` and `api/health/alerts` | SEC-1 "every protected route is matched" invariant unenforceable. |
| T3 | Security code at 0% coverage | `nowpayments.ts` 0/51 stmts; telegram webhook route 0/37; `packages/db/src/queries/auth.ts` 0/99; `ipn-events.ts` 0/81; `settings/_actions-security.ts` 2/172; `(auth)/actions.ts` 18/224 | Payment, auth, 2FA boundaries only tested as mocks. |
| T4 | Coverage floors are ratchet-only | web 25.7% actual vs 24/21/20/25 thresholds; db 22.9% stmts / 13.6% functions vs 21/15/12/21; ai 65.5%, data 70%, shared 84.6%, indicators 90% | <2 pts headroom; new untested code red-lines CI or forces lowering the bar. |
| T5 | 78 of 112 API route handlers never executed by a test; 36 of 39 db query modules untouched | route import cross-reference; `rg "queries/" packages/db/test` | The wiring layer (routes ↔ DTOs ↔ queries) is largely untested. |

### 2.4 High/medium

- **T6** — E2E is not a required check, CI runs chromium only (Firefox/WebKit/mobile advertised but never run in CI), `real-system.spec.ts` permanently skipped; ~28 stale assertions vs the redesigned UI documented in `test_audit_plan.md`.
- **T7** — `throttle-postgres.test.ts` (the only test of the production Postgres throttle path) requires `RUN_PG_TESTS`/`THROTTLE_TEST_*`, which no workflow sets — never runs anywhere.
- **T8** — Nothing runs on `push` to `main` (both workflows are `pull_request`-only; development lands directly on main) and `.githooks/pre-commit` is not installed (`core.hooksPath` unset); the scanner only blocks `.env*` files.
- **T9** — Turbo `envMode: strict` filters undeclared env from test tasks; ai tests reference ~29 env vars, only 8 declared → `pnpm test` ≠ `pnpm --filter … test`.
- **T10** — ~86 tests are `readFileSync` source-greps; one provably stale. `check-test-files.mjs` regex misses `it.skipIf`/`it.runIf` and `it.each<…>`.
- **T11** — Wall-clock test with 100 ms margin (`runner-lock.test.ts`); 5 s default timeout everywhere except db; 13.5 s test in ai with per-test escapes.

### 2.5 Speed

Measured run: ai 159 s (83% import), web 128 s (42% import + 23% environment + 14% setup), all others < 27 s. With coverage: ~676 s summed, only ~112 s executing tests. Root cause: `packages/ai/vitest.config.ts` uses `resolve.conditions: ['source']` with no `deps.optimizer` → Vitest transforms the Mastra/AI-SDK dependency TS sources. Per-file worker spawn ~282 ms × 425 files. `isolate:false` is blocked today: ai test files mock shared modules incompatibly (22 failures with `--no-isolate`).

---

## 3. Build architecture (6.0 / 10)

### 3.1 How it's built

Turbo 10-task graph → tsc package builds (+`rewrite-dist-imports`) → web = `next build` (Turbopack) + SW generation; worker = 2× esbuild bundles; 4 deploy paths (Compose, GCE VM self-update, Vercel, Botkeep slim). All consumers compile `packages/*/dist`, never `src` (worker esbuild metafile: 495 dist inputs / 0 src); only Vitest uses the `source` condition.

### 3.2 Verified strengths

Digest-pinned images enforced by a checker; `.nvmrc` = CI = Docker (`22.23.3`); `--link`/`--chown`; pnpm-store + Next + turbo cache mounts; `pg_advisory_lock` migrations; flock'ed self-update with rollback tags and health gate; lockfile + engines in the turbo hash; real route/env contract gates.

### 3.3 Problems

| # | Finding | Evidence | Impact |
|---|---|---|---|
| B1 | Turbo `build.outputs` captures `.next/dev/**` | cache manifest contains 6,074 `.next/dev/` paths; 4× entries of 1.8–1.9 GB; `.turbo/cache` = 8.1 GB / 2,271 entries; disk 79% full | ~1.9 GB written per web build; local cache dominated by dev junk. |
| B2 | E2E CI job cannot pass as written | CI webServer = `pnpm build && pnpm start` with 120 s readiness timeout; workflow has no workspace build step; measured cold Next build 6 min; `@kestrel/*` resolve to absent `dist/` on fresh checkout | Two independent failure modes in the UI-quality gate. |
| B3 | `public/sw.js` / `public/sw-precache.json` not declared outputs | generated post-build, gitignored, absent from `turbo.json outputs` | A cache replay in a clean workspace produces a tree without a service worker; Docker ships from that tree. |
| B4 | Build-inlined `NEXT_PUBLIC_*` vars missing from hash and Docker | `NEXT_PUBLIC_GOOGLE_ENABLED`, `NEXT_PUBLIC_ENABLE_DEV_LOGIN` used in client components; not in `build.env` nor Docker ARGs | Self-hosted image cannot enable Google login / dev login; flag flips silently cache-hit. |
| B5 | Worker image ships ~100 MB of sourcemaps + 406 MB mostly-dead node_modules | `sourcemap: true` hard-coded; `dist` 147 MB on disk; COPY layer 554 MB for a 25 MB bundle | Deploy size/speed, esp. on 1 GB-RAM free tier. |
| B6 | Docker context 414.75 MB | `.dockerignore` misses `**/dist` (147 MB), `blob-report` (183 MB), coverage, `*.tsbuildinfo` | Layer-busting; host artifacts leaked into images. |
| B7 | CI cache design | both jobs save the same immutable key; unit-tests restores 2.4 GB `.next/cache` it never uses; per-SHA full uploads; no turbo remote cache | ~2.4 GB churn/commit, repeated web builds, timeouts below measured p95. |
| B8 | Zero Docker CI coverage; non-deterministic Next build id (9 distinct manifests); dead tsconfig aliases + inert `webpack()` hook; `bundle-size-guard` patterns can't match Turbopack's hashed names | verified in files/manifests | Deploy rot discovered by operators only; unstable image digests; degenerated size guard. |

**Speed fixes with estimates:** outputs fix (B1) → entries 1.9 GB→~110 MB, local cache → <1 GB; drop `^build` from lint + `customConditions` for typecheck → skip ~35 s of tsc before linting; build-once + artifact for E2E shards → replaces 2×6 min cold builds; remote cache → warm web builds everywhere; worker hygiene (B5) → image content 191 MB→~100 MB.

---

## 4. Bugs found (verified, deduplicated, severity-ranked)

### Correctness — high

1. **Newest-messages slicing bug** — `listMessages` orders ASC + LIMIT (`packages/ai/src/persistence/message-persistence.ts:75-76`, `packages/db/src/queries/threads.ts:249-250`); the canonical chat stream uses it for 60-message history, so on any thread >60 messages the model receives the oldest 60 and never the turn it is answering. Same helper drives the UI thread view (oldest 200), export, and summary.
2. **Worker shutdown closes the DB pool before stopping jobs** — cleanups run in reverse registration order, so `closeDb()` runs before `stopScheduler` (`apps/worker/src/index.ts:416-419` vs `:491`); in-flight jobs write into a torn-down pool on every restart.
3. **`auth()` costs a DB SELECT + UPDATE per call, 2–3× per navigation** — the `tvCheckedAt`/`lastActiveUpdate` throttle is written onto the decoded token, which the RSC path never re-cookies (`lib/auth/callbacks.ts:61`, `session-validators.ts:84-137`).
4. **CSP nonce never reaches Next.js** — proxy sets `x-csp-nonce` on the request; Next reads the nonce from the request CSP header (`proxy.ts:60-80`).
5. **Indicator cache key ignores `params` and tenant** — `['indicator', symbol, tf, count, ...kinds]` (`lib/services/market.ts:172`) → `rsi(14)` and `rsi(200)` collide; global cache namespace. Latent while `useChartData` is unmounted.
6. **E2E job, coverage step, and nightly eval broken** (B2/T1 + §5 below).
7. **Circuit breaker rarely opens** — `openedAt` is the window start, not the trip time (`packages/ai/src/model-circuit-breaker.ts:178-215`).
8. **`pivotsAligned` is O(n×days)** — `dates.indexOf` inside a map (`packages/indicators/src/pivots.ts:95-102`); measured 112 ms for 5,000 bars.

### Correctness — medium

9. **LLM classification runs inside an open DB transaction** — `withAuth` wraps the whole handler with `withTenantDbFresh` (`lib/api.ts:148-151`); ~5 concurrent chats can starve a 5-connection pool.
10. **Session revocation not enforced on the API fast path** — signed-header path skips `validateSession`; revoked sessions keep calling APIs up to cookie expiry.
11. **ResizeObserver leak** in `setup-replay-modal.tsx` — cleanup returned inside an ignored promise chain.
12. **TOC "jump to turn" is a no-op** under virtualization (`chat-screen.tsx:533`).
13. **Retry amplification**: committee workflow × step × LLM retries → up to 8 billed generations per specialist worst case.
14. **DB write amplification**: health UPSERT per fetch, circuit-breaker UPSERT per model call, rate-limit INSERT…ON CONFLICT per 3 s poll per tab.
15. **`RedisCache` has no single-flight** despite the comment claiming coverage; up to 500 per-tenant Redis clients/timers.
16. **`VercelLlmClient` reads removed SDK fields** (`promptTokens`/`completionTokens`) → always-zero usage.
17. **Day-bucketing with fixed +86,400,000 ms arithmetic** (DST edge); `isMarketOpen` wrong DST logic (dead); `AlertDTO.updatedAt` always `createdAt`; `firedAt` conflating two semantics.
18. **`withDbRetry` has no jitter** (aligned 100/200/400/800 ms).

### Verified new finding

19. **`evals-nightly.yml` pins an invalid action SHA** — `actions/checkout@11d5960a...6cf38885af677262` → GitHub API returns 422 "No commit found" (other workflows use `...cf38b85af...`). The nightly eval gate cannot check out the repo.

---

## 5. Performance upgrade opportunities (ranked by impact ÷ effort)

| Rank | Change | Where | Estimated impact |
|---|---|---|---|
| 1 | Fix turbo `outputs` (`!.next/dev/**`, add `public/sw.js`) | `turbo.json` | 1.9 GB→~110 MB per cached build; cache 8.1 GB→<1 GB |
| 2 | Build-once + artifact for E2E; per-job rolling CI cache keys; raise timeouts | CI + `playwright.config.ts` | Unblocks E2E; −2×6 min builds |
| 3 | ai test imports: `deps.optimizer` or scoped `source` condition; then `isolate:false` for pure files | `packages/ai/vitest.config.ts` | −40–60% of 676 s suite time |
| 4 | Newest-N `listMessages` (DESC + reverse) | `message-persistence.ts`, `threads.ts` | Fixes long-thread answer quality |
| 5 | Drain before `closeDb` in worker shutdown | `apps/worker/src/index.ts` | Removes partial-write class on every deploy |
| 6 | Auth cost: cache + throttle persistence | auth callbacks | −2–6 DB round-trips per navigation |
| 7 | Split chat pre-work out of tenant transaction | `lib/api.ts` | Removes pool starvation at ~5 concurrent chats |
| 8 | Linearize `pivotsAligned`; early-exit OB/FVG scans; rolling Bollinger | `packages/indicators` | 112 ms → sub-ms per committee run |
| 9 | `dynamic(..., {ssr:false})` the 3D hologram | landing hero | −154 KB gzip on the public landing |
| 10 | Worker image: sourcemap off in prod, minify, trim deploy tree | `Dockerfile.worker`, build script | 554 MB → ~180 MB layer |
| 11 | Transition-only writes (provider health, circuit breaker, rate limiter) | data/ai/db | Removes a DB write per fetch/call/poll |
| 12 | Soft circuit in `runWithFailover` + Redis single-flight | `packages/data` | Turns 8 s-timeout walls into fast fallthrough |
| 13 | De-N+1 alert evaluator & briefings; move queue recovery off the 3 s poll | ai/worker | ~600→~50 queries per alert tick |
| 14 | Hoist `Intl.DateTimeFormat`; jitter retry; memoize chat chrome; `?fields=thread` | shared/web/chat | Many small wins |

**Upgrades dimension:** dependencies are current (only deliberate pins). Recommended upgrades: Turborepo remote cache, Next `typedRoutes`, deterministic `generateBuildId`, scheduled `pnpm audit`, per-directory coverage floors.

---

## 6. What is genuinely excellent

- Backend systems design: `FOR UPDATE SKIP LOCKED` queue with lease-conditional updates, cron locks with stale-reclaim + fail-closed behaviour, SWR caches with single-flight and hard ceilings, peek→persist→drain tick contract, full-jitter retry, idempotency keys.
- Indicator math: no off-by-one found in RSI/ATR/SMA/EMA/MACD alignment; UTC-correct sessions; property tests.
- Web discipline: thin routes → services → DTOs; settle-once stream lifecycle; memoized message rows with a fingerprint comparator; 39 tool parts with an exhaustive compile-time registry.
- Repo hygiene: 0 TODOs, 0 `.only`, knip-clean, license headers, digest-pinned workflows, verification scripts that actually fail.
- Process memory: prior audit trail and post-pass bug fixes are real and documented.

---

## 7. Recommended sequencing

**P0 (unblock gates):** T1 coverage reporter + action path → B2 E2E workflow build step + timeout → B1 turbo outputs → B4 NEXT_PUBLIC plumbing → §4.19 invalid SHA → §4.1 history slicing → §4.2 shutdown ordering.

**P1 (correctness & cost):** auth throttling + transaction scope, CSP nonce request header, indicator cache key, circuit breaker, failover skip, Redis single-flight, transition-only writes, worker image hygiene.

**P2 (speed & floors):** test import optimization + isolation fix, CI cache redesign + remote cache, raise web/db coverage with per-directory ratchets, Docker/security CI job, E2E re-audit + required-status.

---

## 8. Remediation status — implementation pass (2026-10-18)

This section records what was implemented after the audit, with verification evidence. The work is committed to `main` as a series of scoped fix commits (see git history).

### 8.1 Fixed — gates & CI (P0)

| Audit item | Change | Files |
|---|---|---|
| T1 coverage step fails when tests pass | New `scripts/merge-coverage-summary.mjs` derives `coverage/coverage-summary.json` from the per-workspace istanbul output; CI runs it before the report action; `file-coverage-mode: none`. | `scripts/merge-coverage-summary.mjs`, `.github/workflows/ci-fast.yml` |
| B2 E2E job cannot pass | E2E workflow now installs chromium, builds `@kestrel/web...` with its own turbo/Next cache, and starts production via `PLAYWRIGHT_WEBSERVER_COMMAND: pnpm start`; Playwright readiness timeout lifted to 180s for all environments. | `.github/workflows/e2e-and-loadtest.yml`, `apps/web/playwright.config.ts` |
| B1 turbo outputs capture `.next/dev` | `build.outputs` now excludes `!.next/dev/**` and includes `public/sw.js` + `public/sw-precache.json`. | `turbo.json` |
| B4 build-inlined `NEXT_PUBLIC_*` outside the hash | `NEXT_PUBLIC_GOOGLE_ENABLED` + `NEXT_PUBLIC_ENABLE_DEV_LOGIN` added to `build.env`, Docker build args, compose args, `.env.example`; template/docs updated. | `turbo.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `.github/workflows/e2e-and-loadtest.yml` |
| §4.19 invalid action SHA | `evals-nightly.yml` checkout pin corrected to the real commit (`...6cf38b85af...`; the previous value returned 422 from the GitHub API). | `.github/workflows/evals-nightly.yml` |
| T8 lint before build | `lint` no longer depends on `^build` (ESLint is syntax-only); CI keeps the same behaviour with less work. | `turbo.json` |
| B5 worker image ships sourcemaps | Worker esbuild: sourcemaps opt-in (`WORKER_SOURCEMAPS=1`), `NODE_ENV` define, `legalComments: none`; stale header comment corrected. | `apps/worker/scripts/build.mjs` |
| B6 Docker context bloat | `.dockerignore` now excludes `**/dist`, `**/coverage`, `**/*.tsbuildinfo`, `**/blob-report`, `.kestrel`, `**/.mastra`. | `.dockerignore` |
| B7 CI cache keys collide | Build job and test job now use distinct immutable keys (`-turbo-build-` / `-turbo-test-`); the test job no longer restores the 2.4 GB Next cache it never uses. | `.github/workflows/ci-fast.yml` |

### 8.2 Fixed — correctness bugs

| Audit item | Change | Files |
|---|---|---|
| §4.1 newest-messages slicing | `listMessages` (both the AI-persistence and legacy db twin) selects `DESC + LIMIT` and returns the newest window in chronological order. Regression-proven against real Postgres in the query-layer suite (newest-2 of 5 + ownership predicate). | `packages/ai/src/persistence/message-persistence.ts`, `packages/db/src/queries/threads.ts`, `packages/db/test/queries-postgres.test.ts` |
| §4.2 shutdown before drain | Cleanup order reworked: `stopScheduler` is registered last so it runs **first**; feeds/servers stop next; observability flushes after; `closeDb()` closes the pool last. | `apps/worker/src/index.ts` |
| §4.7 circuit breaker never opens | `CircuitState` now tracks `windowStart` and `openedAt` (trip time) separately; the DB mirror stores the trip time in `opened_at`; success writes are transition-only. Pinned by a new spread-failure regression test. | `packages/ai/src/model-circuit-breaker.ts` + test |
| §4.8 `pivotsAligned` O(n×days) | Single-pass aggregation with a per-bar day key + `Map<dateKey, idx>`; benchmarked **111.7 ms → 5.25 ms** at n=5000 (linear). | `packages/indicators/src/pivots.ts` |
| §4.5 indicator cache key | Key now includes a stable serialization of each indicator's params and the owning user; documents the cross-user provider-bleed it prevents. | `apps/web/src/lib/services/market.ts` |
| §4.11 ResizeObserver leak | Observer is owned by the effect and disconnected in its cleanup (the `.then` cleanup was dropped). | `apps/web/src/app/(app)/journal/_components/setup-replay-modal.tsx` |
| §4.12 TOC jump is a no-op | `MessageList` exposes the virtualizer's `scrollToIndex` via a ref; the TOC rail uses it with the DOM fallback. | `apps/web/src/components/chat/message-list.tsx`, `chat-screen.tsx` |
| §4.16 `VercelLlmClient` zero usage | Reads AI SDK 7 `inputTokens`/`outputTokens` with legacy fallback. | `packages/ai/src/llm-client.ts` |
| §4.17 DST bucket boundaries | New `startOfDayOffset` (calendar arithmetic) replaces `+24h` math in calendar view/hero and news view; dead `isMarketOpen` removed; `AlertDTO.firedAt` no longer merges `lastFiredAt`, and the always-wrong `updatedAt` field is gone. | `apps/web/src/lib/datetime.ts` + calendar/news components, `lib/session.ts`, `lib/services/alerts.ts` |
| §4.18 retry jitter | `withDbRetry` uses full jitter (mirrors `packages/ai/src/retry.ts`). | `packages/db/src/client.ts` |
| §4.3 auth cost | The designed 60s/15min throttles now persist in an in-process ledger for the RSC path (where the token fields are discarded); semantics unchanged. | `apps/web/src/lib/auth/session-validators.ts` |
| §4.4 CSP nonce inert | The nonce-bearing CSP is now set on the **request** headers (where Next reads it) in addition to the response. | `apps/web/src/proxy.ts` |
| §2.1/T2 stale matcher test | The test now parses `config.matcher` and the exclusion list from `proxy.ts` itself; asserts `offline` + `api/health/alerts` stay excluded. | `apps/web/test/middleware-matcher-coverage.test.ts` |
| §5 optional `use-thread-title` over-fetch | Uses `?fields=thread` (route already supported it). | `apps/web/src/hooks/use-thread-title.ts` |
| §3 LLM client usage/deps & worker edges | SignalR orphaned connection closed on subscribe failure; WS handlers isolated; tick batch capped at 5k; cron pinned to UTC; Binance throttle message corrected; queue recovery/retention throttled to 60s/1h; provider-health writes transition-only; Redis cache single-flight + shared connection per URL; failover hard-down demotion; alert evaluator resolves the tenant once per user per tick; briefings batch idempotency prefetch. | `apps/worker/src/*`, `packages/data/src/*`, `packages/ai/src/*` |

### 8.3 Verification evidence

- `pnpm turbo run lint` — 9/9 tasks pass (0 errors).
- `pnpm turbo run typecheck` — 15/15 tasks pass.
- `pnpm build:packages` — 7/7; `pnpm --filter @kestrel/web build` — production build green (SW generated; three.js no longer in the landing route manifest).
- Test sweep: test-utils 10 · indicators 102 · db 48 (+16 gated) · shared 450 · data 174 · ai 1467 (+22 skipped) · worker 147 · web 1134 — all green after the contract updates in §8.4.
- Postgres-gated suites (live local DB): RLS isolation + query layer 16/16 including the new newest-N regression test.
- `pnpm knip` exit 0 (9 pre-existing hints) · `check:route-security` 112 routes · `check:env-contract` · `check-compose-reproducibility` · `check-compose-images` · `test:empty-guard` all pass.
- `pivotsAligned` benchmark: 1.05 ms / 3.42 ms / 5.25 ms for 1k/3k/5k candles (linear).

### 8.4 Deliberately not done (with rationale)

| Item | Why |
|---|---|
| Chat pre-work out of the tenant transaction (bug #9) | Requires restructuring `/api/chat` into auth → AI → write phases; wide blast radius on a security-scoped path — needs its own PR with E2E coverage. |
| Worker image `node_modules` trim (~406 MB) | Safe only with an image-level smoke test; the maps/minify hygiene landed instead. |
| `text-end` before title generation (web #4.1) | The await is the deliberate P2-06 cost-correctness fix; reversing it reintroduces under-settlement. Better solved by emitting `text-end` independently of settlement. |
| Chat chrome memoization (web #3.1) | Diminishing returns vs risk while message rows are already memoized+fingerprinted. |
| Test-suite import overhead (ai 83%) / `isolate:false` | Blocked by cross-file mock coupling (22 failures without isolation) — must fix the coupling first. |
| E2E stale assertions (~28) + multi-browser CI | Documented workstream from the prior audit; needs its own re-audit pass with a running stack. |
| Coverage floors for web/db, security-surface tests (T3/T5) | No test bloat added by instruction; floors unchanged; the one added regression test guards a real bug. |
| Turbo remote cache + Docker build CI job | Require repo-level secrets/settings decisions. |
| `braces`/`sprintf-js` advisories | Upstream transitives, no patched release. |
