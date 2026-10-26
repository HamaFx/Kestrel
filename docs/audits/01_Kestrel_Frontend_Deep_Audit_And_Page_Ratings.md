# Kestrel Frontend Deep Audit, Visual Architecture Review & Page-by-Page Scorecard

> **Scope:** Complete static, visual, UX, information-architecture, and brand-consistency audit of Kestrel's frontend (`apps/web/src/**`, `plugins/*/src/ui/**`, `packages/plugin-sdk/src/ui/**`, `packages/config/tailwind/tokens.ts`, and `docs/design-system.md` — **601 `.tsx` files** across **28 routes and screens**).  
> **Brand Reference:** **The Hoplite Design System** (`docs/design-system.md` & `apps/web/src/app/globals.css`) — *Classical Sovereign Authority × Tactile Cyber-Industrial Hardware*.

---

## 1. Executive Frontend Scorecard

Kestrel has a standout visual vision in its **Hoplite Design System** (Funnel Display + Redaction 35 Italic + Geist Mono, recessed data wells, chamfered chips, and `#FF3616` Forge Flame ember accents) and strong engineering foundations (virtualized message and trade lists, keyboard navigation, command palette, and modular plugin UI slots).

However, because the frontend evolved across multiple rapid iterations ("Phase 1 Flat Monochrome", "Gold/Cream Neoclassical", "Slate/Cyan SaaS", and "Hoplite Cyber-Industrial"), the current UI suffers from **four systemic issues**:
1. **Severe Chrome & Telemetry Duplication:** On desktop (`lg+`), non-chat pages stack **3 horizontal bars** (`TopBar` + `TickerTape` + `MarketSessionBar` = 100px) right next to a `DesktopSidebar` that already renders the Kestrel brand lockup, a static 4-Desk mini-HUD, a duplicate live session/XAUUSD widget, and a fake `LIVE // 24ms` badge. On `/dashboard`, the user sees **4 separate market-session indicators** and **3 separate 4-Desk Committee launchers** on the same screen.
2. **Multi-Era Brand & Color Drift:** **18 component files** use non-token Tailwind palette classes (`cyan-400/500`, `emerald-400/500`, `rose-400/500`, `amber-400/500`, `sky-400/500`) and **58 files** use hardcoded hex values—including leftover metallic gold/cream (`#D4AF37` / `#F4F1EA` in `layout-presets-bar.tsx`), blue-black (`#0b0c0f` in `desktop-sidebar`, `mobile-bottom-nav`, `nav-drawer`), Slate (`#0f172a` / `#1e293b` in `performance-chart.tsx`), and stark white-on-black Phase-1 buttons (`bg-fg text-black rounded-sm`).
3. **Broken Navigation & State Loops:**
   - On `/chat`, an unconditional `useEffect` in `chat-screen.tsx` (lines 81–93) re-opens `ThreadViewsDock` whenever `splitMode` becomes `false` on `>=1280px` viewports—making it **impossible to close the right-hand sidecar** once a thread has a message or is in Full Committee mode.
   - In the sidebar, `"Market"` points to `/news` (`match: ['/news', '/calendar']`), yet neither `/news` nor `/calendar` has an in-page tab or link to switch to the other.
   - In `/settings`, `/settings/api-keys`, `/settings/models`, and `/settings/agent` redirect non-admins away (`if (!isAdmin) redirect('/settings')`) and are missing from the left `SettingsNav` (`BASE_NAV_GROUPS`), locking users out of BYOK key setup and personal AI preferences while duplicating `/admin?tab=platform`.
4. **Dead, Unmounted & Fake UI Elements:** **13 component files** (plus subfiles) are completely unmounted or only referenced in unit tests (`hanging-pendant`, `usage-limits-form.tsx`, `wizard-step-provider.tsx`, `composer-action-chips.tsx`, `alert-card.tsx`, `spotlight-card.tsx`, `pin-to-chat.tsx`, `price-tag.tsx`, `system-status-card/*`), and `AppearanceCard` renders an 8-language selector (`中文`, `العربية`, etc.) when the app has zero i18n translation dictionaries.

| Audit Dimension | Current Score | Post-Roadmap Target | Primary Strengths | Primary Frontend Bottlenecks |
| :--- | :---: | :---: | :--- | :--- |
| **1. Brand & Hoplite Token Fidelity** | **6.2 / 10 (C+)** | **9.7 / 10 (A+)** | Strong Hoplite token definitions in `globals.css` (`surface-panel`, `surface-chip`, `surface-well`, Funnel + Redaction + Geist Mono). | `tokens.ts` disagrees with `globals.css` & `docs/design-system.md`; 18 files use `cyan`/`emerald`/`rose`/`amber`; `layout-presets-bar.tsx` uses `#D4AF37` gold; sidebar uses `#0b0c0f` blue-black; Phase-1 `bg-fg text-black rounded-sm` buttons remain across 9 pages. |
| **2. Global Shell & Chrome Discipline** | **5.9 / 10 (C)** | **9.6 / 10 (A+)** | Responsive safe-area handling (`pt-safe`, `pb-safe`, `px-safe`), smooth `layoutId` active pills, and `⌘K` Command Palette. | Redundant desktop `TopBar` repeats logo next to `DesktopSidebar`; `TickerTape` + `MarketSessionBar` run on every page (even `/settings` & `/admin`); `SidebarTelemetry` has `bid >= ask` bug (always red); `TickerTape` calculates tick-to-tick % instead of 24h %; fake `24ms` badge. |
| **3. Information Architecture & Deduplication** | **6.1 / 10 (C+)** | **9.5 / 10 (A)** | Clear 5-pillar primary nav (`Research`, `Overview`, `Journal`, `Market`, `Alerts`) + dynamic plugin slots. | `/dashboard` duplicates Session, Open Risk, and 4-Desk cards across `MissionControlDeck` + `TodayGlanceWidget` + `QuantDeskWidget`; `/journal` has two stacked page headers; `/news` and `/calendar` have no cross-navigation; `/admin` crams 16 flat tabs into one overflowing bar. |
| **4. Visual Hierarchy & Surface Craft** | **7.4 / 10 (B)** | **9.6 / 10 (A+)** | Landing page neoclassical artwork, tactile keycaps, and deliberation cards have strong visual presence. | `StatCard` renders an empty `h-6` (24px) dead void whenever `sparkline` is omitted; `EquityCurveWidget` nests `PerformanceChart` (`surface-panel` inside `Card`) with two headers and two Net-R badges; `HeroTelemetryRig` is overcrowded (~760px tall). |
| **5. Interaction UX & State Flows** | **6.9 / 10 (C+)** | **9.6 / 10 (A+)** | Optimistic mutations on alerts/watchlist, virtualized lists (`@tanstack/react-virtual`), and URL-synced filters (`nuqs`). | Unclosable `ThreadViewsDock` on `>=1280px` in `/chat`; duplicate error banners & duplicate mode toggles in `/chat`; `MissionControlDeck` links to invalid `?mode=council`; `AppearanceCard` has a non-functional 8-language dropdown; `PaperTradingPage` buries the order form mid-page. |
| **6. Accessibility & Touch Ergonomics** | **7.5 / 10 (B)** | **9.5 / 10 (A)** | `SkipToContent`, `StreamingLiveRegion`, `prefers-reduced-motion` support, and iOS 16px input zoom prevention. | `Button` `md` size is `h-10` (40px, despite comment claiming 48px `h-12`); `CommandPalette` touch FAB (`bottom-24 right-4`) collides with `/chat` composer & scroll FAB; `CustomAgents` modals lack `Escape` key & focus trap; `ThreadViewsDock` is inaccessible on `<1024px`. |
| **7. Frontend Code & Component Hygiene** | **7.4 / 10 (B)** | **9.6 / 10 (A+)** | Clean component/hook splitting across most features; almost all `.tsx` files are under 250 LOC. | 13 dead/unmounted component files (`hanging-pendant`, `usage-limits-form`, `wizard-step-provider`, etc.), 6 duplicate re-export shims in `src/components/`, and double translate hacks (`.tactile-press` + `active:translate-y-[0.5px]`). |
| **OVERALL FRONTEND RATING** | **6.8 / 10 (C+)** | **9.6 / 10 (A+)** | **Distinctive Hoplite art direction and capable trading primitives.** | **Consolidating redundant chrome, fixing state/routing bugs, and enforcing Hoplite tokens across all 28 screens will elevate Kestrel to an institutional-grade terminal.** |

