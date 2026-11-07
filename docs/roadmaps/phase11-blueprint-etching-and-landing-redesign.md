# Phase 11: Blueprint Etching, Brand Discipline & Anti-Slop Shell / Landing Redesign

> **Status:** Complete (2026-11-07)
> **Scope:** Masterpiece #4 ("Blueprint Etching" — Custom Architectural SVG Engravings with `.webp` Backups Preserved), Typographic & Surface De-Slop (`globals.css`), Unified Telemetry Ribbon (`TickerTape` + `MarketSessionBar`), Landing Page Restructuring (`components/landing/*`), and Institutional Split Auth Gateway (`app/(auth)/*`).
> **Hard Constraints (`AGENTS.md`):**
>
> - **NEVER delete or overwrite any existing `.webp` or `.png` files** in `apps/web/public/landing/` (`kestrel-horus-statue.webp`, `aegis-spartan-bust.webp`, `desks-council-strategists.webp`, `simulator-astrolabe.webp`, `stepper-colonnade.webp`, `architecture-titan.webp`, `ascii-art.webp`, `faq-halftone-columns.png`, `halftone-burst.png`). Keep every one of them intact in `apps/web/public/landing/` as permanent backup assets and fallback layers.
> - Keep every `.tsx` file `<= 450` LOC and every `.ts` file `<= 500` LOC.
> - Do not introduce purple/indigo gradients, generic SaaS glow blobs, emoji prefixes, or fake marketing telemetry. Every visual element must honor Kestrel's **Classical Antiquity × Milled Industrial Hardware** aesthetic (`#121212` obsidian ground, `#0d0e10` recessed well, `#FF3616` forge ember, `#3F9E3D` bull, `#F03E3E` bear).

---

## 1. Anti-AI-Slop Design Manifesto (Mandatory Rules for the Implementing Agent)

Before editing a single component in Phase 11–13, the implementing agent must enforce these 6 visual rules:

1. **Ban Box-Inside-a-Box Card Nesting:** Never place a `rounded-xl border border-white/10 p-4` card inside another `rounded-2xl border border-white/15 p-6` card unless the inner element is a recessed `#0a0b0c` `surface-well` instrument readout. Use `1px` exposed structural hairlines (`border-white/[0.06]` or `divide-y divide-white/[0.06]`) to separate sibling regions.
2. **Retire `Bebas Neue` Watermarks (`font-bebas`):** Remove the giant low-opacity `Bebas Neue` text blocks (`KESTREL // SOVEREIGN AI`, `KESTREL // SOVEREIGN COUNCIL`) from `landing-hero/index.tsx`, `chat-empty-state.tsx`, and `thread-views-dock/index.tsx`. Keep the `@font-face` declaration in `globals.css` only for the `LandingFooter` monumental wordmark, or replace with `Funnel Display` tracked out.
3. **Strict 3-Font Operational Hierarchy:**
   - `Funnel Display` (`font-display`): Section titles, page headers, and numerical hero anchors.
   - `Funnel Sans` (`font-sans`): Body prose, navigation rows, and form labels.
   - `Geist Mono` (`font-mono tabular-nums`): Prices, spreads, percentages, timestamps, desk codes (`DESK-I // HORUS`), and keyboard shortcuts.
   - `Redaction 35 Italic` (`font-redaction-35`): Reserved strictly for **at most 1 accent word per section title** and the 4 Specialist Desk `.epithet` signatures. Never use `font-serif` for generic empty-state paragraphs.
4. **Preserve All Backup `.webp` Artwork While Switching Primary Renders to Precision SVG Blueprints:** Keep all `.webp` files in `apps/web/public/landing/` untouched. Build a modular vector engraving system (`apps/web/src/components/brand/blueprint-plates.tsx`) that renders crisp, CAD-grade architectural SVG line-art (`strokeWidth="0.75"`, `stroke="currentColor"`, geometric degree ticks, crosshair reticles, and `#FF3616` focal nodes) with an optional `showRasterUnderlay?: boolean` prop (default `false`, or `true` at `opacity-[0.06]` masked behind the SVG geometry) so the `.webp` backups remain wired and available.
5. **No Decorative Fake Status Dots:** Only render a pulsing dot (`animate-pulse`) when a real stream, live market session, or active committee deliberation is running.
6. **Zero Layout Shift on Hover/Press:** Never use `hover:scale-105` or `whileTap={{ scale: 0.95 }}` on data cards. Use Kestrel's `tactile-press` (`active:translate-y-[0.5px]`) and border illumination (`hover:border-white/15` or `hover:border-brand/40`).

