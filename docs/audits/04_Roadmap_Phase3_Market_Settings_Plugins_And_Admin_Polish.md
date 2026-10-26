# Phase 3 Implementation Plan: Market Intelligence, Settings & BYOK Access, Plugins & Admin Control Plane

> **Status:** ✅ Implemented and verified — branch `phase3/market-settings-plugins-admin` (10 commits). Evidence: web suite 140 test files / 1221 tests green, workspace `pnpm turbo run test` 15/15 packages green, `pnpm turbo run lint typecheck` 42/42, `pnpm check:maintainability` PASS (2096 files, 0 baselined), `pnpm knip` clean (exit 0), `pnpm turbo run build` 15/15, `bundle-size:check` PASS (441/441 chunks), plus a real-browser sweep against the production build (market sub-nav on all three Market routes, usage guardrail form, paper-trading two-column desk with sticky order ticket, backtesting tabs, non-admin `/admin` redirect). New regression tests: `test/market-subnav.test.tsx`, `test/settings-nav.test.ts`, `test/phase3-settings-contracts.test.ts`, `test/plugin-modal-escape.test.tsx`, `test/admin-tab-groups.test.tsx`.
>
> **Verification follow-ups fixed along the way:** Tailwind now scans `plugins/*/src` + `packages/*/src` via `@source` (plugin-only utilities were never generated, so the new paper-trading desk collapsed into a single column), every package/plugin `build` cleans `dist` first (`tsc` leaves orphaned outputs that shadow renamed directories and shipped the old plugin pages), and the duplicate `SYMBOL_RESEARCH_*` exports that kept `pnpm knip` red are gone.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect `/news`, `/calendar`, and `/chart/[symbol]` under a unified Market Intelligence sub-navigation bar, restore user access and sidebar navigation for BYOK AI settings (`/settings/api-keys`, `/settings/models`, `/settings/agent`), mount `<UsageLimitsForm />` on `/settings/usage`, upgrade `/plugins/paper-trading` to a 2-column execution desk, and group the 16 overflowing `/admin` tabs into 4 clean domain categories.

**Architecture:** Introduce `<MarketSubNav />` across Market routes, restore the `AI & Models` group in `BASE_NAV_GROUPS`, separate user-scoped BYOK settings from operator-scoped `/admin` controls, and restructure `/admin` and `/plugins/paper-trading` layouts.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Vitest.

**Spec:** `01_Kestrel_Frontend_Deep_Audit_And_Page_Ratings.md` (§3.8 – §3.11)

## Global Constraints

- **Hoplite Filter Chips:** Active filter pills on `/news` and `/calendar` must use `border-brand/40 bg-brand/15 text-brand font-bold` (never stark white `bg-fg text-black`).
- **Next.js Client Navigation:** Always use `<Link>` from `next-view-transitions` or `next/link` for internal app routes (`/plugins/*`, `/settings/*`), never raw `<a href="/...">` tags that force full-page reloads.
- **Component Limits:** `<= 250 LOC`, `<= 4 useState`, `<= 2 useEffect` per `.tsx` file.

## Review Focus

1. Switching between `/news`, `/calendar`, and `/chart/XAUUSD`: every Market route must render `<MarketSubNav />` so users clicking `"Market"` in the sidebar can reach Headlines, Economic Calendar, and Live Charts in 1 click.
2. Non-admin BYOK users visiting `/settings/api-keys`, `/settings/models`, and `/settings/agent`: must NOT be redirected away to `/settings`, and `SettingsNav` must highlight the active item.
3. `/settings/usage` budget form: `<UsageLimitsForm />` must be mounted and pre-populated with the user's `monthlyBudgetUsd` and per-provider thresholds.
4. `CustomAgents` `AgentEditor` and `AgentRunsDialog`: pressing `Escape` when not busy must close the modal.
5. `/admin` keyboard navigation: `ArrowLeft` / `ArrowRight` / `Home` / `End` across tabs in `AdminPage` must continue to pass `test/admin-page.test.tsx`.

---

### Task 1: Unify Market Intelligence Routes (`/news`, `/calendar`, `/chart/[symbol]`) & Fix `/alerts`