---

## 2. Master Page-by-Page Rating Matrix

| # | Route / Screen | Visual Polish | Brand Fidelity | UX & Layout | Signal-to-Noise | Overall Page Rating | Key Bottleneck Summary |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **0** | **Global App Shell** (`(app)/layout.tsx`) | 6.5 | 5.8 | 5.5 | 5.0 | **5.7 / 10** | `#0b0c0f` blue-black sidebar; redundant desktop `TopBar`; `TickerTape` + `MarketSessionBar` on all routes; `bid >= ask` bug; fake `24ms` label; static `SidebarDeskHud`. |
| **1** | **Public Landing** (`/` & `/landing`) | 8.2 | 8.5 | 7.2 | 6.8 | **7.7 / 10** | Copy pitches obsolete "hosted subscription, zero API keys" (`DEC-01` violation); `/landing` missing `<MotionRoot>`; overcrowded `HeroTelemetryRig`; 6 different section bg hexes; mobile 3D stack scroll trap. |
| **2** | **Public Share Snapshot** (`/share/[id]`) | 5.0 | 4.5 | 6.0 | 7.5 | **5.8 / 10** | Legacy Phase-1 look (`rounded-sm`, raw `<img>` logo instead of `KestrelBrand`, distorted `preserveAspectRatio="none"` SVG price lines, no CTA to open Kestrel). |
| **3** | **System Pages** (`/offline`, `not-found.tsx`, `global-error.tsx`) | 6.0 | 5.5 | 7.0 | 8.0 | **6.6 / 10** | `not-found.tsx` uses `bg-bg-elev-1` + stark white `bg-fg text-black rounded-sm` button; `global-error.tsx` uses legacy `#F56E0F` orange and `#0A0A0A`. |
| **4** | **Auth Suite** (`/login`, `/register`, `/forgot-password`, `/reset-password`) | 7.6 | 8.0 | 7.0 | 8.2 | **7.7 / 10** | No route-specific card heading (`<h2>Sign In</h2>` vs `<h2>Create Account</h2>`—all show identical header); Confirm Password uses raw `<Input>` without eye toggle. |
| **5** | **Onboarding Wizard** (`/onboarding`) | 7.2 | 7.0 | 6.5 | 7.8 | **7.1 / 10** | `wizard-step-provider.tsx` (BYOK setup) is completely unmounted; completed step circles use stark white `bg-fg text-black`; page title misses `font-display`. |
| **6** | **Research & Chat Cockpit** (`/chat`, `/chat/[threadId]`) | 7.8 | 7.6 | 5.8 | 6.2 | **6.9 / 10** | **Critical bug:** `ThreadViewsDock` cannot be closed on `>=1280px`; duplicate error banners; duplicate Analysis Mode toggles + fake `GATE/LEDGER` strip in `Composer`; 4 dock tabs overflow `420px` width; no mobile access to dock. |
| **7** | **Overview / Dashboard** (`/dashboard`) | 6.8 | 6.0 | 5.5 | 4.8 | **5.8 / 10** | **Severe duplication:** `MissionControlDeck` + `TodayGlanceWidget` + `QuantDeskWidget` repeat Session, Open Risk, and 4 Desks; invalid `?mode=council` link; `#D4AF37` gold in `LayoutPresetsBar`; double header in `EquityCurveWidget`; broken `PnLHeatmapWidget` legend. |
| **8** | **Trade Journal** (`/journal`) | 7.0 | 6.5 | 6.5 | 6.2 | **6.6 / 10** | Double page header (`<PageHeader title="Journal">` + `<JournalHeader title="Trading Journal">`); stark white `Log Trade` button; `EntryList` duplicated across `Overview` & `Trades` tabs; `AiReviewPanel` locked to only latest closed trade. |
| **9** | **Market News** (`/news`) | 6.8 | 6.2 | 6.4 | 7.2 | **6.7 / 10** | Sidebar says `"Market"`, page says `"News"` with **no link/tab to `/calendar`**; legacy `rounded-sm` cards; stark white active filter pills (`bg-fg text-black`); overlapping SVG arcs in `SentimentGauge`. |
| **10** | **Economic Calendar** (`/calendar`) | 7.5 | 7.2 | 6.6 | 7.5 | **7.2 / 10** | **No link/tab back to `/news`** despite sharing the `"Market"` sidebar item; stark white active filter pills (`bg-fg text-black`); sticky section headers (`top: var(--topbar-h)`) collide with `TickerTape`/`MarketSessionBar`. |
| **11** | **Pro Chart** (`/chart`, `/chart/[symbol]`) | 7.8 | 7.8 | 7.2 | 8.0 | **7.7 / 10** | Unreachable from primary sidebar/mobile nav unless via Watchlist or `⌘K`; no `<PageHeader />` or `<MarketSubNav />`; hardcoded `DEFAULT_WATCHLIST_SYMBOLS` instead of user's saved watchlist. |
| **12** | **Price & Indicator Alerts** (`/alerts`) | 7.6 | 7.5 | 7.6 | 8.0 | **7.7 / 10** | `AlertRow` renders `IconArrowRight` for legacy `'telegram'` channel alongside `IconBrandTelegram` for `'telegram-bot'`; `NewAlertDrawer` uses `font-black` title. |
| **13** | **Settings Overview** (`/settings`) | 7.4 | 7.5 | 6.5 | 7.2 | **7.2 / 10** | Metadata still mentions `"subscription"`; hides `AI & Models` / `API Keys` / `Agent` under an `isAdmin`-only section at the bottom, locking out non-admin BYOK users. |
| **14** | **Plugin Store** (`/settings/plugins`) | 8.0 | 8.2 | 8.0 | 8.2 | **8.1 / 10** | Cleanest settings page; minor polish needed on setup wizard drawer step indicators and consistent button sizes. |
| **15** | **Watchlist Symbols** (`/settings/symbols`) | 6.8 | 5.8 | 7.4 | 7.5 | **6.9 / 10** | `sortable-symbol-row.tsx` and `catalog-section.tsx` use `cyan-400`/`cyan-500` instead of Hoplite `--color-brand`. |
| **16** | **Notifications & Telegram** (`/settings/notifications`) | 7.2 | 7.4 | 6.5 | 7.0 | **7.0 / 10** | Renders legacy `env.TELEGRAM_CHAT_ID` status and `/api/admin/test-telegram` button instead of linking to `@kestrel/plugin-telegram-bot` (`/plugins/telegram-bot`). |
| **17** | **Profile & Security** (`/settings/profile`) | 7.5 | 7.5 | 7.6 | 7.8 | **7.6 / 10** | `sessions-card.tsx` has 5 `useState` hooks; mixed border radii (`rounded-sm` vs `rounded-xl`) across security sub-cards. |
| **18** | **Appearance & Data** (`/settings/appearance`) | 6.5 | 5.5 | 5.8 | 6.5 | **6.1 / 10** | **Fake Locale dropdown** (8 languages that do nothing because no i18n exists); uses `text-cyan-400`, `focus:ring-cyan-500/20`, and `text-amber-400`. |
| **19** | **Install App** (`/settings/install`) | 7.2 | 7.0 | 7.8 | 8.0 | **7.5 / 10** | Bottom info card uses legacy `rounded-sm border-border bg-bg-elev-1` while top card uses `surface-panel rounded-xl`. |
| **20** | **Activity & Quota** (`/settings/usage`) | 6.8 | 6.5 | 6.0 | 7.2 | **6.6 / 10** | `<UsageLimitsForm />` (215 LOC in `_components/usage-limits-form.tsx`) is **completely unmounted**, so users cannot set their monthly/provider spend caps; empty state uses `bg-fg text-black rounded-sm`. |
| **21** | **API Keys, Models & Agent** (`/settings/api-keys`, `/models`, `/agent`) | 7.2 | 7.2 | 5.2 | 6.5 | **6.5 / 10** | **Locked to `isAdmin`**, blocking BYOK users; missing from left `SettingsNav`; `/settings/agent` mixes raw 24h `chat_tool_telemetry` DB rows with personal `Custom Instructions` and `AnalysisModeForm`. |
| **22** | **Backtesting Lab Plugin** (`/plugins/backtesting`, `/runs/[id]`) | 7.5 | 7.0 | 7.6 | 7.8 | **7.5 / 10** | `EquityChart` uses hardcoded `#22c55e`/`#ef4444`/`#8b93a1`; `RunDetailPage` uses raw `<a href>` causing full page reload; custom tab bar styling. |
| **23** | **Paper Trading Plugin** (`/plugins/paper-trading`) | 7.0 | 7.4 | 5.8 | 6.0 | **6.6 / 10** | **Single long vertical dump** of 7 sections (`AccountSummary` → `Accounts` → `Deployed strategies` → `PlaceOrderForm` → `Open positions` → `Pending orders` → `Recent closes` & `Ledger`) instead of a 2-column execution desk. |
| **24** | **Custom Agents Plugin** (`/plugins/custom-agents`) | 7.2 | 6.5 | 7.0 | 7.6 | **7.1 / 10** | `AgentEditor` and `AgentRunsDialog` use raw modal divs without `Escape` key or focus trap, and `bg-fg text-black h-8` buttons instead of Hoplite `Button`. |
| **25** | **Telegram Copilot Plugin** (`/plugins/telegram-bot`) | 7.6 | 7.8 | 7.5 | 8.0 | **7.7 / 10** | Raw `<a href="/settings/plugins">` tags trigger full page reloads; `status-panel.tsx` (225 LOC) can be tightened. |
| **26** | **Admin Control Plane** (`/admin` — 16 tabs) | 6.8 | 6.8 | 5.4 | 5.8 | **6.2 / 10** | **16 flat tabs in one `.no-scrollbar` row** overflow off-screen with zero visual cue; `/admin?tab=platform` duplicates `/settings/api-keys`, `/models`, and `/agent`. |