---

## 2. Task Breakdown

### Task 11.1 — Custom Architectural SVG Blueprint Plates (`Masterpiece #4`)

**Problem:** The landing page, dashboard command deck, and chat empty state currently rely on large `.webp` raster images (`kestrel-horus-statue.webp`, `simulator-astrolabe.webp`, `aegis-spartan-bust.webp`, `desks-council-strategists.webp`, `stepper-colonnade.webp`, `architecture-titan.webp`) rendered with `opacity-15 mix-blend-luminosity`. On high-DPI displays they look soft and disconnected from the sharp 1px UI grid.

**Implementation Specification:**

1. **Pre-Generated CAD SVG Blueprint Assets (Already Saved in `apps/web/public/landing/blueprints/`):**
   - All 5 mathematical CAD/Classical SVG blueprint assets have already been generated, XML-validated, and saved in `apps/web/public/landing/blueprints/`:
     - `/landing/blueprints/horus-blueprint.svg` (`DESK-I // HORUS` — Neoclassical Temple Pediment, 72-tick solar horizon, Kestrel Base 3E Ocular Falcon, and `US10Y` vs. `XAU` spline curves)
     - `/landing/blueprints/astrolabe-blueprint.svg` (`DESK-II // ASTROLABE` — 360° Stereographic Armillary Sphere, Ecliptic ring, `PDH/EQ/PDL` session levels, and multi-TF candlestick swing trajectory)
     - `/landing/blueprints/aegis-blueprint.svg` (`DESK-III // AEGIS` — Spartan Aegis Octagonal Shield, radial meander ticks, `1.0σ/2.0σ/3.0σ` ATR volatility cone fan, and `1.00%` Hard Veto barrier)
     - `/landing/blueprints/sentinel-blueprint.svg` (`DESK-IV // SENTINEL` — 4-Column Fluted Doric Stoa representing the 4 COT participant buckets overlaid with bi-directional institutional orderflow bars)
     - `/landing/blueprints/arbiter-blueprint.svg` (`STAGE II // ARBITER` — 4-Desk quadrant convergence conduits feeding into a central isometric diamond core and Kestrel Base 3E Falcon seal)
   - Verify that all 9 backup `.webp`/`.png` files in `apps/web/public/landing/` AND all 5 SVG files in `apps/web/public/landing/blueprints/` remain untouched in git.
2. **Add `blueprintId` & `blueprintPath` to `StrategistDeskConfig` (`apps/web/src/lib/kestrel-strategist-desks.ts`):**
   - Keep `artworkPath` pointing to the existing `/landing/*.webp` files as the backup raster path!
   - Add `blueprintId: 'horus' | 'astrolabe' | 'aegis' | 'sentinel' | 'arbiter'` and `blueprintPath: string` to `StrategistDeskConfig`:
     - `fundamental` (`DESK-I // HORUS`) → `blueprintId: 'horus'`, `blueprintPath: '/landing/blueprints/horus-blueprint.svg'`
     - `technical` (`DESK-II // ASTROLABE`) → `blueprintId: 'astrolabe'`, `blueprintPath: '/landing/blueprints/astrolabe-blueprint.svg'`
     - `risk` (`DESK-III // AEGIS`) → `blueprintId: 'aegis'`, `blueprintPath: '/landing/blueprints/aegis-blueprint.svg'`
     - `sentiment` (`DESK-IV // SENTINEL`) → `blueprintId: 'sentinel'`, `blueprintPath: '/landing/blueprints/sentinel-blueprint.svg'`
     - `arbiter` (`STAGE II // ARBITER`) → `blueprintId: 'arbiter'`, `blueprintPath: '/landing/blueprints/arbiter-blueprint.svg'`
