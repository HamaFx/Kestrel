# Phase 1 Implementation Plan: Hoplite Brand Tokens, Global App Shell & Dead UI Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all color/surface tokens under the Hoplite Design System, delete 13 dead/duplicate UI files, fix core UI primitives (`Button`, `StatCard`, `CommandPalette`), and overhaul the Global App Shell (`DesktopSidebar`, `TopBar`, `TickerTape`, `MarketSessionBar`, `MobileBottomNav`, `NavDrawer`) to eliminate stacked chrome clutter and telemetry bugs.

**Architecture:** Align `packages/config/tailwind/tokens.ts` and `apps/web/src/components/chart/chart-colors.ts` with `apps/web/src/app/globals.css`, replace all 18 non-token Tailwind color usages (`cyan-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`) and off-brand hexes (`#0b0c0f`, `#D4AF37`, `#F4F1EA`) with semantic Hoplite classes, collapse the desktop top chrome from 3 bars (100px) to 1 route-scoped market strip (28px), and remove unreferenced components.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 (`@theme`), Vitest, Knip.

**Spec:** `01_Kestrel_Frontend_Deep_Audit_And_Page_Ratings.md` (§1, §3.0, §4)

## Global Constraints

- **Color Tokens Only:** Never introduce `cyan-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*`, `#0b0c0f`, `#D4AF37`, or `#F4F1EA`. Always use Hoplite tokens: `bg-bg` (`#121212`), `bg-bg-elev-1` (`#161616`), `bg-bg-elev-2` (`#1d1d1d`), `bg-bg-elev-3` (`#282828`), `text-brand` / `bg-brand` (`#ff3616`), `text-bull` / `bg-bull` (`#3f9e3d`), `text-bear` / `bg-bear` (`#e02c10`), `text-warn` / `bg-warn` (`#d98f00`), `text-info` / `bg-info` (`#4fa3b5`), `text-danger` / `bg-danger` (`#e02c10`).
- **Component Size Ceiling:** Keep every `.tsx` file `<= 250 LOC`, `<= 4 useState`, and `<= 2 useEffect`.
- **High-Value Tests Only:** Do not write trivial coverage-padding tests; verify behavior, rendering contracts, and math invariants.

## Review Focus

1. `SidebarTelemetry` bull/bear state when live tick has `bid < ask`: must compare current `mid` against previous/open price (or default to neutral/bullish), never `tick.bid >= tick.ask`.
2. `TopBar` visibility on desktop (`lg:`): must carry `lg:hidden` so desktop pages do not render two Kestrel logos side-by-side.
3. `AmbientTelemetry` route scoping: must suppress `TickerTape` and `MarketSessionBar` on `/chat`, `/settings/*`, and `/admin/*` so administrative and account pages do not run 1s market timers.
4. `StatCard` height when `sparkline` prop is omitted: must not render an empty `h-6` placeholder div.
5. `CommandPalette` mobile launcher button (`isTouch`): must be hidden when `isChat` is true so it never overlaps the `/chat` sticky composer or send button.

---

### Task 1: Unify Hoplite Color Tokens Across Config, Chart Colors & System Pages

**Files:**
- Modify: `packages/config/tailwind/tokens.ts:26-57`
- Modify: `apps/web/src/components/chart/chart-colors.ts`
- Modify: `apps/web/src/components/chart/performance-chart.tsx:39-48,133-140`
- Modify: `plugins/backtesting/src/ui/equity-chart.tsx:26-30,95-96`
- Modify: `apps/web/src/app/global-error.tsx`
- Modify: `apps/web/src/app/not-found.tsx`
- Test: `apps/web/test/pwa-brand-contract.test.ts`

**Interfaces:**
- Produces: Synchronized `colors` export in `@kestrel/config/tailwind/tokens` matching `apps/web/src/app/globals.css` (`brand: '#ff3616'`, `bull: '#3f9e3d'`, `bear: '#e02c10'`, `warn: '#d98f00'`, `info: '#4fa3b5'`, `bg: '#121212'`, `bgElev1: '#161616'`, `bgElev2: '#1d1d1d'`, `bgElev3: '#282828'`).

