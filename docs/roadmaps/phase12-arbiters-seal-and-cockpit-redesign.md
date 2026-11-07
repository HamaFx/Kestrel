# Phase 12: "The Arbiter's Seal" Trade Ticket, Research Cockpit & Core View Redesign

> **Status:** Complete (2026-11-07)
> **Scope:** Masterpiece #3 ("The Arbiter's Seal" — Cryptographic Trade Ticket, Interactive Position Size & Lot Calculator, and 1-Click `HoldToExecuteButton` Dispatch to Journal + Alerts), `/chat` Command Pedestal Empty State + Collapsible Left Thread Ledger Rail (`Idea C`), Trade Journal Execution Ledger + Interactive "What-If" Replay Stop Scrubber (`Idea D`), and Linear-Style Settings Property Rows.
> **Hard Constraints (`AGENTS.md`):**
>
> - Keep every `.tsx` file `<= 450` LOC and every `.ts` file `<= 500` LOC.
> - Reuse existing backend endpoints (`/api/journal`, `/api/alerts`) and UI primitives (`HoldToExecuteButton`, `Drawer`, `Tooltip`, `sonner` toast) without inventing mock APIs.
> - Preserve all existing `data-testid` attributes (`mastra-report-card`, `mastra-agent-badge`, etc.) and ARIA roles so unit and E2E tests continue to pass.

---

## 1. Architecture of Masterpiece #3: "The Arbiter's Seal"

Currently, when the 4-Desk Committee finishes deliberating, `SyndicateDossierCard` (`apps/web/src/components/chat/parts/syndicate-dossier/syndicate-dossier-card.tsx`) displays four static text wells (`ENTRY ZONE`, `INVALIDATION (SL)`, `TP1`, `TP2`). To actually act on the trade plan, the trader has to manually copy the numbers, calculate their lot size in an external calculator, navigate to `/journal` to log the position, and navigate to `/alerts` to set invalidation/target alerts.

**"The Arbiter's Seal"** turns `SyndicateDossierCard` and `DockPlanPanel` into an interactive, institutional-grade **Execution & Risk Ticket**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ● VERIFIED SYNDICATE DOSSIER · XAUUSD                      [ BUY / GO ]      │
│   PLAN #KSL-4A9F [Copy] · ALIGNMENT CONFIRMED · 4-DESK COUNCIL               │
├──────────────────────────────────────────────────────────────────────────────┤
│ BULLISH 78% ████████████████████████████●░░░░░░░░░ BEARISH 22%   (CONSENSUS) │
├──────────────────┬──────────────────┬───────────────────┬────────────────────┤
│ ENTRY ZONE       │ INVALIDATION (SL)│ TP1 (40% SCALE)   │ TP2 RUNNER (1:3.2) │
│ 2,864.20         │ 2,852.00 (-12.2) │ 2,882.50 (+18.3)  │ 2,903.20 (+39.0)   │
├──────────────────┴──────────────────┴───────────────────┴────────────────────┤
│ ⚙ ARBITER POSITION SIZER & SEAL                    [Account: $25,000] [1.0%] │
│   Stop Distance: 12.20 pts  ·  Max Risk: $250.00  ·  Size: 0.20 Lots (20 oz) │
│   [ ████████ Hold to Seal: Log Trade & Arm SL/TP Alerts (1.2s) ████████ ]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Task Breakdown

### Task 12.1 — Interactive Position Sizer & Cryptographic Seal (`apps/web/src/components/chat/parts/syndicate-dossier/*`)

**Implementation Specification:**