---

## 3. Deep Analysis & Visual Blueprints Page by Page

### 3.0 Global App Shell & Navigation (`apps/web/src/app/(app)/layout.tsx`)

#### Current Visual Structure (Problems Highlighted)
```
┌──────────────────────┬────────────────────────────────────────────────────────────────────┐
│ DESKTOP SIDEBAR      │ TOP BAR (h-12, 48px) — Shown on Desktop too!                       │
│ bg-[#0b0c0f] (BLUE!) │ [Kestrel Logo -> /chat]                           [Empty Right]    │
│ [Kestrel -> /dash]   ├────────────────────────────────────────────────────────────────────┤
│                      │ TICKER TAPE (h-7, 28px) — Tick-to-tick % bug (+0.00%)              │
│ [+ NEW THESIS  ⌘N]   ├────────────────────────────────────────────────────────────────────┤
│                      │ MARKET SESSION BAR (h-6, 24px) — 1s interval on ALL pages          │
│ // NAVIGATION        │ [14:22:09 UTC] | [ASIA] [LON] [NY] | [OVERLAP KILLZONE]            │
│ 01 Research     ⌘1   ├────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ │                                                                    │
│ │ AI COMMITTEE     │ │ MAIN PAGE CONTENT (<AppShellMain>)                                 │
│ │ [Macro]  [Tech]  │ │ (Pushed down by 100px of stacked top bars!)                        │
│ │ [Risk]   [Flow]  │ │                                                                    │
│ └──────────────────┘ │                                                                    │
│ 02 Overview     ⌘2   │                                                                    │
│ 03 Journal      ⌘3   │                                                                    │
│ 04 Market       ⌘4   │                                                                    │
│ 05 Alerts       ⌘5   │                                                                    │
│                      │                                                                    │
│ PLUGINS (no //)      │                                                                    │
│    Backtesting       │                                                                    │
│    Paper Trading     │                                                                    │
│                      │                                                                    │
│ ┌──────────────────┐ │                                                                    │
│ │ NY // LON OVERLAP│ │ <-- Duplicates MarketSessionBar!                                   │
│ │ XAU/USD $2734.50 │ │ <-- Bug: `tick.bid >= tick.ask` is ALWAYS false (always red)!      │
│ └──────────────────┘ │                                                                    │
│ // OPERATOR STATION  │                                                                    │
│ ● LIVE // 24ms       │ <-- Fake hardcoded "24ms" string!                                  │
│ ⚙ Settings      ⌘,   │                                                                    │
│ [T] Trader [BYOK]    │                                                                    │
└──────────────────────┴────────────────────────────────────────────────────────────────────┘
```

#### Specific Flaws Found in Code
1. **Redundant Desktop `TopBar` (`apps/web/src/components/layout/top-bar.tsx`):**
   - `TopBar` only returns `null` when `isChat` is true. On all other routes (`/dashboard`, `/journal`, `/news`, `/calendar`, `/alerts`, `/settings/*`, `/admin`, `/plugins/*`), it renders a 48px header on desktop (`lg+`) that displays `<KestrelBrand href="/chat" label="Kestrel" />` right next to `DesktopSidebar` (which displays `<KestrelBrand href="/dashboard" />`). Even worse, the two logos link to different routes (`/dashboard` vs `/chat`), and `AppLayout` passes neither `title` nor `right` to `<TopBar />`.
   - **Fix:** Hide `TopBar` on desktop (`lg:hidden`) so `TopBar` serves purely as the mobile/tablet top app bar (`<1024px`).