3. **Create `apps/web/src/components/brand/blueprint-plates.tsx` (`<= 160` LOC):**
   - Export `<BlueprintPlate id={...} className={...} showRasterBackup={false} />` that renders the pre-generated `/landing/blueprints/${id}-blueprint.svg` crisp vector schematic (`<img>` or `<Image unoptimized>`), and when `showRasterBackup` is `true`, layers the corresponding backup `/landing/*.webp` raster artwork underneath at `opacity-[0.08] mix-blend-luminosity` masked by a radial vignette. Do NOT hand-roll new amateur SVGs—use the 5 pre-generated files in `/landing/blueprints/*.svg`!

---

### Task 11.2 — Unified Telemetry Ribbon & Global Shell Compression (`apps/web/src/components/layout/*`)

**Problem:** Stacking `TopBar` (48px) + `TickerTape` (28px) + `MarketSessionBar` (24px) consumes 100px of vertical height before page content begins and splits market context across two competing horizontal strips.

**Implementation Specification:**

1. **Create Unified `<TelemetryRibbon />` (`apps/web/src/components/layout/telemetry-ribbon.tsx`):**
   - Consolidate `MarketSessionBar` (`market-session-bar.tsx`) and `TickerTape` (`ticker-tape.tsx`) into a single `h-7` (`28px`) structural bar (`bg-[#0d0e10] border-b border-white/[0.07] font-mono text-[11px]`).
   - **Left Pinned Dock (`shrink-0 flex items-center gap-2 border-r border-white/[0.08] px-3 bg-[#101113] z-10`):**
     - Live UTC clock (`14:32 UTC`).
     - Compact session pills (`ASIA`, `LON`, `NY`) where only the active session(s) illuminate with a `bg-bull/15 text-bull border-bull/30` badge and inactive sessions render as quiet `text-fg-subtle/60` text (no bulky borders on inactive sessions).
     - Conditional `OVERLAP` / `KILLZONE` ember pill (`text-brand bg-brand/10 border-brand/30`) when active.
   - **Right Scrolling Marquee (`flex-1 overflow-hidden`):**
     - Seamless infinite ticker track (`TAPE_SYMBOLS`) with `tick-flash` animation on price change and clickable `<Link href={`/chart/${item.symbol}`}>` items so clicking any symbol in the tape opens its chart!
2. **Update `apps/web/src/app/(app)/layout.tsx`:**
   - Replace `<TickerTape />` + `<MarketSessionBar />` inside `<AmbientTelemetry>` with `<TelemetryRibbon />` (or keep `TickerTape` and `MarketSessionBar` updated and composed cleanly so existing tests pass—check `apps/web/test` and `apps/web/tests` for any tests importing `TickerTape` or `MarketSessionBar` and keep their exports working!).
3. **Upgrade `AppShellMain` (`apps/web/src/components/layout/app-shell-container.tsx`):**
   - Widen the desktop container contract from `max-w-2xl ... lg:max-w-5xl xl:max-w-7xl` to a full-bleed-capable workstation container: `mx-auto w-full max-w-[1600px] px-3 pt-3 pb-[var(--shell-bottom-pad)] sm:px-5 lg:pb-6 xl:px-6`.
4. **Refine `MobileBottomNav` (`apps/web/src/components/layout/mobile-bottom-nav.tsx`):**
   - Add a crisp top specular hairline (`border-t border-white/[0.09] bg-[#101113]/95 backdrop-blur-2xl`) and ensure touch targets remain `min-h-[44px]` with clean `Funnel Sans` `11px` labels.

---

### Task 11.3 — Landing Page Architectural Redesign (`apps/web/src/components/landing/*`)

**Problem:** All 6 landing page sections currently use the same repetitive visual formula (centered pill badge + big heading + `.webp` statue watermark + rounded dark box).

**Implementation Specification:**

1. **`LandingHero` (`landing-hero/index.tsx`, `hero-copy.tsx`, `hero-telemetry-rig.tsx`):**
   - Remove the giant `font-bebas` `KESTREL // SOVEREIGN AI` watermark at the bottom of `landing-hero/index.tsx`.
   - Frame the hero in an **Architectural Swiss Grid** (`border-b border-white/[0.08]`) with subtle vertical column hairlines (`border-x border-white/[0.05]`) and corner `+` registration marks.
   - Behind the right column (`HeroTelemetryRig`), mount `<BlueprintPlate id="horus" showRasterBackup />` so the precision SVG ocular pediment & yield curve blueprint frames the telemetry console while keeping `kestrel-horus-statue.webp` as the subtle raster underlay backup.
   - Inside `HeroTelemetryRig`, replace the 4 cramped 2-line desk chips with a **4-Desk Live Consensus Matrix** showing each desk's Roman code (`DESK-I`..`IV`), live bias pill (`BULL` / `BEAR` / `GUARD`), and 1-line mathematical read, leading directly into the recessed `#0a0b0c` Entry / Invalidation / Target (`1:3.2 R:R`) wells.