1. **Create `apps/web/src/components/chat/parts/syndicate-dossier/arbiter-seal-sizer.tsx` (`<= 280` LOC):**
   - Accepts `symbol: string | null`, `planId: string`, and `levels: ExtractedTradeLevels` (`direction`, `entry`, `invalidation`, `tp1`, `tp2`, `isVetoed`).
   - **Numeric Parsing Helper:** Parse `levels.entry`, `levels.invalidation`, `levels.tp1`, and `levels.tp2` into finite numbers (stripping commas). Only render the interactive sizer and execution bar when `entry` and `invalidation` parse to valid positive numbers (`entryNum > 0 && slNum > 0 && entryNum !== slNum`) and `levels.direction !== 'NEUTRAL'`.
   - **Persisted Account Equity & Risk % Inputs:**
     - Use `useLocalStorage<number>('kestrel:sizer-equity:v1', 10000)` for Account Balance (`$1,000` – `$10,000,000`) and `useLocalStorage<number>('kestrel:sizer-risk-pct:v1', 1.0)` for Risk % (`0.25%`, `0.50%`, `0.75%`, `1.00%`—hard-capped at `1.0%` by the Aegis Risk Guardrail, or `0.5%` when `levels.dissent` is `true`!).
   - **Deterministic Position Size Math (using `@kestrel/shared` symbol contract conventions):**
     - Compute `stopDistance = Math.abs(entryNum - slNum)`.
     - Compute `riskDollars = equity * (effectiveRiskPct / 100)`.
     - Compute unit/lot size based on symbol class:
       - `XAUUSD`: `1 standard lot = 100 oz` (`$100` per `$1.00` move) → `unitsOz = riskDollars / stopDistance`, `lots = unitsOz / 100`.
       - Forex USD-quote pairs (`EURUSD`, `GBPUSD`, `AUDUSD`): `1 standard lot = 100,000 units` → `units = riskDollars / stopDistance`, `lots = units / 100_000`.
       - JPY/CHF/CAD quote pairs or Crypto (`BTCUSDT`, `ETHUSDT`): display exact `units = riskDollars / stopDistance` and `Risk $`.
   - **1-Click Tactile Execution via `<HoldToExecuteButton>` (`apps/web/src/components/ui/hold-to-execute-button.tsx`):**
     - When `levels.isVetoed` is `true`, disable the button and display `BLOCKED BY AEGIS RISK GUARDRAIL`.
     - When armed, holding `<HoldToExecuteButton variant={levels.direction === 'BUY' ? 'bull' : 'bear'} holdDurationMs={1000} label="Hold to Seal Plan (Log Journal + Arm Alerts)" />` executes in parallel via `apiMutate`:
       1. `POST /api/journal` with `{ symbol, direction: levels.direction === 'BUY' ? 'long' : 'short', entry: entryNum, stop: slNum, target: tp2Num ?? tp1Num, size: Number(lotsOrUnits.toFixed(2)), notes: \`Sealed from Syndicate Dossier \${planId}\`, tags: ['council-seal'] }`.
       2. `POST /api/alerts` for the invalidation level (`condition: levels.direction === 'BUY' ? 'below' : 'above'`, `targetPrice: slNum`, `note: \`\${planId} Invalidation (SL)\``) and primary target (`condition: levels.direction === 'BUY' ? 'above' : 'below'`, `targetPrice: tp1Num ?? tp2Num`, `note: \`\${planId} Target\` `).
     - Fire a rich `toast.success` notification (`sonner`) with quick links to `/journal` and `/alerts`, and transition the seal state to `SEALED · #KSL-XXXX`.
2. **Wire `<ArbiterSealSizer />` into `SyndicateTicketHeader` (`syndicate-dossier-header.tsx`) and `DockPlanPanel` (`dock-plan-panel.tsx`):**
   - Place a compact collapsible toggle (`[ ⚙ Position Sizer & Seal ]`) directly beneath `InstrumentWells` in `SyndicateTicketHeader` so inline chat cards stay compact by default and expand smoothly on click, while `DockPlanPanel` renders it expanded when a council plan is active.

---

### Task 12.2 — `/chat` Empty State Compression: The Command Pedestal (`apps/web/src/components/chat/chat-empty-state.tsx`)

**Problem:** `ChatEmptyState` currently stacks a large header, a tall full-width hero card, a 4-card desk grid (`min-h-[132px]` each), and 6 prompt chips, forcing vertical scrolling on laptops and phones before a single message is sent.

**Implementation Specification:**

1. **Remove `Bebas Neue` Watermark & `.webp` Blur Blob:**
   - Replace the `font-bebas` watermark and `kestrel-horus-statue.webp` blur with `<BlueprintPlate id="arbiter" showRasterBackup className="pointer-events-none absolute inset-0 m-auto size-[440px] opacity-35" />`.