2. **Triple-Stacked Ambient Telemetry (`TickerTape` + `MarketSessionBar` + `SidebarTelemetry`):**
   - `AmbientTelemetry` (`apps/web/src/components/ui/segmented/ambient-telemetry.tsx`) renders `TickerTape` (28px) + `MarketSessionBar` (24px) on every non-chat route—even `/settings/profile`, `/settings/security`, and `/admin`!
   - `MarketSessionBar` (`market-session-bar.tsx` line 65) runs a `1000ms` `setInterval` to render seconds (`14:22:09 UTC`), triggering React state updates every second while duplicating `SidebarTelemetry` in the left sidebar.
   - `TickerTape` (`ticker-tape.tsx` lines 51–67) stores the immediately preceding WebSocket/poll tick in `prevPricesRef`, so `pctChange(prev, t.mid)` displays the micro-tick delta (`+0.00%` or `-0.01%`) rather than the session/24h move, and flashes green/red badges with `ring-1`.
   - `SidebarTelemetry` (`sidebar-telemetry.tsx` line 61) computes `const isBull = tick ? tick.bid >= (tick.ask || tick.mid) : true;`. Because `bid` is always less than `ask` (by the bid-ask spread), `isBull` is **always `false`** whenever live data arrives, permanently coloring XAU/USD bearish red (`text-bear`), and falls back to a hardcoded `'2734.50'` string when loading!
3. **Decorative Clutter & Fake Telemetry in `DesktopSidebar` & `NavDrawer`:**
   - `SidebarDeskHud` (`sidebar-desk-hud.tsx`) renders a static 2×2 grid of non-interactive `div`s (`Macro`, `Tech`, `Risk`, `Flow`) under `01 Research` in the expanded sidebar, consuming 76px of vertical nav height without any click action or real live status.
   - `SidebarFooter` (`sidebar-footer.tsx` line 173) and `NavDrawer` (`nav-drawer/index.tsx` line 136) hardcode `LIVE // 24ms` with a neon green `rgba(0,230,118,0.8)` glow.
   - `DesktopSidebar` (`index.tsx` line 93), `MobileBottomNav` (`mobile-bottom-nav.tsx` line 47), and `NavDrawer` (`nav-drawer/index.tsx` line 80) use cold blue-black `bg-[#0b0c0f]` and `bg-[#16171d]` instead of Hoplite obsidian `--color-bg` (`#121212`) and `--color-card` (`#1d1d1d`).

---

### 3.1 Page 1: Public Landing Page (`/` & `/landing`)

- **Files:** `apps/web/src/app/page.tsx`, `apps/web/src/app/landing/page.tsx`, `apps/web/src/components/landing/**`
- **What Works Well:** The Hoplite neoclassical cyber-art direction (Horus statue, Spartan council, Astrolabe simulator, Exploded 3D Isometric Stack) and `TacticalFlameButton` give Kestrel an unmistakable identity.
- **What Needs Polish & Cleanup:**
  1. **Outdated Product Copy Contradicting `DEC-01` (BYOK + Self-Hosted Sovereign AI):**
     - `HeroCopy` (`hero-copy.tsx` lines 97–100) claims `"Zero Setup / All AI & Feeds Included"`.
     - `LandingFAQ` (`landing-faq.tsx` lines 50–53 & 88) states: *"No. Kestrel is a fully hosted subscription platform—all four specialist AI desks... are included and ready the moment you sign in."*
     - `LandingFooter` (`landing-footer.tsx` line 105) says `"Hosted Cloud AI"`.
     - **Fix:** Update `HeroCopy`, `LandingFAQ`, and `LandingFooter` to accurately reflect Kestrel's **Sovereign BYOK + 1-Click Plugin Store** architecture (AES-256-GCM encrypted key vault, 4-Desk AI Committee, Paper Trading, Backtesting Lab, Custom Agent Studio, and Telegram Copilot).
  2. **Missing `<MotionRoot>` on `/landing` (`apps/web/src/app/landing/page.tsx`):**
     - `/` (`app/page.tsx`) wraps `<LandingPageView />` in `<MotionRoot>`, while `/landing` (`app/landing/page.tsx`) renders `<LandingPageView />` bare! When users navigate to `/landing` (e.g. clicking "Back to Kestrel" from `/login`), `m.*` components inside `LandingPageView` run outside `LazyMotion`.
  3. **Overcrowded Right Hero Column (`hero-telemetry-rig.tsx`):**
     - Stacking the Symbol Switcher + Price Well + 220px 3D WebGL Hologram (`Landing3DHologram`) + 4 Hardware Specialist Desk tiles + Committee Trade Plan inside one card makes the right column ~760px tall vs ~440px on the left, cramping the 4 desk labels (`max-w-[64px] truncate text-[9px]`). Compacting the 4 desk tiles into a sleek 2×2 or inline status strip restores hero balance.
  4. **Mobile Scroll Trap in `LandingArchitecture` (`landing-architecture/index.tsx` lines 70–114):**
     - On `<1024px`, the 4 Layer Selector Tabs are at the top, followed by a 480px-tall 3D Isometric Stack in the middle, and `ArchitectureTelemetryConsole` at the bottom. Tapping a tab on mobile updates the console 500px below the fold! Reorder on mobile (`order-2` / `order-3`) so the active layer's Telemetry Console sits immediately below the selector tabs.
  5. **Fragmented Section Background Hexes:**
     - Replace arbitrary section backgrounds (`#101112`, `#0d0e0f`, `#0c0d0e`, `#0e0f10`, `#0d0d0d`, `#0a0a0a`) and non-token Tailwind colors in `landing-stepper/briefing-panel.tsx` (`bg-emerald-500`, `bg-amber-500`, `bg-red-500`) with canonical Hoplite surface and semantic tokens.

---

### 3.2 Page 2: Public Share Snapshot (`/share/[id]`) & System Pages (`/offline`, `not-found.tsx`, `global-error.tsx`)

- **Files:** `apps/web/src/app/share/[id]/page.tsx`, `apps/web/src/app/offline/page.tsx`, `apps/web/src/app/not-found.tsx`, `apps/web/src/app/global-error.tsx`
- **What Needs Polish & Cleanup:**
  1. **`/share/[id]` (`share/[id]/page.tsx`) Looks Unfinished:**
     - Uses raw `<Image src="/brand/kestrel-logo.png" width={64} height={43} />` instead of `<KestrelBrand variant="lockup" />`.
     - Uses `bg-bg-elev-1` as the full-screen background, `rounded-sm` flat boxes, and an inline SVG with `viewBox="0 0 100 48" preserveAspectRatio="none"` that distorts stroke widths and uses percentage `y1={`${y}%`}` coordinates.
     - Missing a header CTA (`"Launch Kestrel Terminal →"`) for viral conversion when traders share snapshots.
  2. **`not-found.tsx` & `global-error.tsx`:**
     - `not-found.tsx` uses `bg-bg-elev-1` and a stark white `bg-fg text-black rounded-sm` link instead of Hoplite `<Button variant="primary">`.
     - `global-error.tsx` hardcodes `#0A0A0A`, `#F0F0F0`, and legacy orange `#F56E0F` instead of `#121212`, `#E5E5E5`, and `#FF3616`.