2. **`LandingDesks` (`landing-desks/index.tsx`, `desk-tabs.tsx`, `desk-console.tsx`):**
   - Replace the single static background image with a dynamic `<BlueprintPlate id={activeDesk.blueprintId} showRasterBackup />` inside `DeskConsole` that morphs smoothly via `AnimatePresence` as the user clicks or auto-cycles through **HORUS (Macro)**, **ASTROLABE (Technical)**, **AEGIS (Risk)**, and **SENTINEL (Sentiment)**.
   - Structure the left `DeskTabs` rail and right `DeskConsole` as a unified **2-Pane Milled Instrument Frame** (`grid lg:grid-cols-12 border border-white/10 rounded-2xl overflow-hidden bg-[#121315] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]`) instead of floating separate boxes with a gap between them.
3. **`LandingSimulator` (`landing-simulator/index.tsx`, `simulator-canvas.tsx`, `simulator-controls.tsx`):**
   - Mount `<BlueprintPlate id="aegis" showRasterBackup />` as the technical schematic backdrop.
   - Style the Risk Governor slider and 4-Desk voting stages as a unified **Hardware Rack Console** with recessed `#090a0b` telemetry wells and crisp `1px` cell dividers.
4. **`LandingStepper` & `LandingArchitecture` (`landing-stepper/*`, `landing-architecture/*`):**
   - Mount `<BlueprintPlate id="sentinel" showRasterBackup />` in `LandingStepper` and `<BlueprintPlate id="arbiter" showRasterBackup />` in `LandingArchitecture`, ensuring every section has a distinct layout topology (Editorial Split → Unified 2-Pane Instrument Frame → Interactive Risk Rack → Vertical Circuit Spine → 3D Isometric Stack).

---

### Task 11.4 — Institutional Split Auth Gateway (`apps/web/src/app/(auth)/layout.tsx`)

**Problem:** `/login` and `/register` render a small `max-w-sm` box floating in empty space, feeling like a generic boilerplate login screen.

**Implementation Specification:**

1. Upgrade `AuthLayout` (`apps/web/src/app/(auth)/layout.tsx`) into a responsive **2-Column Institutional Gateway** on desktop (`lg:grid lg:grid-cols-12 min-h-svh`):
   - **Left Column (`lg:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:border-r lg:border-white/[0.08]`):**
     - Top bar with `<KestrelBrand variant="lockup" href="/landing" />` and `← Back to Kestrel`.
     - Center auth form container (`w-full max-w-sm mx-auto`) with crisp `surface-panel` inputs and zero double-card wrapping.
     - Bottom security footer (`NON-CUSTODIAL · AES-256-GCM BYOK VAULT · ROW-LEVEL SECURITY`).
   - **Right Column (`hidden lg:flex lg:col-span-7 relative flex-col justify-between overflow-hidden bg-[#0c0d0f] p-12`):**
     - Render `<BlueprintPlate id="horus" showRasterBackup className="absolute inset-0 m-auto size-[560px] opacity-85" />`.
     - Top telemetry header: `SOVEREIGN COUNCIL ARCHITECTURE // 4 SPECIALIST DESKS`.
     - Bottom glassmorphic **Sample Verified Dossier Card** showcasing the 4 Desks (`HORUS`, `ASTROLABE`, `AEGIS`, `SENTINEL`) and the immutable `1.0%` Risk Guardrail so operators immediately experience Kestrel's identity on sign-in.

---

## 3. Phase 11 Verification Gate

```bash
# 1. Confirm zero backup .webp/.png files were deleted in apps/web/public/landing/
git status apps/web/public/landing/

# 2. Run static architecture, route-security, env-contract, and file-size guards
pnpm check:guards

# 3. Run dead-code and unused-export check (must report 0 findings)
pnpm knip

# 4. Run linter, formatter check, and affected typecheck + unit tests
pnpm check:fast
```