2. **Restructure into a Single Cohesive "Council Command Pedestal" (`max-w-3xl w-full`):**
   - **Compact Header:** Eyebrow badge (`SOVEREIGN COUNCIL CHAMBER`) + `Funnel Display` title (`Convene the Council of Strategists`) in `gap-1.5`.
   - **Unified Pedestal Frame (`border border-white/10 rounded-2xl bg-[#121315]/90 overflow-hidden divide-y divide-white/[0.07] shadow-2xl`):**
     - **Top Row (Stage I → II Full Council Primary Trigger):** A horizontal split row with the 4 desk color dots (`HORUS · ASTROLABE · AEGIS · SENTINEL`), concise description, and the `#FF3616` `Convene 4-Desk Syndicate →` CTA button.
     - **Middle Row (4 Specialist Fast-Scout Lenses — `grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-white/[0.06]`):** Four flush, hairline-divided cells (no gap/margin between cards!) where each cell shows `desk.code`, `desk.title`, `desk.epithet` in `font-redaction-35`, and a subtle hover-illuminated `Fast Scout →` indicator.
     - **Bottom Row (Quick Ticker Dispatch Strip):** A single horizontal scrollable or wrapped strip of compact monospace prompt pills (`› 4H Structure`, `› Session Levels`, `› Real Yields`, `› 1% Risk Plan`, `› COT Flow`).

---

### Task 12.2B — Collapsible Left Thread Ledger Rail in `/chat` (`Idea C` — `apps/web/src/components/chat/*`)

**Problem:** Switching between active research conversations in `/chat` currently requires clicking the title in `ChatTopBar` (`chat-top-bar/index.tsx`) to open a modal drawer (`ThreadSwitcher`), hiding symbol-specific threads (`XAUUSD`, `EURUSD`, `GBPUSD`) behind two clicks even on wide desktop monitors.

**Implementation Specification:**

1. **Create `apps/web/src/components/chat/thread-ledger-rail.tsx` (`<= 220` LOC):**
   - Renders on desktop (`hidden xl:flex flex-col shrink-0 border-r border-white/[0.07] bg-[#101113] transition-[width] duration-200`) when toggled open (`w-[228px]`, persisted in `localStorage` under `kestrel:chat-thread-rail:v1`, default `true` on `>=1440px`).
   - **Header Row (`h-12 border-b border-white/[0.06] px-3 flex items-center justify-between`):**
     - Monospace label `RESEARCH LEDGER` + thread count badge + `+ New` icon button (`onPickNew`).
   - **Symbol-Grouped Thread List (`flex-1 overflow-y-auto p-2 space-y-3`):**
     - Group `threads: ThreadSummary[]` by `pinnedSymbol ?? 'GENERAL'` (`XAUUSD`, `EURUSD`, `GBPUSD`, `GENERAL`).
     - Each group header shows a crisp `10px` monospace symbol badge (`XAUUSD · 3`).
     - Each thread item renders as a compact `min-h-9` row (`rounded-lg px-2.5 py-1.5 text-xs`) with active hairline highlight (`border-brand/40 bg-bg-elev-2 text-fg font-medium` when `t.id === threadId`), truncated title, and relative timestamp (`2h`, `1d`).
   - **Footer Row:** Button to open the full `ThreadSwitcher` drawer when the user wants bulk-select / bulk-delete or full-text search.
2. **Wire into `ChatScreen` (`apps/web/src/components/chat/chat-screen.tsx`) & `ChatTopBar` (`chat-top-bar/index.tsx`):**
   - Add a rail toggle button (`IconLayoutSidebar`) next to the thread title in `ChatTopBar` on `xl:` screens and mount `<ThreadLedgerRail />` as the leftmost column inside `ChatScreen`'s main flex row (`[ThreadLedgerRail] | [ChatThreadView] | [ThreadViewsDock]`). Keep `<ThreadSwitcher />` intact for `<1280px` screens and bulk management.

---

### Task 12.3 — Trade Journal Execution Ledger & Slide-Over Inspector (`apps/web/src/app/(app)/journal/*`)

**Problem:** In `/journal`, every trade in `EntryList` renders as a tall multi-line `surface-panel` card (`EntryRow`) with an embedded slider bar, making it slow to scan dozens of historical executions.

**Implementation Specification:**

1. **Add View-Mode Toggle (`Ledger Table` vs. `Detailed Cards`) in `EntryList` (`apps/web/src/app/(app)/journal/_components/entry-list/index.tsx`):**
   - Default desktop (`>=768px`) to a razor-sharp **Institutional Execution Ledger** (`table-stack` on mobile, tabular grid on desktop) with `1px` hairline row dividers (`divide-y divide-white/[0.06]`), sticky monospace column headers (`DATE · SYMBOL · SIDE · ENTRY → EXIT · STOP / TARGET · R-MULTIPLE · P&L · ACTIONS`), and inline compact SL-to-TP progress micro-bars.
   - Clicking any row (or its `Inspect / Replay` action) opens `SetupReplayModal` / an execution detail drawer with the full `EntrySliderBar`, `CloseEntryForm`, notes, tags, screenshot preview, and AI review.
   - Keep `EntryRow` available when the user switches to `Detailed Cards` mode or on narrow mobile viewports so zero existing functionality or tests break.