- [x] **Step 1: Update `packages/config/tailwind/tokens.ts` and `apps/web/src/components/chart/chart-colors.ts` to match `globals.css`**

In `packages/config/tailwind/tokens.ts`, update `colors`:
```ts
export const colors = {
  bg: '#121212',
  bgElev1: '#161616',
  bgElev2: '#1d1d1d',
  bgElev3: '#282828',
  border: '#2c2c2c',
  divider: '#1f1f1f',
  overlay: 'rgba(0, 0, 0, 0.82)',
  fg: '#e5e5e5',
  fgMuted: 'rgba(229, 229, 229, 0.6)',
  fgSubtle: 'rgba(229, 229, 229, 0.4)',
  brand: '#ff3616',
  brandFg: '#ffffff',
  brandSoft: '#ff632a',
  brandBorder: '#441c14',
  bull: '#3f9e3d',
  bear: '#e02c10',
  neutral: '#8a8a8a',
  warn: '#d98f00',
  info: '#4fa3b5',
  success: '#3f9e3d',
  danger: '#e02c10',
} as const;
```

- [x] **Step 2: Replace Slate/Tailwind hexes in `performance-chart.tsx`, `plugins/backtesting/src/ui/equity-chart.tsx`, `global-error.tsx`, and `not-found.tsx`**
  - In `apps/web/src/components/chart/performance-chart.tsx`: replace `PERF_THEME_COLORS` slate/navy hexes (`#94a3b8`, `#1e293b`, `#64748b`, `#0f172a`) with Hoplite tokens (`text: '#8a8a8a'`, `grid: '#1f1f1f'`), and change `topColor` from `rgba(34, 197, 94, 0.2)` / `rgba(239, 68, 68, 0.2)` to `rgba(63, 158, 61, 0.22)` / `rgba(224, 44, 16, 0.22)`.
  - In `plugins/backtesting/src/ui/equity-chart.tsx`: change `AXIS_COLOR` to `'#8a8a8a'`, `accent` to `positive ? '#3f9e3d' : '#e02c10'`, and `fill` to `positive ? 'rgba(63,158,61,0.14)' : 'rgba(224,44,16,0.14)'`.
  - In `apps/web/src/app/global-error.tsx`: replace `#0A0A0A` with `#121212` and `#F56E0F` with `#ff3616`.
  - In `apps/web/src/app/not-found.tsx`: replace `bg-bg-elev-1` with `bg-bg` and replace the raw `bg-fg text-black rounded-sm` link with Hoplite `bg-brand text-white rounded-md font-medium shadow-[0_4px_14px_rgba(255,54,22,0.3)]`.

- [x] **Step 3: Run tests**

Run: `pnpm --filter @kestrel/web test test/pwa-brand-contract.test.ts`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add packages/config/tailwind/tokens.ts apps/web/src/components/chart/ apps/web/src/app/global-error.tsx apps/web/src/app/not-found.tsx plugins/backtesting/src/ui/equity-chart.tsx
git commit -m "style(tokens): unify Hoplite color tokens across config, charts, and system pages"
```

---

### Task 2: Purge Non-Token Tailwind Palette Classes & Legacy Gold/Cream Hexes (18 Files)

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas/layout-presets-bar.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas/sortable-widget.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/_components/mission-control-deck.tsx`
- Modify: `apps/web/src/app/(app)/admin/_components/config-sections/telemetry-banner.tsx`
- Modify: `apps/web/src/app/(app)/journal/_components/entry-row/entry-actions.tsx`
- Modify: `apps/web/src/app/(app)/journal/_components/setup-replay-modal/replay-chart.tsx`
- Modify: `apps/web/src/app/(app)/settings/_components/appearance/appearance-card.tsx`
- Modify: `apps/web/src/app/(app)/settings/_components/data/data-card/index.tsx`
- Modify: `apps/web/src/app/(app)/settings/_components/data/preferences-card/index.tsx`
- Modify: `apps/web/src/app/(app)/settings/_components/symbols/sortable-symbol-row.tsx`
- Modify: `apps/web/src/app/(app)/settings/_components/symbols/symbols-form/catalog-section.tsx`
- Modify: `apps/web/src/app/(app)/settings/usage/_components/usage-limits-form.tsx`
- Modify: `apps/web/src/components/chat/chat-empty-state.tsx`
- Modify: `apps/web/src/components/chat/parts/agent-deliberation/verdict-summary.tsx`
- Modify: `apps/web/src/components/chat/parts/mutation-confirmation.tsx`
- Modify: `apps/web/src/components/chat/parts/tool-card.tsx`
- Modify: `apps/web/src/components/landing/landing-stepper/briefing-panel.tsx`
- Modify: `apps/web/src/components/ui/hold-to-execute-button.tsx`