**Files:**
- Create: `apps/web/src/components/layout/market-subnav.tsx`
- Modify: `apps/web/src/app/(app)/news/page.tsx`
- Modify: `apps/web/src/app/(app)/news/_components/sentiment-summary.tsx`
- Modify: `apps/web/src/app/(app)/news/_components/news-toolbar.tsx`
- Modify: `apps/web/src/components/news/article-card.tsx`
- Modify: `apps/web/src/app/(app)/calendar/page.tsx`
- Modify: `apps/web/src/app/(app)/calendar/_components/calendar-toolbar.tsx`
- Modify: `apps/web/src/app/(app)/calendar/_components/calendar-view.tsx:171-177`
- Modify: `apps/web/src/app/(app)/chart/[symbol]/_components/pro-chart-view.tsx`
- Modify: `apps/web/src/app/(app)/alerts/_components/alert-list/alert-row.tsx:79-93`
- Test: `apps/web/test/news-ui.test.tsx`

- [x] **Step 1: Create `apps/web/src/components/layout/market-subnav.tsx` and mount it on `/news`, `/calendar`, and `/chart/[symbol]`**
  - Build `<MarketSubNav />` with 3 route links (`News Wire` `/news`, `Economic Calendar` `/calendar`, `Live Chart` `/chart/XAUUSD`) styled with `.surface-well rounded-xl border border-white/5 p-1` and active `.surface-chip bg-bg-elev-2 text-brand font-semibold` (matching `AISubNav`).
  - Render `<MarketSubNav />` inside `<PageHeader>`'s right slot (or directly below `<PageHeader>`) on `news/page.tsx`, `calendar/page.tsx`, and `pro-chart-view.tsx`.
  - Also update `nav-items.ts` line 71 so `Market` has `match: ['/news', '/calendar', '/chart']`.

- [x] **Step 2: Upgrade `/news` and `/calendar` cards/chips to Hoplite tokens & fix `SentimentGauge`**
  - In `news/_components/sentiment-summary.tsx` and `components/news/article-card.tsx`: upgrade `rounded-sm border-border bg-bg-elev-1` to `surface-chip rounded-xl border-border/80 bg-bg-elev-1 shadow-[var(--shadow-chip)]`.
  - In `news/_components/sentiment-summary.tsx` (`SentimentGauge` lines 158–162): add a `4°` gap between non-zero segments or use `strokeLinecap="butt"` on interior joins so the 8px-wide arcs do not overlap each other.
  - In `news/_components/news-toolbar.tsx` (lines 111 & 179) and `calendar/_components/calendar-toolbar.tsx` (lines 90 & 124): replace `bg-fg border-transparent font-bold text-black` with `border-brand/40 bg-brand/15 text-brand font-bold shadow-xs`.
  - In `calendar/_components/calendar-view.tsx` line 173: change sticky `top` to `top-0 lg:top-0` (or `top-[calc(3rem+env(safe-area-inset-top))] lg:top-0` now that `TopBar` is `lg:hidden`).

- [x] **Step 3: Deduplicate Telegram channel icon in `AlertRow` (`alert-row.tsx` lines 79–93)**
  - Replace the separate `alert.channels.includes('telegram')` (`IconArrowRight`) and `alert.channels.includes('telegram-bot')` (`IconBrandTelegram`) checks with a single `(alert.channels.includes('telegram') || alert.channels.includes('telegram-bot'))` check rendering `<IconBrandTelegram className="text-brand size-3.5" title="Telegram delivery" />`.

- [x] **Step 4: Run news and UI tests**

Run: `pnpm --filter @kestrel/web test test/news-ui.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/market-subnav.tsx apps/web/src/components/layout/nav-items.ts apps/web/src/app/\(app\)/news/ apps/web/src/components/news/ apps/web/src/app/\(app\)/calendar/ apps/web/src/app/\(app\)/chart/ apps/web/src/app/\(app\)/alerts/
git commit -m "feat(market,alerts): add shared MarketSubNav across news/calendar/chart and unify Hoplite chip styling"
```

---

### Task 2: Fix Settings Navigation, Restore User BYOK Access & Mount `<UsageLimitsForm />`