---

### 3.3 Page 3: Authentication Suite (`/login`, `/register`, `/forgot-password`, `/reset-password`)

- **Files:** `apps/web/src/app/(auth)/layout.tsx`, `login/page.tsx`, `login/login-form.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/reset-password-form.tsx`
- **What Needs Polish & Cleanup:**
  1. **Missing Card Headings Across Auth Screens:**
     - `(auth)/layout.tsx` renders the same top header (`"The AI committee for gold & forex"`) on all 4 auth routes, and none of `/login`, `/register`, `/forgot-password`, or `/reset-password` render a form title (`<h2>Sign in to Kestrel</h2>`, `<h2>Create your account</h2>`, `<h2>Reset your password</h2>`). Switching between `/login` and `/register` or `/forgot-password` gives no immediate visual heading cue.
  2. **Inconsistent Password Fields in `/register` & `/reset-password`:**
     - `Password` uses `<PasswordField />` (which includes a Show/Hide eye toggle and strength meter), while `Confirm Password` immediately below it uses a raw `<Input type="password" />` with no Show/Hide toggle.

---

### 3.4 Page 4: Onboarding Wizard (`/onboarding`)

- **Files:** `apps/web/src/app/onboarding/page.tsx`, `apps/web/src/components/onboarding/wizard/index.tsx`, `wizard-panels.tsx`, `_components/wizard-stepper.tsx`, `_components/wizard-step-provider.tsx`
- **What Needs Polish & Cleanup:**
  1. **Orphaned BYOK Provider Setup Step (`wizard-step-provider.tsx`):**
     - `wizard-step-provider.tsx` (196 LOC) is a complete BYOK provider key setup step, and `OnboardingWizardProps` still declares `providers?: ProviderMeta[]`, but `wizard-panels.tsx` only mounts 4 steps (`Profile`, `Trading Style`, `Watchlist`, `Review`). Either integrate optional BYOK key setup into the wizard or delete the dead `wizard-step-provider.tsx` file and add a clear post-onboarding CTA card pointing to `/settings/api-keys`.
  2. **Visual & Typographic Inconsistencies:**
     - `onboarding/page.tsx` line 64 uses `text-2xl font-bold tracking-tight` instead of `font-display font-normal tracking-[-0.03em]`.
     - `wizard-stepper.tsx` line 53 styles completed step circles as stark white (`bg-fg text-black`) and connector lines as `bg-fg`, clashing with the Hoplite `bg-bull/15 text-bull border border-bull/30` completed state.

---

### 3.5 Page 5: Research & AI Committee Cockpit (`/chat` & `/chat/[threadId]`)

- **Files:** `apps/web/src/components/chat/**`

#### Current vs. Target Layout Visualization
```
CURRENT /chat (Broken Sidecar Loop + Duplicate Controls & Banners)
┌─────────────────────────────────────────────┬──────────────────────────────────────────┐
│ CHAT TOP BAR: [Thread] [Pin]  [Chart&Desks] │ THREAD VIEWS DOCK (lg:w-[420px])         │
├─────────────────────────────────────────────┤ [CHART][COUNCIL OPINIONS][EXECUTION PLAN]│
│                                             │ [CONTEXT] [X] <-- Overflows 420px width! │
│  Message Stream / Empty State               │ (BUG: Clicking [X] on >=1280px triggers  │
│                                             │  useEffect in chat-screen.tsx that       │
│  [Dismissible Error Banner #1 (danger)]     │  IMMEDIATELY re-opens the dock!)         │
├─────────────────────────────────────────────┤                                          │
│  [Non-Dismissible Error Banner #2 (rose!)]  │  "CONTEXT" tab is just 4 lines of text   │
│ ┌─────────────────────────────────────────┐ │  repeating Symbol + Timeframe!           │
│ │ [● SCOPE: SINGLE DESK]  GATE:.. LEDGER:.│ │                                          │
│ │ Ask about XAUUSD...                     │ │                                          │
│ │ [📎][🎤][● Quick Read][Model][@Agent][↑]│ │ <-- 2nd Mode Toggle in same box!         │
│ └─────────────────────────────────────────┘ └──────────────────────────────────────────┘

TARGET /chat (Clean Hoplite Cockpit)
┌─────────────────────────────────────────────┬──────────────────────────────────────────┐
│ CHAT TOP BAR: [Thread] [Pin]  [Chart&Desks] │ THREAD VIEWS DOCK (User-Controllable!)   │
├─────────────────────────────────────────────┤ [Chart] [Council (4)] [Action Plan]  [X] │
│                                             ├──────────────────────────────────────────┤
│  Message Stream / Council Empty State       │  Subheader: XAUUSD · [5M|15M|1H|4H|1D] ↗ │
│                                             │  Live TradingView Pro Chart / Opinions   │
│  [Single Unified Dismissible Error Banner]  │                                          │
├─────────────────────────────────────────────┤                                          │
│ ┌─────────────────────────────────────────┐ │                                          │
│ │ Ask about XAUUSD...                     │ │                                          │
│ │ [📎][🎤][● Quick Read][Model][@Agent][↑]│ │ <-- Single clean toolbar row!            │
│ └─────────────────────────────────────────┘ └──────────────────────────────────────────┘
```

#### Specific Flaws Found in Code
1. **CRITICAL BUG — Unclosable `ThreadViewsDock` on `>=1280px` (`chat-screen.tsx` lines 81–93):**
   - `useEffect` depends on `[session.messages.length, session.agentProgress, toolbar.analysisMode, splitMode, setSplitMode]`. Whenever the user clicks Close (`setSplitMode(false)`), `splitMode` flips to `false`, re-running the effect which sees `session.messages.length > 0` and immediately calls `setSplitMode(true)`!
   - **Fix:** Track a `hasAutoOpenedRef = useRef(false)` (or only auto-open once on initial mount / when `agentProgress` transitions from `null` to active) and remove `splitMode` from the auto-open trigger so the user's manual close is respected.
2. **Duplicate Error Banners (`chat-thread-view.tsx` line 137 + `chat-composer-dock.tsx` line 63):**
   - When `session.error` is set, `ChatThreadView` renders a dismissible error banner with Retry + Dismiss (`X`), AND `ChatComposerDock` renders `<ChatErrorBanner error={error} />` (using `border-rose-500/30 bg-rose-500/10 text-rose-400`!) right below it.
   - **Fix:** Remove `<ChatErrorBanner />` from `ChatComposerDock` and keep the single dismissible Hoplite error banner with Retry.