- [x] **Step 1: Replace `#D4AF37` and `#F4F1EA` in `layout-presets-bar.tsx`**
  - Replace `border-[#F4F1EA]/10 bg-[#111114]` with `surface-panel border-border bg-bg-elev-1`.
  - Replace `text-[#D4AF37]` with `text-brand`, `text-[#F4F1EA]/60` with `text-fg-subtle`, and preset buttons with `surface-chip border-border bg-bg-elev-2 text-fg hover:border-brand/40 hover:text-brand`.

- [x] **Step 2: Replace all `cyan-*`, `emerald-*`, `rose-*`, `amber-*`, `sky-*` classes across the remaining 17 files**
  - Map `emerald-400/500` → `bull` (`text-bull`, `bg-bull/10`, `border-bull/30`).
  - Map `rose-400/500/600` and `#F87171` → `danger` or `bear` (`text-danger`, `bg-danger/10`, `border-danger/30`).
  - Map `amber-400/500` → `warn` (`text-warn`, `bg-warn/10`, `border-warn/30`).
  - Map `cyan-400/500`, `sky-400/500`, and `#7DD3FC` → `brand` (for interactive focus rings, checkboxes, and settings icons) or `info` (for informational badges).

- [x] **Step 3: Verify zero non-token Tailwind palette classes remain**

Run:
```bash
python3 -c '
import glob, re
files = glob.glob("apps/web/src/**/*.tsx", recursive=True)
pat = re.compile(r"(?:text|bg|border|ring|from|to|via)-(?:emerald|rose|cyan|amber|sky)-\d+")
hits = [(f, pat.findall(open(f).read())) for f in files]
hits = [(f, m) for f, m in hits if m]
assert not hits, f"Found non-token classes: {hits}"
print("0 non-token Tailwind palette hits!")
'
```
Expected: `0 non-token Tailwind palette hits!`