**Files:**
- Modify: `apps/web/src/app/(app)/settings/_components/settings-nav/nav-groups.ts`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`
- Modify: `apps/web/src/app/(app)/settings/api-keys/page.tsx:52-56,149-156`
- Modify: `apps/web/src/app/(app)/settings/models/page.tsx:61-70`
- Modify: `apps/web/src/app/(app)/settings/agent/page.tsx`
- Modify: `apps/web/src/app/(app)/settings/usage/page.tsx`
- Modify: `apps/web/src/app/(app)/settings/_components/appearance/appearance-card.tsx`
- Modify: `apps/web/src/app/(app)/settings/notifications/page.tsx`
- Test: `apps/web/test/settings-actions.test.ts`

- [x] **Step 1: Add `AI & Models` group to `BASE_NAV_GROUPS` (`settings-nav/nav-groups.ts`) and `/settings/page.tsx`**
  - In `apps/web/src/app/(app)/settings/_components/settings-nav/nav-groups.ts`, add the `ai` group (`label: 'AI & Intelligence'`, `shortLabel: 'AI'`) containing:
    - `/settings/api-keys` (`API Keys & Vault`, `IconKey`)
    - `/settings/models` (`Models & Routing`, `IconCpu`)
    - `/settings/agent` (`Agent Preferences`, `IconRobot`)
  - In `apps/web/src/app/(app)/settings/page.tsx`: move the `API Keys & Vault`, `Model Routing & Fallbacks`, and `Agent Preferences` quick links into the main `Settings Categories` grid for all users, keeping only `Admin Console` (`/admin`) and `OnboardingResetCard` inside the `isAdmin` section. Also update `metadata.description` to remove `"subscription"`.

- [x] **Step 2: Remove the `if (!isAdmin) redirect('/settings')` lockout on `/settings/api-keys`, `/settings/models`, and `/settings/agent`**
  - In `settings/api-keys/page.tsx`: remove `if (!isAdmin) redirect('/settings')` and update the subtitle to: `"Connect your personal AI provider keys and market data adapters (encrypted at rest with AES-256-GCM)."`
  - In `settings/models/page.tsx`: remove `if (!isAdmin) redirect('/settings')`.
  - In `settings/agent/page.tsx`: remove `if (!isAdmin) redirect('/settings')`, and only render the raw 24h `chat_tool_telemetry` list when `isAdmin` is true (or link admins to `/admin?tab=telemetry`), placing `AnalysisModeForm`, `AIPrefsCard`, `AgentModelOverrideForm`, and `DisabledToolsForm` at the top of the page.

- [x] **Step 3: Mount `<UsageLimitsForm />` on `/settings/usage`, remove the fake Locale dropdown in `AppearanceCard`, and link Telegram in `/settings/notifications`**
  - In `apps/web/src/app/(app)/settings/usage/page.tsx`: fetch the user's `settings` via `getUserWithSettings(session.user.id)`, build the `providers` spend array from `stats.byProvider`, and render `<UsageLimitsForm initialMonthlyLimit={settings?.monthlyBudgetUsd ?? null} ... />` below `<ActivitySummaryCard />`. Also replace the `bg-fg text-black rounded-sm` empty-state link with Hoplite `bg-brand text-white rounded-md`.
  - In `apps/web/src/app/(app)/settings/_components/appearance/appearance-card.tsx`: replace the non-functional 8-language `<select>` with a static `English (US · UTC/Local)` badge (or note that regional date/time formatting follows the browser locale + `PreferencesCard` 12h/24h setting).
  - In `apps/web/src/app/(app)/settings/notifications/page.tsx`: replace `<TestTelegramButton />` and `env.TELEGRAM_CHAT_ID` with a `<Link href="/plugins/telegram-bot">` button (`"Configure in Telegram Copilot →"`).

- [x] **Step 4: Run settings tests**

Run: `pnpm --filter @kestrel/web test test/settings-actions.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/settings/
git commit -m "feat(settings): unlock BYOK AI settings for all users, mount UsageLimitsForm, and remove fake locale selector"
```

---

### Task 3: Upgrade Plugin UIs (`paper-trading`, `backtesting`, `custom-agents`, `telegram-bot`)

**Files:**
- Modify: `plugins/paper-trading/src/ui/paper-page/index.tsx`
- Modify: `plugins/backtesting/src/ui/run-detail-page/index.tsx`
- Modify: `plugins/backtesting/src/ui/backtest-page/tab-bar.tsx`
- Modify: `plugins/custom-agents/src/ui/agent-editor.tsx`
- Modify: `plugins/custom-agents/src/ui/agent-runs-dialog.tsx`
- Modify: `plugins/telegram-bot/src/ui/telegram-page/status-panel.tsx`
- Modify: `plugins/telegram-bot/src/ui/telegram-page/bot-actions.tsx`

- [x] **Step 1: Restructure `PaperTradingPage` (`plugins/paper-trading/src/ui/paper-page/index.tsx`) into a 2-Column Execution Desk**
  - Keep `<AccountSummary summary={summary} />` at the top.
  - Below `AccountSummary`, render a `grid grid-cols-1 gap-4 lg:grid-cols-12 items-start`:
    - **Left Column (`lg:col-span-8 flex flex-col gap-4`):**
      - A clean tab bar (`Positions & Orders`, `Deployed Strategies`, `Accounts & History`) so the user can switch views without scrolling past 7 stacked tables.
    - **Right Sticky Column (`lg:col-span-4 lg:sticky lg:top-4`):**
      - `<PlaceOrderForm accounts={summary?.accounts ?? []} onPlaced={() => void load()} />` always accessible alongside open positions.

- [x] **Step 2: Fix `Escape` handling & button tokens in `CustomAgents`, and `<Link>` navigation in `Backtesting` & `TelegramBot`**
  - In `plugins/custom-agents/src/ui/agent-editor.tsx` and `agent-runs-dialog.tsx`:
    - Add a `useEffect` listening for `keydown` (`e.key === 'Escape'`) to invoke `onClose()` when `!busy`.
    - Replace `bg-fg text-black h-8` on the primary `Next` and `Save changes` / `Create agent` buttons with `bg-brand text-white hover:brightness-110 h-9 px-3.5`.
  - In `plugins/backtesting/src/ui/run-detail-page/index.tsx`, `plugins/telegram-bot/src/ui/telegram-page/status-panel.tsx`, and `bot-actions.tsx`: replace internal `<a href="/...">` links with `next/link` `<Link href="/...">`.

- [x] **Step 3: Run plugin tests**

Run: `pnpm --filter @kestrel/plugin-paper-trading test && pnpm --filter @kestrel/plugin-backtesting test && pnpm --filter @kestrel/plugin-custom-agents test && pnpm --filter @kestrel/plugin-telegram-bot test`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add plugins/
git commit -m "feat(plugins): restructure Paper Trading into 2-column desk and polish Backtesting, Custom Agents, and Telegram UIs"
```