3. **Duplicate Analysis Mode Toggle & Fake Decorative Strip Inside `Composer` (`composer.tsx` lines 115–149 + `composer-controls.tsx` lines 116–142):**
   - `composer.tsx` renders a top "Scope Boundary Strip" containing a mode toggle button (`SCOPE: FULL COUNCIL (4 DESKS)` / `SCOPE: SINGLE DESK`) plus static text `GATE: HUMAN-APPROVAL ENFORCED` and `LEDGER: FULL TRACE`.
   - `composer-controls.tsx` renders a second mode toggle button (`Quick Read` / `Full Committee`) at the bottom of the same form.
   - **Fix:** Remove the top "Scope Boundary Strip" from `composer.tsx` so the textarea sits cleanly at the top of the composer card and the single mode toggle lives in `ComposerControls`.
4. **Overflowing 4-Tab Bar & Redundant `CONTEXT` Tab in `ThreadViewsDock` (`thread-views-dock/index.tsx`):**
   - Four verbose uppercase tabs (`CHART`, `COUNCIL OPINIONS`, `EXECUTION PLAN`, `CONTEXT`) plus the Close `X` button overflow `lg:w-[420px]`.
   - `DockContextPanel` (`dock-context-panel.tsx`) only displays 4 lines (`Active Symbol`, `Chart Timeframe`, `Analysis Mode`, and an `Open full-screen Pro Chart` link).
   - **Fix:** Merge the full-screen Pro Chart link into `DockChartPanel`'s header, delete the redundant `terminal` (`CONTEXT`) tab, and shorten the 3 remaining tab labels to `Chart`, `Council`, and `Plan`.

---

### 3.6 Page 6: Overview / Dashboard (`/dashboard`)

- **Files:** `apps/web/src/app/(app)/dashboard/**`

#### Current vs. Target Layout Visualization
```
CURRENT /dashboard (Triple-Stacked Redundancy & Mixed Theme Eras)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. MISSION CONTROL DECK (`mission-control-deck.tsx`)                                   │
│    • Banner: "The Council of Four Strategists" -> [Convene Full Council (?mode=council)]│
│    • 4-Col Telemetry: [Market Regime (emerald!)] [4/4 Desks (#7DD3FC!)]                │
│                       [Active Trades (#F87171!)] [Alerts Live]                         │
│    • 4-Col Strategist Cards: [DESK-I] [DESK-II] [DESK-III] [DESK-IV]                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. HEADER: <h1>Dashboard Canvas</h1>   [+ Add] [Reset] [Customize Layout]              │
│    • LayoutPresetsBar (When editing): Uses #D4AF37 GOLD & #F4F1EA CREAM!               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. WIDGET #1: TODAY GLANCE (`today-glance-widget.tsx`, span 3)                         │
│    • [Next Event] [Session (DUPLICATE!)] [Open Risk (DUPLICATE + Math Bug!)] [AI Nudge]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. WIDGETS: [AI Briefing] [Watchlist] [Calendar] [News Pulse] [Alerts]                 │
│    • Optional [QuantDeskWidget]: Renders a 3RD 4-Desk Committee card!                  │
│    • Optional [EquityCurveWidget]: Nests PerformanceChart with 2 headers & 2 R-badges! │
│    • Optional [PnLHeatmapWidget]: Legend puts Green on "Less" and Red on "More"!       │
└────────────────────────────────────────────────────────────────────────────────────────┘

TARGET /dashboard (Single Cohesive Hoplite Command Overview)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PAGE HEADER: Overview                                                                  │
│ [Pre-Session Checklist] [Log Trade] [Customize Layout] [Convene 4-Desk Council ->]     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ COMPACT 4-DESK COMMAND STRIP (Collapsible or sleek 4-pill bar, zero duplicate metrics) │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TODAY AT A GLANCE (4 Hoplite Chips: Next Catalyst | Active Session | Open Risk | Bias) │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CUSTOMIZABLE WIDGET GRID (Briefing, Watchlist, Calendar, News Pulse, Alerts, Equity)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Specific Flaws Found in Code
1. **Triple Duplication Between `MissionControlDeck`, `TodayGlanceWidget`, and `QuantDeskWidget`:**
   - `MissionControlDeck` (`mission-control-deck.tsx`) renders a 4-column telemetry strip (`Market Regime`, `Council Status`, `Risk Governor`, `Telemetry Pulse`) AND 4 large `StrategistDeskCard`s.
   - Immediately below it, `TodayGlanceWidget` (`today-glance-widget.tsx`) renders another 4-column strip repeating `Session` and `Open risk`!
   - And in `TodayGlanceWidget` (`today-glance-widget.tsx` line 143), `const totalRRounded = Math.round(open.length * 10) / 10;` prints `{open.length} positions · {totalRRounded}R at risk`—assuming every open trade is 1R!
   - Furthermore, `MissionControlDeck` line 99 links to `/chat?mode=council`, which is not a valid `AnalysisMode` (`'single' | 'full'`), so `/chat` ignores it instead of activating Full Committee mode (`?mode=full`)!
2. **Heading Hierarchy & Copy Mismatch (`dashboard-canvas/index.tsx` line 106):**
   - Sidebar calls the route **Overview**, `MissionControlDeck` renders an `<h2>` at the top, and `DashboardCanvas` renders `<h1>Dashboard Canvas</h1>` halfway down the page.
3. **Orphaned Gold/Cream Palette in `LayoutPresetsBar` (`layout-presets-bar.tsx`):**
   - Uses `#D4AF37` (Metallic Gold), `#F4F1EA` (Cream), `#111114`, and `#09090B`.
   - Also in `MissionControlDeck`, badges use `emerald-500`, `#7DD3FC`, and `#F87171` instead of `--color-bull`, `--color-info`, and `--color-danger`.
4. **Card-Inside-a-Card Double Header in `EquityCurveWidget` (`equity-curve-widget.tsx` + `performance-chart.tsx`):**
   - `EquityCurveWidget` renders a `<Card>` with a `Performance` header and net-R badge, then mounts `<PerformanceChart />` inside it, which renders its own `.surface-panel` with a second `Performance Curve` header and a second `Net R-Score` badge! Adding a `bare?: boolean` prop to `PerformanceChart` fixes this cleanly.
5. **Broken Legend in `PnLHeatmapWidget` (`pnl-heatmap-widget/index.tsx` lines 90–121):**
   - Renders `Less [0.2, 0.4, 0.6, 0.85 bull] [0.85, 0.6, 0.4, 0.2 bear] More`, placing faint green at "Less", faint red at "More", and dark green/red colliding in the middle. Should be `Loss [0.85..0.2 bear] · [neutral] · [0.2..0.85 bull] Gain`.

---

### 3.7 Page 7: Trade Journal (`/journal`)

