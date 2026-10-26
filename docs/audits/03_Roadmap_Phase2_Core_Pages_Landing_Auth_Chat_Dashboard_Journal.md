# Phase 2 Implementation Plan: Landing, Auth, Onboarding, Chat Cockpit, Dashboard & Journal

> **Status:** ✅ Implemented and verified — branch `phase2/core-pages-polish` (5 commits). Evidence: 135 web test files / 1202 tests green, `pnpm turbo run lint typecheck` 42/42, `check:maintainability` PASS, production build + bundle-size guard PASS, and a 30-point acceptance sweep over the Review Focus list. New regression tests: `test/chat-sidecar-autoclose.test.tsx`, `test/dashboard-phase2-contracts.test.tsx`, `test/journal-ai-review.test.tsx`, `test/password-field.test.tsx`.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish and fix the core user-facing pages (`/`, `/landing`, `/share/[id]`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/onboarding`, `/chat`, `/dashboard`, and `/journal`), eliminating duplicate UI blocks, fixing the unclosable `/chat` sidecar bug, aligning landing copy with BYOK + Plugin Store (`DEC-01`), and enforcing Hoplite design consistency.

**Architecture:** Fix state/effect bugs in `ChatScreen` and `TodayGlanceWidget`, consolidate redundant headers and launchers on `/dashboard` and `/journal`, simplify `Composer` and `ThreadViewsDock` on `/chat`, and standardize typography/surfaces across public and auth routes.

**Tech Stack:** Next.js 16, React 19, Motion (`motion/react`), Tailwind CSS v4, Vitest.

**Spec:** `01_Kestrel_Frontend_Deep_Audit_And_Page_Ratings.md` (§3.1 – §3.7)

## Global Constraints

- **Product Positioning (`DEC-01`):** Kestrel is a self-hosted / BYOK AI market research & trading copilot with an encrypted AES-256-GCM key vault, local spend guardrails, and a 1-click Plugin Store. Never describe Kestrel as a "paid hosted subscription where no API keys are needed".
- **Hoplite Typography:** Major page and section headings use `font-display font-normal tracking-[-0.03em]`; organic contrast words use `font-redaction-35 italic text-brand`; numeric/telemetry values use `font-mono tabular-nums`.
- **Component Limits:** `<= 250 LOC`, `<= 4 useState`, `<= 2 useEffect` per `.tsx` file.

## Review Focus

1. Closing `ThreadViewsDock` on `>=1280px` viewports: clicking the Close (`X`) button or `"Chart & Desks"` toolbar toggle must keep `splitMode === false` even when `messages.length > 0` or `analysisMode === 'full'`.
2. `MissionControlDeck` / Overview `"Convene Full Council"` link: must navigate to `/chat?mode=full` (valid `AnalysisMode`), never `/chat?mode=council`.
3. `TodayGlanceWidget` open risk calculation: must sum actual risk or display open position count + symbol list rather than multiplying `open.length * 1R`.
4. `EquityCurveWidget` + `PerformanceChart`: when `PerformanceChart` is rendered inside `EquityCurveWidget` (`bare` mode), it must not render a second outer `.surface-panel` or a second header/R-badge.
5. `PnLHeatmapWidget` legend order: must progress logically from `Loss` (bearish red) through neutral to `Gain` (bullish green).

---

### Task 1: Polish Public Landing Page (`/`, `/landing`) & Public Share Snapshot (`/share/[id]`)

**Files:**
- Modify: `apps/web/src/app/landing/page.tsx`
- Modify: `apps/web/src/components/landing/landing-hero/hero-copy.tsx:76-103`
- Modify: `apps/web/src/components/landing/landing-hero/hero-telemetry-rig.tsx:109-155`
- Modify: `apps/web/src/components/landing/landing-architecture/index.tsx:70-115`
- Modify: `apps/web/src/components/landing/landing-faq.tsx:48-54,85-90`
- Modify: `apps/web/src/components/landing/landing-footer.tsx:99-109`
- Modify: `apps/web/src/app/share/[id]/page.tsx`

- [x] **Step 1: Wrap `/landing` in `<MotionRoot>` (`apps/web/src/app/landing/page.tsx`)**
  - Import `MotionRoot` from `@/components/ui/motion-config` and wrap `<LandingPageView isAuthenticated={!!session?.user} />` so `/landing` has full parity with `/`.

- [x] **Step 2: Align Landing copy with `DEC-01` (BYOK Vault + 1-Click Plugin Store)**
  - In `hero-copy.tsx` lines 96–100: change `"Zero Setup / All AI & Feeds Included"` to `"BYOK Vault / Encrypted Key & Spend Control"`.
  - In `landing-faq.tsx` FAQ `04` (lines 49–53) and subtitle (line 88): update Q&A to explain Kestrel's **BYOK (Bring Your Own Key) AES-256-GCM Vault + Local Spend Guardrails** and **1-Click Plugin Store** (Backtesting Lab, Paper Trading, Custom Agent Studio, Telegram Copilot).
  - In `landing-footer.tsx` line 105: change `"Hosted Cloud AI"` to `"AES-256 BYOK Vault"`.

- [x] **Step 3: Rebalance `HeroTelemetryRig` and fix mobile order in `LandingArchitecture`**
  - In `hero-telemetry-rig.tsx`: compact the 4 specialist desk cards (`py-1.5 px-2`, horizontal icon+label row on mobile/desktop) and reduce hologram height from `sm:h-[220px]` to `sm:h-[180px]` so the right rig aligns optically with `HeroCopy`.
  - In `landing-architecture/index.tsx`: add responsive ordering (`order-1 lg:order-1` on tabs, `order-3 lg:order-2` on the 3D isometric stack, `order-2 lg:order-3` on `ArchitectureTelemetryConsole`) so mobile users immediately see the active layer console below the tabs when tapping a layer.

- [x] **Step 4: Upgrade `/share/[id]` (`apps/web/src/app/share/[id]/page.tsx`) to Hoplite Design System**
  - Replace `bg-bg-elev-1` root wrapper with `bg-bg text-fg`.
  - Replace raw `<Image src="/brand/kestrel-logo.png" ... />` header with `<KestrelBrand variant="lockup" href="/" />` + a right-aligned `"Open Kestrel →"` `<Link href="/chat">` button.
  - Wrap the shared report in `.surface-panel rounded-2xl border border-white/10 p-6`.
  - Fix the price lines SVG to use numerical coordinates `y1={y}` / `y2={y}` (where `y = 6 + ((max - price) / range) * 36` inside `viewBox="0 0 400 48"`) with `vectorEffect="non-scaling-stroke"`.

- [x] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @kestrel/web typecheck`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/landing/page.tsx apps/web/src/components/landing/ apps/web/src/app/share/[id]/page.tsx
git commit -m "feat(landing,share): align landing copy with BYOK architecture, fix mobile 3D stack order, and polish share page"
```

---

### Task 2: Polish Auth Suite (`/login`, `/register`, `/forgot-password`, `/reset-password`) & Onboarding (`/onboarding`)

**Files:**
- Modify: `apps/web/src/app/(auth)/login/login-form.tsx`
- Modify: `apps/web/src/app/(auth)/register/page.tsx`
- Modify: `apps/web/src/app/(auth)/forgot-password/page.tsx`
- Modify: `apps/web/src/app/(auth)/reset-password/reset-password-form.tsx`
- Modify: `apps/web/src/app/onboarding/page.tsx`
- Modify: `apps/web/src/components/onboarding/_components/wizard-stepper.tsx`
- Modify: `apps/web/src/components/onboarding/_components/wizard-step-review.tsx`
- Test: `apps/web/test/auth-flow.test.ts`

- [x] **Step 1: Add explicit card headings and unified `PasswordField` across Auth routes**
  - Add a clear top header inside each auth card (`font-display text-lg text-fg`):
    - `login-form.tsx`: `"Sign in to your account"`
    - `register/page.tsx`: `"Create your operator account"`
    - `forgot-password/page.tsx`: `"Reset your password"`
    - `reset-password-form.tsx`: `"Choose a new password"`
  - In `register/page.tsx` (lines 89–106) and `reset-password-form.tsx` (lines 84–98), replace the raw `<Input type="password" id="confirm-password" ... />` with `<PasswordField id="confirm-password" name="confirmPassword" label="Confirm Password" ... />` so both password inputs have the Show/Hide eye toggle.

- [x] **Step 2: Polish Onboarding typography, stepper colors, and post-setup BYOK hint**
  - In `apps/web/src/app/onboarding/page.tsx` line 64: change `text-2xl font-bold tracking-tight sm:text-3xl` to `font-display text-2xl font-normal tracking-[-0.03em] sm:text-3xl`.
  - In `apps/web/src/components/onboarding/_components/wizard-stepper.tsx` lines 52–54 & 73: change completed step styling from `bg-fg text-black` to `bg-bull/15 text-bull border border-bull/30`, and completed connector line from `bg-fg` to `bg-bull/50`.
  - In `apps/web/src/components/onboarding/_components/wizard-step-review.tsx`: add a concise callout note reminding the user that they can connect or manage BYOK AI provider keys anytime in **Settings → AI & Models**.

- [x] **Step 3: Run auth tests**

Run: `pnpm --filter @kestrel/web test test/auth-flow.test.ts`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add apps/web/src/app/\(auth\)/ apps/web/src/app/onboarding/ apps/web/src/components/onboarding/
git commit -m "style(auth,onboarding): add explicit auth headings, unify password fields, and apply Hoplite stepper tokens"
```

---

### Task 3: Fix & Declutter Research / Chat Cockpit (`/chat`, `ChatScreen`, `Composer`, `ThreadViewsDock`)

**Files:**
- Modify: `apps/web/src/components/chat/chat-screen.tsx:24,81-94`
- Modify: `apps/web/src/components/chat/chat-composer-dock.tsx:21,63`
- Modify: `apps/web/src/components/chat/chat-empty-state.tsx:30-39`
- Modify: `apps/web/src/components/chat/composer.tsx:115-150`
- Modify: `apps/web/src/components/chat/thread-views-dock/index.tsx`
- Modify: `apps/web/src/components/chat/thread-views-dock/dock-chart-panel.tsx`
- Delete: `apps/web/src/components/chat/thread-views-dock/dock-context-panel.tsx`
- Test: `apps/web/test/composer.test.tsx`, `apps/web/test/chat-shared.test.tsx`

- [x] **Step 1: Fix the unclosable `ThreadViewsDock` bug in `apps/web/src/components/chat/chat-screen.tsx`**
  - Replace the unconditional `useEffect` at lines 81–93 with a `useRef` guard so auto-open only fires **once** per thread when context first appears, never re-opening after the user manually closes the dock:
```tsx
  const autoOpenedThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 1280) return;
    if (autoOpenedThreadRef.current === threadId) return;
    const hasActiveContext =
      session.messages.length > 0 ||
      session.agentProgress !== null ||
      toolbar.analysisMode === 'full';
    if (hasActiveContext) {
      autoOpenedThreadRef.current = threadId;
      setSplitMode(true);
    }
  }, [threadId, session.messages.length, session.agentProgress, toolbar.analysisMode, setSplitMode]);
```

- [x] **Step 2: Remove duplicate `<ChatErrorBanner />` and duplicate `Composer` mode strip**
  - In `apps/web/src/components/chat/chat-composer-dock.tsx`: remove `<ChatErrorBanner error={error} />` (since `ChatThreadView` already renders the dismissible error banner with Retry right above the dock).
  - In `apps/web/src/components/chat/composer.tsx`: delete lines 115–149 (`{/* Scope Boundary Strip */}` with `SCOPE: FULL COUNCIL` and `GATE: HUMAN-APPROVAL ENFORCED` / `LEDGER: FULL TRACE`), keeping the single mode toggle in `ComposerControls`.

- [x] **Step 3: Consolidate `ThreadViewsDock` from 4 overflowing tabs to 3 clean tabs + Mobile Drawer support**
  - In `apps/web/src/components/chat/thread-views-dock/dock-chart-panel.tsx`: add a right-aligned `<Link href={`/chart/${symbol}?tf=${activeTf}`}>` icon/link (`Open Pro Chart ↗`) in the chart subheader.
  - Delete `apps/web/src/components/chat/thread-views-dock/dock-context-panel.tsx` and remove `'terminal'` from `DockTab` in `thread-views-dock/index.tsx`.
  - Shorten the 3 tab labels in `thread-views-dock/index.tsx` to `Chart`, `Council`, and `Plan` so they fit comfortably inside `420px` without horizontal overflow.
  - In `chat-top-bar/index.tsx`: remove `hidden ... lg:inline-flex` on the `"Chart & Desks"` toggle button (use `inline-flex`) and allow `ThreadViewsDock` to render as a slide-over overlay on `<1024px` (`fixed inset-y-0 right-0 z-40 flex w-full max-w-md lg:static lg:z-auto`) when `isOpen` is true!

- [x] **Step 4: Run chat and composer tests**

Run: `pnpm --filter @kestrel/web test test/composer.test.tsx test/chat-shared.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add -A apps/web/src/components/chat/ apps/web/test/
git commit -m "fix(chat): allow closing ThreadViewsDock on xl screens, deduplicate composer controls and error banners, and enable mobile dock"
```

---

### Task 4: Consolidate & Polish Overview / Dashboard (`/dashboard`)

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/_components/mission-control-deck.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas/index.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/_components/widgets/today-glance-widget.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/_components/widgets/equity-curve-widget.tsx`
- Modify: `apps/web/src/components/chart/performance-chart.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget/index.tsx`

- [x] **Step 1: Unify Dashboard Header & Deduplicate `MissionControlDeck` vs `TodayGlanceWidget`**
  - In `mission-control-deck.tsx`:
    - Fix the CTA link from `/chat?mode=council` to `/chat?mode=full`.
    - Remove the 4-column "Tactical Telemetry Strip" (lines 113–179) from `MissionControlDeck`, because `TodayGlanceWidget` (`w1` in `DEFAULT_LAYOUT`) already renders the 4 live status cells (`Next Event`, `Session`, `Open Risk`, `AI Insight`) immediately below!
    - Replace `font-serif italic` with `font-redaction-35 italic`.
  - In `dashboard-canvas/index.tsx`:
    - Move the `PreSessionChecklistDrawer`, `QuickLogTradeDrawer`, and `Customize Layout` controls into a single top `<PageHeader title="Overview" description="Live 4-desk command deck, session catalysts, and portfolio telemetry." />` above `MissionControlDeck`, and remove the mid-page `<h1>Dashboard Canvas</h1>` heading!

- [x] **Step 2: Fix `TodayGlanceWidget` Open Risk calculation (`today-glance-widget.tsx` lines 141–165)**
  - Instead of `const totalRRounded = Math.round(open.length * 10) / 10;` (which fakes `1R` per position), count positions with a defined stop vs without a stop: display `{open.length} {open.length === 1 ? 'position' : 'positions'}` and list the unique active symbols (`Array.from(new Set(open.map((e) => e.symbol))).slice(0, 3).join(', ')`).

- [x] **Step 3: Fix `PerformanceChart` double-header inside `EquityCurveWidget` and fix `PnLHeatmapWidget` legend**
  - In `apps/web/src/components/chart/performance-chart.tsx`:
    - Add `bare?: boolean` to `PerformanceChartProps`.
    - When `bare` is true, omit the outer `surface-panel p-4` wrapper and the inner header (`Performance Curve` / `Net R-Score`), rendering only the chart container (or a clean empty state saying `"Not enough closed trades yet"` instead of `"Performance Curve Loading"` with `animate-pulse`).
  - In `apps/web/src/app/(app)/dashboard/_components/widgets/equity-curve-widget.tsx` line 93: pass `bare` to `<PerformanceChart entries={[...filteredEntries]} height={200} bare />`.
  - In `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget/index.tsx` lines 90–121: fix `<Legend />` to render `Loss` → `[0.85, 0.6, 0.4, 0.2]` (`--color-bear`) → neutral square (`bg-bg-elev-2`) → `[0.2, 0.4, 0.6, 0.85]` (`--color-bull`) → `Gain`.

- [x] **Step 4: Run dashboard tests**

Run: `pnpm --filter @kestrel/web test test/phase4-6-ui.test.tsx test/polish-flash-gauge.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard/ apps/web/src/components/chart/performance-chart.tsx
git commit -m "feat(dashboard): deduplicate Overview header and telemetry strips, fix Open Risk and heatmap legend, and bare-mount PerformanceChart"
```

---

### Task 5: Polish & Deduplicate Trade Journal (`/journal`)

**Files:**
- Modify: `apps/web/src/app/(app)/journal/page.tsx`
- Modify: `apps/web/src/app/(app)/journal/_components/journal-view/index.tsx`
- Delete: `apps/web/src/app/(app)/journal/_components/journal-view/journal-header.tsx`
- Modify: `apps/web/src/app/(app)/journal/_components/journal-view/journal-analytics-tab.tsx`
- Modify: `apps/web/src/app/(app)/journal/_components/ai-review-panel.tsx`

- [x] **Step 1: Merge `<JournalHeader />` into `<PageHeader />` and delete `journal-header.tsx`**
  - In `journal/page.tsx`, remove the outer `<PageHeader />` so `JournalView` renders a single `<PageHeader title="Trade Journal" description="Log, tag, and audit your executions, R-multiples, and behavioral edge.">` with the `StaleIndicator`, `Import` (`Button variant="secondary" size="sm"`), `Refresh` (`Button variant="ghost" size="sm"`), and `Log Trade` (`Button variant="primary" size="sm"`) actions in the right slot.
  - Delete `apps/web/src/app/(app)/journal/_components/journal-view/journal-header.tsx`.

- [x] **Step 2: Deduplicate `Overview` vs `Trades` tabs and add a trade selector to `AiReviewPanel`**
  - In `journal-view/index.tsx`:
    - In `tab === 'overview'`, show `PerformanceChart` + a compact `"Recent Executions (Last 5)"` preview list with a `"View & Filter All Trades →"` button that switches to `tab === 'trades'`, rather than mounting the entire filterable `EntryList` on both `Overview` and `Trades`.
  - In `journal-analytics-tab.tsx` and `ai-review-panel.tsx`:
    - Pass all closed trades (`closedEntries`) into `AiReviewPanel` (or a selector header) so the user can pick **any** closed trade from a `<select>` dropdown to generate an AI post-trade review, and upgrade `AiReviewPanel` from `rounded-sm` to `surface-panel rounded-xl border-white/10 p-5`.

- [x] **Step 3: Run journal tests**

Run: `pnpm --filter @kestrel/web test test/route-journal.test.ts`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add -A apps/web/src/app/\(app\)/journal/
git commit -m "feat(journal): eliminate double header, deduplicate Overview vs Trades tabs, and add closed-trade picker to AiReviewPanel"
```