---

### Task 4: Reorganize Admin Control Plane (`/admin`) into 4 Domain Groups

**Files:**
- Modify: `apps/web/src/app/(app)/admin/layout.tsx`
- Modify: `apps/web/src/app/(app)/admin/_components/admin-tabs.tsx`
- Modify: `apps/web/src/app/(app)/admin/_components/admin-tab-layout.tsx`
- Test: `apps/web/test/admin-page.test.tsx`

- [x] **Step 1: Add `group` metadata to `TABS` in `apps/web/src/app/(app)/admin/_components/admin-tabs.tsx`**
  - Assign each of the 16 tabs in `TABS` to one of 4 domain groups while preserving the flat `TABS` array order and `role="tablist"` keyboard navigation contract:
    1. `'Platform & Access'`: `platform`, `users`, `features`, `onboarding`
    2. `'System Operations'`: `health`, `cron`, `logs`, `audit`
    3. `'Observability'`: `telemetry`, `traces`, `mastra-runs`
    4. `'AI Quality & Eval'`: `ai-eval`, `datasets`, `regressions`, `feedback`, `devtools`

- [x] **Step 2: Render a Responsive Grouped Left Rail / 2-Tier Navigation in `admin-tab-layout.tsx` and use `<PageHeader />` in `admin/layout.tsx`**
  - In `admin/layout.tsx`: use `<PageHeader title="Admin Control Plane" description="Global AI providers, model routing, live market feeds, system health, and operator audit logs." />`.
  - In `admin-tab-layout.tsx`:
    - Render the 4 domain groups cleanly (on `lg:` as a 220px sticky left navigation rail or a 4-group segmented header grid; on `<lg` as a wrapping chip bar with group headers) so **all 16 tabs are immediately visible and discoverable without hidden horizontal overflow**, while keeping `role="tablist"`, `role="tab"`, `id={`${tab.id}-tab`}`, `aria-selected`, and `onKeyDown` intact for accessibility and `admin-page.test.tsx`.

- [x] **Step 3: Run admin tests**

Run: `pnpm --filter @kestrel/web test test/admin-page.test.tsx test/admin-system-health.test.tsx test/admin-ai-eval.test.tsx`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/admin/
git commit -m "feat(admin): organize 16 Admin Control Plane tabs into 4 visible domain groups"
```
