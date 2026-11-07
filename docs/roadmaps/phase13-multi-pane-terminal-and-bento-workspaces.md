# Phase 13: Multi-Pane Terminal Mode, Hairline Bento Dashboard & Unified Market Workstation

> **Status:** Complete (2026-11-07)
> **Scope:** Masterpiece #6 ("Multi-Pane Terminal Mode" — Resizable Split Workspaces), Dual-Stack War Room Sidecar (`ThreadViewsDock`), Hairline Bento Dashboard (`DashboardCanvas` & `SortableWidget`), Inline Watchlist Range Crosshair (`Idea A`), Edge-to-Edge Pro Chart Toolbar (`ProChartView`), Unified 3-Column Market Intelligence Workstation (`/news`, `/calendar`, `/alerts`), and 24-Hour UTC Killzone Horizon Scrubber (`Idea B`).
> **Hard Constraints (`AGENTS.md`):**
>
> - Keep every `.tsx` file `<= 450` LOC and every `.ts` file `<= 500` LOC.
> - Do not break URL routes (`/news`, `/calendar`, `/alerts`, `/chart/[symbol]`, `/dashboard`, `/chat`) or server-side data fetching contracts.
> - Ensure mobile (`<1024px`) gracefully adapts every desktop split-pane or Bento grid into touch-ergonomic tabs/drawers with `>=44px` hit targets.

---

## 1. Architecture of Masterpiece #6: "Multi-Pane Terminal Mode" & Hairline Bento Grids

Professional quantitative terminals (Linear, Raycast, TradingView, Bloomberg) never waste widescreen monitors on centered single-column feeds or floating cards with wide gutters. Phase 13 upgrades Kestrel's three main operational workspaces:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. RESEARCH COCKPIT (/chat) — Dual-Stack Split War Room                      │
│ ┌──────────────────────────────────────┬───────────────────────────────────┐ │
│ │                                      │ LIVE CHART (XAUUSD · 15m)         │ │
│ │  Chat Thread & Arbiter Synthesis     ├═══════════════════════════════════┤ │
│ │  (Left Resizable Pane)               │ ↕ 1px Machined Vertical Split Bar │ │
│ │                                      ├═══════════════════════════════════┤ │
│ │  [ Composer Dock ]                   │ 4-DESK COUNCIL / EXECUTION PLAN   │ │
│ └──────────────────────────────────────┴───────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ 2. OVERVIEW DASHBOARD (/dashboard) — Exposed 1px Hairline Bento Matrix       │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ MORNING COMMAND HEADER: [Session Dial] [Next Event] [Open Risk] [4 Desks]│ │
│ ├───────────────────────┬──────────────────────────┬───────────────────────┤ │
│ │ WATCHLIST (1px cell)  │ PERFORMANCE CURVE (2col) │ AI BRIEFING / CAL     │ │
│ └───────────────────────┴──────────────────────────┴───────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ 3. MARKET INTELLIGENCE (/news, /calendar, /alerts) — Desktop Split Terminal  │
│ ┌───────────────────────┬──────────────────────────┬───────────────────────┐ │
│ │ MACRO CALENDAR RAIL   │ REAL-TIME NEWS WIRE      │ ACTIVE ALERTS & PULSE │ │
│ └───────────────────────┴──────────────────────────┴───────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Task Breakdown

### Task 13.1 — Dual-Stack Split Mode in the War Room Dock (`apps/web/src/components/chat/thread-views-dock/index.tsx`)

**Problem:** Currently, `ThreadViewsDock` only shows one tab at a time (`Chart` OR `Council` OR `Plan`). On desktop, a trader reviewing the 4-Desk Council opinions has to constantly click back and forth between the `Chart` tab and the `Council` tab to verify price levels against candlesticks.

**Implementation Specification:**