---

### Task 12.3B — Interactive "What-If" Stop & Target Scrubber in `SetupReplayModal` (`Idea D` — `apps/web/src/app/(app)/journal/_components/setup-replay-modal/*`)

**Problem:** `SetupReplayModal` (`setup-replay-modal/index.tsx`) currently displays static read-only `ExecutionLevels` and `ReplayStatsGrid`. Traders reviewing a losing or premature exit cannot test how an `AEGIS`-compliant stop or asymmetric target would have altered the outcome across that trade's historical candle window.

**Implementation Specification:**

1. **Create `apps/web/src/app/(app)/journal/_components/setup-replay-modal/what-if-scrubber.tsx` (`<= 240` LOC):**
   - Accepts `entry: JournalEntry` and `replay: TradeSetupReplayDTO | undefined`.
   - Initializes `whatIfStop` (`entry.stop ?? entry.entry * (entry.direction === 'long' ? 0.995 : 1.005)`) and `whatIfTarget` (`entry.target ?? entry.entry * (entry.direction === 'long' ? 1.015 : 0.985)`).
   - **Interactive Dual-Scrubber Controls (`surface-well rounded-xl border border-white/[0.07] p-3.5`):**
     - **Stop-Loss Slider & Stepper:** Adjusts `whatIfStop` within `±3%` of `entry.entry` (or bounded by `replay.candles` min/max), with quick preset pills (`[ Actual SL ]`, `[ -0.5R Tighter ]`, `[ MFE Breakeven ]`).
     - **Target Slider & Stepper:** Adjusts `whatIfTarget` with quick preset pills (`[ Actual TP ]`, `[ 1:2 R:R ]`, `[ 1:3 Aegis Floor ]`, `[ Peak MFE ]`).
   - **Deterministic Historical Candle Simulation:**
     - Walk `replay?.candles ?? []` chronologically after `entry.openedAt`:
       - Check if any candle's `low <= whatIfStop` (for `long`) or `high >= whatIfStop` (for `short`) before hitting `whatIfTarget`.
       - Compute **Simulated Outcome** (`STOPPED OUT (-1.00 R)`, `TARGET HIT (+X.XX R)`, or `HELD TO EXIT (+/-X.XX R)`), **Simulated R-Multiple**, and **Delta vs. Actual Realized R** (`+1.45 R improvement` in `text-bull` or `-0.80 R` in `text-bear`).
2. **Mount `<WhatIfScrubber />` inside `SetupReplayModal` (`setup-replay-modal/index.tsx`):**
   - Render `<WhatIfScrubber entry={entry} replay={replay} />` directly below `ExecutionLevels` so every journal replay becomes an interactive post-trade lab.

---

### Task 12.4 — Linear-Style Hairline Property Lists in Settings (`apps/web/src/app/(app)/settings/*`)

**Problem:** Settings subpages wrap groups and individual rows in thick bordered boxes with competing shadows.

**Implementation Specification:**

1. **Refine `SettingsSection` (`apps/web/src/app/(app)/settings/_components/settings-section.tsx`) and `SettingsRow` (`settings-row.tsx`):**
   - Use a clean 2-column architectural split on desktop (`grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 border-b border-white/[0.07] pb-8`):
     - **Left Column (`lg:col-span-4`):** Section icon housing (`IconBadge`), `Funnel Display` title, and muted description.
     - **Right Column (`lg:col-span-8`):** A single sleek container (`rounded-xl border border-white/[0.08] bg-[#131416] divide-y divide-white/[0.06] overflow-hidden`) where child `SettingsRow` items sit flush against shared `1px` dividers without redundant nested card borders.

---

## 3. Phase 12 Verification Gate

```bash
# 1. Run static architecture, route-security, env-contract, and file-size guards
pnpm check:guards

# 2. Run dead-code and unused-export check (must report 0 findings)
pnpm knip

# 3. Run linter, formatter check, and affected typecheck + unit tests
pnpm check:fast
```