- [x] **Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "style(ui): replace non-token cyan/emerald/rose/amber/gold classes with Hoplite tokens"
```

---

### Task 3: Remove Dead, Unmounted & Duplicate Shim Components

**Files:**
- Delete: `apps/web/src/components/layout/hanging-pendant/index.tsx`
- Delete: `apps/web/src/components/layout/hanging-pendant/use-pendant-simulation.ts`
- Delete: `apps/web/src/components/chat/composer-action-chips.tsx`
- Delete: `apps/web/src/components/alerts/alert-card.tsx`
- Delete: `apps/web/src/components/ui/spotlight-card.tsx`
- Delete: `apps/web/src/components/chart/pin-to-chat.tsx`
- Delete: `apps/web/src/components/chart/price-tag.tsx`
- Modify: `apps/web/src/components/chart/index.ts` (remove `PinToChat` and `PriceTag` exports if present)
- Delete: `apps/web/src/app/(app)/settings/_components/agent-card.tsx`
- Delete: `apps/web/src/app/(app)/settings/_components/system-status-card/index.tsx`
- Delete: `apps/web/src/app/(app)/settings/_components/system-status-card/status-data.ts`
- Delete: `apps/web/src/app/(app)/settings/_components/system-status-card/status-rows.tsx`
- Delete: `apps/web/src/components/onboarding/_components/wizard-step-provider.tsx`
- Delete: `apps/web/src/components/dashboard/dashboard-canvas.tsx`
- Delete: `apps/web/src/components/dashboard/widgets/pnl-heatmap-widget.tsx`
- Delete: `apps/web/src/components/dashboard/widgets/watchlist-widget.tsx`
- Delete: `apps/web/src/components/news/news-toolbar.tsx`
- Delete: `apps/web/src/components/settings/about-card.tsx`
- Delete: `apps/web/src/components/settings/fallback-chain-picker.tsx`
- Delete: `apps/web/src/components/settings/settings-nav.tsx`

- [x] **Step 1: Update any test files importing the 7 `src/components/{dashboard,news,settings}/*` re-export shims to import from the canonical `@/app/(app)/...` paths**

Run a search in `apps/web/test/` for `@/components/dashboard/`, `@/components/news/news-toolbar`, and `@/components/settings/` and repoint those imports to `@/app/(app)/...`.

- [x] **Step 2: Delete the dead component files and duplicate shims**

Remove the files listed above and clean `apps/web/src/components/onboarding/wizard/index.tsx` to drop the unused `providers?: ProviderMeta[]` prop.

- [x] **Step 3: Run typecheck and tests**

Run: `pnpm --filter @kestrel/web typecheck && pnpm --filter @kestrel/web test`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add -A apps/web/
git commit -m "chore(web): remove dead components and duplicate re-export shims"
```

---

### Task 4: Overhaul Global App Shell (`DesktopSidebar`, `TopBar`, `AmbientTelemetry`, `TickerTape`, `SidebarTelemetry`)

**Files:**
- Modify: `apps/web/src/components/layout/top-bar.tsx`
- Modify: `apps/web/src/components/ui/segmented/ambient-telemetry.tsx`
- Modify: `apps/web/src/components/layout/desktop-sidebar/index.tsx`
- Modify: `apps/web/src/components/layout/desktop-sidebar/sidebar-nav-groups.tsx`
- Delete: `apps/web/src/components/layout/desktop-sidebar/sidebar-desk-hud.tsx`
- Modify: `apps/web/src/components/layout/desktop-sidebar/sidebar-telemetry.tsx`
- Modify: `apps/web/src/components/layout/desktop-sidebar/sidebar-footer.tsx`
- Modify: `apps/web/src/components/layout/mobile-bottom-nav.tsx`
- Modify: `apps/web/src/components/layout/nav-drawer/index.tsx`
- Modify: `apps/web/src/components/layout/nav-drawer/nav-drawer-sections.tsx`
- Modify: `apps/web/src/components/layout/nav-drawer/nav-link.tsx`
- Modify: `apps/web/src/components/layout/ticker-tape.tsx`
- Modify: `apps/web/src/components/layout/market-session-bar.tsx`
- Test: `apps/web/test/desktop-sidebar.test.tsx`, `apps/web/test/mobile-navigation.test.tsx`

- [x] **Step 1: Hide `TopBar` on desktop (`lg:hidden`) in `apps/web/src/components/layout/top-bar.tsx`**
  - Add `lg:hidden` to `<header>` in `top-bar.tsx` so desktop viewports (`>=1024px`, which already show `DesktopSidebar`) do not render a second redundant Kestrel header bar.

- [x] **Step 2: Scope `AmbientTelemetry` to trading/market routes only**
  - In `apps/web/src/components/ui/segmented/ambient-telemetry.tsx`, read `usePathname()` and return `null` when `isChat || pathname.startsWith('/settings') || pathname.startsWith('/admin')`.
  - In `apps/web/src/components/layout/market-session-bar.tsx`, change the `setInterval` from `1000` (1 second) to `30_000` (30 seconds) and format time as `HH:MM UTC` so the entire shell doesn't re-render every second.

- [x] **Step 3: Fix `SidebarTelemetry` `bid >= ask` bug & hardcoded fallback, and clean up `DesktopSidebar` / `NavDrawer` / `MobileBottomNav`**
  - In `sidebar-telemetry.tsx`:
    - Track previous mid price via `useRef<number | null>(null)` so `isBull` compares `tick.mid >= prevMid` (defaulting to `true`), NOT `tick.bid >= tick.ask`.
    - When `tick?.mid` is not yet loaded, show `'---.--'` with `text-fg-subtle` instead of fake `'2734.50'`.
  - In `desktop-sidebar/index.tsx`, `mobile-bottom-nav.tsx`, `nav-drawer/index.tsx`, `sidebar-nav-groups.tsx`, and `nav-link.tsx`:
    - Replace `bg-[#0b0c0f]/95` and `bg-[#0b0c0f]/98` with `bg-bg/95` (`#121212`), and replace `bg-[#16171d]/95` with `bg-bg-elev-2/95` (`#1d1d1d`).
    - Replace `shadow-[0_0_6px_rgba(0,230,118,0.8)]` with `shadow-[0_0_6px_rgba(63,158,61,0.7)]`.
  - In `sidebar-nav-groups.tsx` and `nav-drawer-sections.tsx`:
    - Remove `<SidebarDeskHud />` under item 0 (`Research`) and delete `sidebar-desk-hud.tsx`.
    - Format the Plugins section header consistently as `// PLUGINS` with the horizontal rule (`<span className="h-px flex-1 bg-white/[0.06]" />`) matching `// NAVIGATION`.
  - In `sidebar-footer.tsx` and `nav-drawer/index.tsx`:
    - Replace fake `LIVE // 24ms` with `ONLINE` (or remove the fake latency number).

- [x] **Step 4: Run sidebar and navigation tests**

Run: `pnpm --filter @kestrel/web test test/desktop-sidebar.test.tsx test/mobile-navigation.test.tsx`
Expected: PASS (update snapshots/assertions if they asserted on `SidebarDeskHud` or `24ms`).

- [x] **Step 5: Commit**

```bash
git add -A apps/web/src/components/layout/ apps/web/src/components/ui/segmented/ambient-telemetry.tsx apps/web/test/
git commit -m "feat(shell): streamline desktop/mobile chrome, fix telemetry bugs, and align Hoplite surfaces"
```

---

### Task 5: Polish Core UI Primitives (`StatCard`, `Button`, `CommandPalette`)

**Files:**
- Modify: `apps/web/src/components/ui/stat-card.tsx:89-97`
- Modify: `apps/web/src/components/ui/button.tsx:57-62,153`
- Modify: `apps/web/src/components/layout/command-palette/index.tsx:238-248`
- Test: `apps/web/test/card.test.tsx`

- [x] **Step 1: Remove the dead 24px `h-6` bottom void in `StatCard` (`stat-card.tsx`)**
  - In `apps/web/src/components/ui/stat-card.tsx` lines 89–97, render `<Sparkline ... />` when `sparkline && sparkline.length >= 2`, and `null` otherwise (delete `: (<div className="h-6" />)`).

- [x] **Step 2: Fix `Button` size scale and duplicate active translate class (`button.tsx`)**
  - In `apps/web/src/components/ui/button.tsx`, set `md: 'h-11 px-4 text-sm font-medium rounded-md'` (44px WCAG touch target minimum) and remove redundant `active:translate-y-[0.5px]` where `tactile-press` is already applied.

- [x] **Step 3: Hide `CommandPalette` touch floating button on `/chat` (`command-palette/index.tsx`)**
  - In `apps/web/src/components/layout/command-palette/index.tsx`, import `useShellRoute` from `../shell-route-context` and render the `isTouch` floating launcher button only when `isTouch && !isChat` so it never collides with the `/chat` composer or scroll-to-bottom FAB.

- [x] **Step 4: Run UI tests**

Run: `pnpm --filter @kestrel/web test test/card.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/stat-card.tsx apps/web/src/components/ui/button.tsx apps/web/src/components/layout/command-palette/index.tsx
git commit -m "fix(ui): remove StatCard empty void, enforce 44px md Button height, and hide touch ⌘K FAB on chat"
```