1. **Add Split-Stack Toggle (`Single Tab` vs. `Chart + Council Split`) in `ThreadViewsDock` (`apps/web/src/components/chat/thread-views-dock/index.tsx`):**
   - On desktop (`isDesktop`), add a compact split-view toggle button in the dock header (`[ ⬒ Split Chart ]`, persisted in `localStorage` under `kestrel:war-room-split-stack:v1`, default `true` on viewports with `window.innerHeight >= 760`).
   - When `splitStack` is active on desktop:
     - **Top Pane (Resizable height `35%`–`65%`, default `45%`):** Always renders `<DockChartPanel symbol={symbol} activeTf={activeTf} onTimeframeChange={handleTimeframeChange} />`.
     - **Horizontal Machined Resize Handle (`h-2 cursor-row-resize border-y border-white/[0.07] bg-[#101113] hover:bg-brand/15`):** Dragging adjusts the vertical split ratio between the live chart and the lower intelligence pane.
     - **Bottom Pane (`flex-1`):** Renders the active intelligence tab (`Council` (`DockOpinionsPanel`) or `Plan` (`DockPlanPanel`)).
   - On mobile (`<1024px`) or when `splitStack` is toggled off, preserve the single-tab view (`Chart | Council | Plan`).

---

### Task 13.2 — Hairline Bento Grid & Zero-Shift Edit HUD on `/dashboard` (`apps/web/src/app/(app)/dashboard/*`)

**Problem:**

1. `DashboardCanvas` renders widgets in a loose grid (`gap-3.5 sm:gap-4`) where adjacent cards often have mismatched heights and thick duplicate borders.
2. Toggling `Customize Layout` (`editMode = true`) inserts a bulky `mb-1.5` toolbar block above every single widget (`SortableWidget`), pushing all widgets down and breaking visual WYSIWYG alignment.

**Implementation Specification:**

1. **Zero-Shift Floating Edit HUD (`apps/web/src/app/(app)/dashboard/_components/dashboard-canvas/sortable-widget.tsx`):**
   - Remove the layout-shifting above-card block when `editMode` is `true`.
   - Instead, render the Edit HUD (`Drag Handle`, `Widget Label`, `Span Cycle: 1x / 2x / 3x`, and `Remove X`) as an **inset top-right floating glass pill** (`absolute top-2.5 right-2.5 z-20 flex items-center gap-1 rounded-lg border border-brand/40 bg-[#121315]/95 px-2 py-1 shadow-xl backdrop-blur-md`) with a subtle dashed/illuminated ring (`ring-1 ring-brand/45`) around the widget. The grid geometry never shifts by a single pixel when entering or exiting Edit Mode!
2. **Hairline Bento Grid Container (`apps/web/src/app/(app)/dashboard/_components/dashboard-canvas/index.tsx`):**
   - Wrap the `SortableContext` grid in a precision architectural Bento frame:
     `grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-2 lg:grid-cols-3 shadow-2xl`
   - Ensure each widget inside `SortableWidget` stretches to `h-full` with a flush `bg-[#121315] rounded-none border-0` surface override (via a `[&>.surface-card]:rounded-none [&>.surface-card]:border-0 [&>.surface-card]:h-full` wrapper class on the Bento cell) so adjacent widgets share crisp `1px` structural hairlines with zero uneven gaps.