- **Files:** `apps/web/src/app/(app)/journal/**`
- **Specific Flaws Found in Code:**
  1. **Double Stacked Page Header (`journal/page.tsx` + `journal-header.tsx`):**
     - `journal/page.tsx` renders `<PageHeader title="Journal" description="Log, tag, and review your trades with integrated analytics." />`.
     - Immediately below it, `JournalView` renders `<JournalHeader />` (`journal-header.tsx`), a bordered box with `<h2>Trading Journal</h2>` and `<p>Track, analyze, and optimize your trading performance</p>` plus a stark white `bg-fg text-black rounded-sm` "Log Trade" button.
     - **Fix:** Pass the `StaleIndicator`, `Import`, `Refresh`, and Hoplite `<Button variant="primary">Log Trade</Button>` directly into `<PageHeader>`'s `children` slot and delete the redundant `<JournalHeader />` box.
  2. **Redundant `Overview` vs `Trades` Tabs (`journal-view/index.tsx` lines 113–142):**
     - The `Overview` tab renders `PerformanceChart` + the entire `EntryList` (with search, filters, and virtualized rows) on the left and `StatsSummary` on the right. The `Trades` tab renders the exact same `EntryList` again.
     - Meanwhile, `StatsSummary` (`stats-summary/index.tsx`) stacks 4 components vertically (`OutcomeDistribution`, `CoreStatCards`, `InstitutionalMetrics`, and `ExtendedStats` with `DayOfWeekChart`), which then repeats in the `Analytics` tab (`BreakdownTable title="By Day of Week"`).
     - **Fix:** Make `Overview` a clean high-level dashboard (`CoreStatCards` + `OutcomeDistribution` + `PerformanceChart` + `InstitutionalMetrics` + recent 5 trades preview with `"View all trades →"`), let `Trades` own the full searchable/filterable `EntryList`, and keep deep breakdowns + AI Coach/Review in `Analytics`.
  3. **`AiReviewPanel` Only Reviews the Single Latest Closed Trade (`journal-analytics-tab.tsx` line 22):**
     - `const latestClosed = entries.find((e) => e.outcome !== 'open');` passes only the single most recent closed trade to `<AiReviewPanel entry={latestClosed} />` with no dropdown to select any other closed trade, and `AiReviewPanel` uses legacy `rounded-sm` styling.

---

### 3.8 Pages 8, 9, 10 & 11: Market Intelligence (`/news`, `/calendar`, `/chart/[symbol]`, `/alerts`)

- **Files:** `apps/web/src/app/(app)/news/**`, `calendar/**`, `chart/**`, `alerts/**`
- **Specific Flaws Found in Code:**
  1. **Broken Navigation Between `/news`, `/calendar`, and `/chart/[symbol]`:**
     - `PRIMARY_NAV_ITEMS` (`nav-items.ts` line 69) defines a single `"Market"` item (`href: '/news'`, `match: ['/news', '/calendar']`), and `/chart` is omitted from primary navigation.
     - Yet when a user clicks `"Market"` in the sidebar, they land on `/news` with **no tab or link to `/calendar` or `/chart`**!
     - **Fix:** Create a shared `<MarketSubNav />` component rendered inside the header area of `/news`, `/calendar`, and `/chart/[symbol]` with 3 tabs: `News Wire (/news)`, `Macro Calendar (/calendar)`, and `Live Chart (/chart/XAUUSD)`.
  2. **Legacy Phase-1 Styling on `/news` & `/calendar` Toolbars:**
     - `SentimentSummary` (`news/_components/sentiment-summary.tsx`) and `ArticleCard` (`components/news/article-card.tsx`) still use `rounded-sm border-border bg-bg-elev-1` while `/calendar`'s `CalendarHero` and `EventCard` use `rounded-xl surface-chip`.
     - Both `NewsToolbar` (`news-toolbar.tsx` lines 111 & 179) and `CalendarToolbar` (`calendar-toolbar.tsx` lines 90 & 124) style active filter pills as `bg-fg text-black` (stark white) instead of Hoplite `border-brand/40 bg-brand/15 text-brand`.
     - In `SentimentGauge` (`sentiment-summary.tsx` lines 158–162), the 3 thick SVG arcs (`strokeWidth="8" strokeLinecap="round"`) have zero degree separation between segments, causing the rounded stroke caps to overlap and muddy the color transitions.
  3. **Sticky Section Header Offset Bug on `/calendar` & `/news`:**
     - `calendar-view.tsx` line 173 sets `style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}` assuming a 48px sticky `TopBar`. On desktop (where `TopBar` should be hidden or where `TickerTape` exists), sticky bucket headers either float 48px below the top edge with a gap or collide with the top bar.
  4. **Duplicate Telegram Icon in `/alerts` (`alert-row.tsx` lines 79–92):**
     - `alert.channels.includes('telegram')` renders `<IconArrowRight />` while `alert.channels.includes('telegram-bot')` renders `<IconBrandTelegram />`. Consolidate both to render a single `<IconBrandTelegram />`.

---

### 3.9 Page 12: Settings Hub & 13 Sub-Routes (`/settings/**`)

- **Files:** `apps/web/src/app/(app)/settings/**`
- **Specific Flaws Found in Code:**
  1. **Critical BYOK Lockout & Missing Sidebar Group (`/settings/api-keys`, `/settings/models`, `/settings/agent`):**
     - All three routes check `if (!isAdmin) redirect('/settings');` even though they read and write **per-user** `user_settings` (`aiApiKeys`, `chatModel`, `aiFallbackChain`, `customInstructions`, `defaultAnalysisMode`, `agentModelOverrides`).
     - Meanwhile, `BASE_NAV_GROUPS` (`settings-nav/nav-groups.ts`) omits `AI & Intelligence` completely, so visiting `/settings/api-keys`, `/settings/models`, or `/settings/agent` leaves the left `SettingsNav` with no active state!
     - And `/settings/agent/page.tsx` dumps raw 24h `chat_tool_telemetry` database rows at the top of the page above user-facing `AnalysisModeForm`, `AgentModelOverrideForm`, and `AIPrefsCard`.
     - **Fix:**
       - Add an **`AI & Models`** group to `BASE_NAV_GROUPS` in `settings-nav/nav-groups.ts` (`/settings/api-keys`, `/settings/models`, `/settings/agent`) accessible to all authenticated users for their personal BYOK keys, model routing, and custom instructions.
       - Move the operator-only 24h global `chat_tool_telemetry` list out of `/settings/agent` (it already exists in `/admin?tab=telemetry` `AdminToolTelemetryTable`!).
  2. **Unmounted `<UsageLimitsForm />` on `/settings/usage` (`settings/usage/page.tsx`):**
     - `apps/web/src/app/(app)/settings/usage/_components/usage-limits-form.tsx` (215 LOC) is implemented and connected to `updateUsageSettingsAction`, but `settings/usage/page.tsx` never renders it! Mount `<UsageLimitsForm />` on `/settings/usage` (and replace its `cyan-400`/`amber-400` classes with Hoplite tokens) so users can configure their monthly and per-provider spend guardrails.
  3. **Fake Locale Dropdown & Cyan/Amber Color Drift (`appearance-card.tsx` & `sortable-symbol-row.tsx`):**
     - Remove the non-functional 8-language `<select>` from `AppearanceCard` (or replace with a clear `English (US)` badge) so users aren't misled by a selector that translates nothing.
     - Replace `cyan-400`/`cyan-500`/`amber-400` across `appearance-card.tsx`, `data-card/index.tsx`, `preferences-card/index.tsx`, `sortable-symbol-row.tsx`, and `catalog-section.tsx` with Hoplite tokens (`text-brand`, `border-brand/40`, `focus:ring-brand/20`).
  4. **Legacy Telegram Row in `/settings/notifications` (`settings/notifications/page.tsx`):**
     - Replace the `env.TELEGRAM_CHAT_ID` check and `<TestTelegramButton />` (which calls `/api/admin/test-telegram`) with a clean row linking to `/plugins/telegram-bot` (or `/settings/plugins` if not installed).