3. **Refined `MissionControlDeck` (`mission-control-deck.tsx`) & `StrategistDeskCard` (`strategist-desk-card.tsx`):**
   - In the expanded `MissionControlDeck`, replace the `.webp` blur with `<BlueprintPlate id={desk.blueprintId} showRasterBackup />` inside each `StrategistDeskCard` and join the 4 desk cards into a flush 4-column hairline matrix (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.08] rounded-xl overflow-hidden`).

---

### Task 13.2B — Inline Session Range Crosshair (`L`–`H` Micro-Gauge) in `WatchlistWidget` (`Idea A` — `apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget/watch-row.tsx`)

**Problem:** `WatchRow` (`watch-row.tsx`) currently displays only the symbol name, mid price, and an 80px `Sparkline`. A trader glancing at the watchlist cannot tell whether `XAUUSD` is sitting at the very top of its session range, at 50% equilibrium, or sweeping session lows.

**Implementation Specification:**

1. **Increase Rolling Buffer Depth (`use-watchlist-ticks.ts`):**
   - Increase `BUFFER_SIZE` from `10` to `24` in `apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget/use-watchlist-ticks.ts` so the sparkline and range gauge reflect a richer intraday window.
2. **Add the Recessed `L`–`H` Crosshair Micro-Gauge in `WatchRow` (`watch-row.tsx`):**
   - Compute `minPrice = Math.min(...buf, tick.bid, tick.mid)` and `maxPrice = Math.max(...buf, tick.ask, tick.mid)`.
   - Compute `rangePct = maxPrice > minPrice ? Math.min(100, Math.max(0, ((displayPrice - minPrice) / (maxPrice - minPrice)) * 100)) : 50`.
   - Directly beneath the `Sparkline` (or integrated into a stacked `w-24` telemetry column in `WatchRow`), render a `h-1.5 w-full rounded-full bg-[#090a0b] border border-white/[0.06] relative`:
     - Center 50% equilibrium tick (`absolute left-1/2 top-0 bottom-0 w-px bg-white/15`).
     - Fill bar from `0%` to `rangePct%` tinted by `isBull ? 'bg-bull/40' : 'bg-bear/40'`.
     - Precision `#FF3616` (`bg-brand shadow-[0_0_6px_#ff3616]`) `size-1.5 rounded-full` crosshair bead positioned at `style={{ left: \`\${rangePct}%\` }}`with`title={\`Range: \${minPrice.toFixed(decimals)} – \${maxPrice.toFixed(decimals)} (\${Math.round(rangePct)}%)\`}`.

---

### Task 13.3 — Edge-to-Edge Pro Chart Terminal Toolbar (`apps/web/src/app/(app)/chart/[symbol]/_components/pro-chart-view.tsx`)

**Problem:** `ProChartView` stacks `MarketSubNav` + a two-tier `surface-card` box (`p-3 rounded-[16px]`) above `TradingViewWidget`, wasting ~140px of vertical height on controls.

**Implementation Specification:**

1. Collapse the chart controls in `ProChartView` (`apps/web/src/app/(app)/chart/[symbol]/_components/pro-chart-view.tsx`) into a **Single 44px Milled Terminal Bar** (`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#131416] px-3 py-1.5`):
   - **Left Cluster:** `<SymbolPicker active={symbol} watchlist={watchlist} />` + vertical hairline divider + `<TimeframePicker value={currentTf} onChange={setTf} />`.
   - **Right Cluster:** Compact `MarketSubNav` links (`News · Calendar · Alerts`) + `<Link href={`/chat?prompt=...`}>` (`Analyze ${symbol} in Chat →` ember button).
2. Expand the `TradingViewWidget` container height so it fills `calc(100svh - 8.5rem)` on desktop, giving the trader a true full-viewport charting workstation.

---

### Task 13.4 — Unified Market Intelligence Workstation (`/news`, `/calendar`, `/alerts`)

**Problem:** On desktop, `/news`, `/calendar`, and `/alerts` each render a single wide column of cards. A trader checking macro catalysts before an NFP or FOMC release has to jump across three separate pages (`News` ↔ `Calendar` ↔ `Alerts`).

**Implementation Specification:**

1. **Create a Shared Desktop Split-Rail Companion (`apps/web/src/components/layout/market-terminal-rail.tsx`, `<= 220` LOC):**
   - On desktop (`xl:grid xl:grid-cols-12 xl:gap-6 items-start`), upgrade `/news/page.tsx`, `/calendar/page.tsx`, and `/alerts/page.tsx` from single-column views into a **2-Pane / 3-Zone Market Intelligence Workstation**:
     - **Primary Active Pane (`xl:col-span-8`):** Renders the full interactive view for the current route (`NewsView` on `/news`, `CalendarView` on `/calendar`, `AlertList` on `/alerts`), using a tighter, higher-density hairline list layout.
     - **Right Live Companion Rail (`hidden xl:flex xl:col-span-4 xl:sticky xl:top-4 flex-col gap-4`):**
       - On `/news`: Renders the live `CalendarHero` countdown (`Next High-Impact Catalyst`) + a compact `Upcoming Today` macro strip and quick link to `/alerts`.
       - On `/calendar`: Renders `SentimentSummary` (`News Pulse Semicircular Gauge`) + the top 5 breaking macro headlines.
       - On `/alerts`: Renders the live `WatchlistWidget` price feed + `CalendarHero` next-event countdown so the trader sees live prices and upcoming volatility right next to their alert triggers!
2. **Tighten `ArticleCard` (`apps/web/src/components/news/article-card.tsx`) & `EventCard` (`apps/web/src/components/calendar/event-card/index.tsx`):**
   - Replace heavy per-card drop shadows with a crisp hairline ledger aesthetic (`border-white/[0.07] bg-[#131416] hover:border-white/[0.15]`), keeping the 1px left sentiment/impact color bar (`bull`, `bear`, `danger`, `warn`) and inline `Ask AI` action pill.

---

### Task 13.4B — 24-Hour UTC "Killzone Horizon Scrubber" in `CalendarHero` (`Idea B` — `apps/web/src/app/(app)/calendar/_components/calendar-hero.tsx`)

**Problem:** `CalendarHero` (`calendar-hero.tsx`) currently shows only a 3-color stacked bar of 14-day event counts (`High / Medium / Low`). It misses the most critical intraday timing relationship in Gold & Forex: **where today's macro releases fall relative to the Asia, London, and New York Killzone windows**.

**Implementation Specification:**

1. **Add the `<KillzoneHorizonTimeline />` inside `CalendarHero` (`apps/web/src/app/(app)/calendar/_components/calendar-hero.tsx`):**
   - Compute current UTC progress across the 24-hour day: `nowUtcPct = ((utcHour * 60 + utcMinute) / 1440) * 100`.
   - Filter today's scheduled events (`events.filter((e) => e.date >= today0 && e.date < todayEnd)`) and map each event's UTC timestamp to its horizontal percentage `eventUtcPct = (((new Date(e.date).getUTCHours() * 60) + new Date(e.date).getUTCMinutes()) / 1440) * 100`.
   - Render a machined recessed 24-hour track (`surface-well relative h-9 w-full overflow-hidden rounded-lg border border-white/[0.07] bg-[#090a0b] px-2`):
     - **Session Zone Bands:**
       - `ASIA (00:00–09:00 UTC)`: `left: 0%`, `width: 37.5%`, `bg-info/[0.06] border-r border-info/20`.
       - `LONDON (07:00–16:00 UTC)`: `left: 29.17%`, `width: 37.5%`, `bg-white/[0.03] border-x border-white/10`.
       - `LON×NY KILLZONE (12:00–16:00 UTC)`: `left: 50%`, `width: 16.67%`, `bg-brand/[0.12] border-x border-brand/40` with subtle `KILLZONE` micro-label.
       - `NEW YORK (12:00–21:00 UTC)`: `left: 50%`, `width: 37.5%`, `bg-bull/[0.05] border-r border-bull/20`.
     - **Today's Macro Catalyst Pins:** Render a diamond/circle marker at `left: ${eventUtcPct}%` for each event today (`bg-danger shadow-[0_0_8px_#f03e3e]` for `high`, `bg-warn` for `medium`, `bg-fg-subtle` for `low`) with a native `title` / hover readout (`13:30 UTC · US CPI m/m · HIGH`).
     - **Live `NOW` Playhead Needle:** Render a full-height `w-px bg-brand shadow-[0_0_8px_#ff3616]` vertical laser line at `left: ${nowUtcPct}%` with a top `▼` playhead cap labeled with the live UTC time.

---

## 3. Phase 13 Verification Gate

```bash
# 1. Run static architecture, route-security, env-contract, and file-size guards
pnpm check:guards

# 2. Run dead-code and unused-export check (must report 0 findings)
pnpm knip

# 3. Run linter, formatter check, and affected typecheck + unit tests
pnpm check:fast
```