---

### 3.10 Page 13: Plugin Host & 4 Plugin Screens (`/plugins/**`)

- **Files:** `apps/web/src/app/(app)/plugins/[pluginId]/[[...slug]]/**`, `plugins/*/src/ui/**`
- **Specific Flaws Found in Code:**
  1. **Paper Trading Page (`plugins/paper-trading/src/ui/paper-page/index.tsx`) Is a 7-Section Vertical Stack:**
     - Stacks `AccountSummary` → `Accounts` → `Deployed strategies` → `PlaceOrderForm` → `PositionsSection` → `OrdersSection` → `Recent closes` & `Execution ledger` vertically.
     - **Fix:** Restructure into a **2-column desktop trading desk** (`lg:grid-cols-12`):
       - **Left Column (`lg:col-span-8`):** `AccountSummary` + Segmented tabs (`Open Positions`, `Pending Orders`, `Deployed Strategies`, `Accounts & History`).
       - **Right Sticky Column (`lg:col-span-4`):** `PlaceOrderForm` (Order Ticket always visible above the fold).
  2. **Backtesting Lab (`plugins/backtesting/src/ui/**`):**
     - `equity-chart.tsx` hardcodes `#22c55e`, `#ef4444`, and `#8b93a1` instead of Hoplite `--color-bull` (`#3f9e3d`), `--color-bear` (`#e02c10`), and `#8a8a8a`.
     - `run-detail-page/index.tsx` line 48 uses `<a href="/plugins/backtesting">` instead of `<Link>`.
  3. **Custom Agent Studio (`plugins/custom-agents/src/ui/**`):**
     - `agent-editor.tsx` and `agent-runs-dialog.tsx` use custom `<div className="fixed inset-0...">` modals with no `Escape` key handler and style primary buttons as `bg-fg text-black h-8` instead of Hoplite `bg-brand text-white h-10`.
  4. **Telegram Copilot (`plugins/telegram-bot/src/ui/**`):**
     - Replace raw `<a href="/settings/plugins">` tags in `status-panel.tsx` and `bot-actions.tsx` with Next.js `<Link>`.

---

### 3.11 Page 14: Admin Control Plane (`/admin`)

- **Files:** `apps/web/src/app/(app)/admin/**`
- **Specific Flaws Found in Code:**
  1. **16 Flat Tabs Overflowing a Single Hidden-Scrollbar Strip (`admin-tabs.tsx` + `admin-tab-layout.tsx`):**
     - `TABS` has 16 items (`AI & Platform`, `Health`, `Users`, `Features`, `Onboarding`, `Cron`, `Telemetry`, `Traces`, `Logs`, `Audit`, `Feedback`, `Datasets`, `Regressions`, `AI Eval`, `Committee Runs`, `Dev Tools`) rendered inside `<div className="border-border no-scrollbar flex gap-1 overflow-x-auto border-b pb-3">`.
     - On a 1280px–1440px desktop viewport, the rightmost 7–8 tabs are clipped off-screen with no scrollbar and no group structure.
     - **Fix:** Organize the 16 tabs into **4 domain groups** (`Platform & Access`, `System Operations`, `Observability & Traces`, `AI Quality & Eval`) using either a 2-tier grouped navigation bar or a left vertical admin rail on `md:` viewports (matching `SettingsNav`).
  2. **Header Typography (`admin/layout.tsx` line 32):**
     - Uses `text-2xl font-bold tracking-tight` instead of `<PageHeader title="Admin Control Plane" />` (`font-display`).

---

## 4. Complete Inventory of Dead, Unmounted & Duplicate Files to Clean Up

### 4.1 Dead / Unmounted Component Files (Delete or Wire Up)

| File Path | LOC | Status | Action in Roadmap |
| :--- | :-: | :--- | :--- |
| `apps/web/src/components/layout/hanging-pendant/index.tsx` | 43 | 0 imports anywhere | **Delete** folder (`index.tsx` + `use-pendant-simulation.ts`) |
| `apps/web/src/components/layout/hanging-pendant/use-pendant-simulation.ts` | 142 | Only used by dead `hanging-pendant` | **Delete** |
| `apps/web/src/components/chat/composer-action-chips.tsx` | 96 | 0 imports anywhere | **Delete** |
| `apps/web/src/components/alerts/alert-card.tsx` | 112 | 0 imports anywhere (superseded by `alert-row.tsx`) | **Delete** |
| `apps/web/src/components/ui/spotlight-card.tsx` | 78 | 0 imports anywhere | **Delete** |
| `apps/web/src/components/chart/pin-to-chat.tsx` | 64 | 0 imports anywhere | **Delete** (and remove export from `components/chart/index.ts`) |
| `apps/web/src/components/chart/price-tag.tsx` | 52 | 0 imports anywhere | **Delete** (and remove export from `components/chart/index.ts`) |
| `apps/web/src/app/(app)/settings/_components/agent-card.tsx` | 95 | 0 imports anywhere | **Delete** |
| `apps/web/src/app/(app)/settings/_components/system-status-card/index.tsx` | 68 | 0 imports anywhere (+ `status-data.ts`, `status-rows.tsx`) | **Delete** folder |
| `apps/web/src/components/onboarding/_components/wizard-step-provider.tsx` | 196 | 0 imports anywhere | **Delete** (or wire as optional Step 4 in `wizard-panels.tsx`) |
| `apps/web/src/app/(app)/settings/usage/_components/usage-limits-form.tsx` | 215 | Unmounted on `/settings/usage` | **Mount** inside `apps/web/src/app/(app)/settings/usage/page.tsx` & restyle to Hoplite tokens |

### 4.2 Duplicate Re-Export Shims in `apps/web/src/components/`

| Shim Path | Target Canonical Path | Action in Roadmap |
| :--- | :--- | :--- |
| `apps/web/src/components/dashboard/dashboard-canvas.tsx` | `@/app/(app)/dashboard/_components/dashboard-canvas` | Repoint test imports & **delete** shim |
| `apps/web/src/components/dashboard/widgets/pnl-heatmap-widget.tsx` | `@/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget` | Repoint test imports & **delete** shim |
| `apps/web/src/components/dashboard/widgets/watchlist-widget.tsx` | `@/app/(app)/dashboard/_components/widgets/watchlist-widget` | Repoint test imports & **delete** shim |
| `apps/web/src/components/news/news-toolbar.tsx` | `@/app/(app)/news/_components/news-toolbar` | Repoint test imports & **delete** shim |
| `apps/web/src/components/settings/about-card.tsx` | `@/app/(app)/settings/_components/about-card` | Repoint test imports & **delete** shim |
| `apps/web/src/components/settings/fallback-chain-picker.tsx` | `@/app/(app)/settings/models/_components/fallback-chain-picker` | Repoint test imports & **delete** shim |
| `apps/web/src/components/settings/settings-nav.tsx` | `@/app/(app)/settings/_components/settings-nav` | Repoint test imports & **delete** shim |
