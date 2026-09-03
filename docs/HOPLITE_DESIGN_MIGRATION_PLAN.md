# HamaFX-Ai Design System Migration Plan: The Hoplite Standard

> **Executive Objective:** Transform HamaFX-Ai (Kestrel) from its current rigid, flat 2px monochrome interface into an institutional-grade, tactile quantitative research terminal inspired by the **Hoplite design language** (Classical Antiquity meets Cyber-Industrial Hardware).

---

## 1. Design & Aesthetic Thesis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             HAMAFX-AI AESTHETIC                             │
│       Ancient Sovereign Authority   ×   Milled Industrial Hardware          │
├──────────────────────────────────────┬──────────────────────────────────────┤
│  • Sovereign Falcon of Horus / Gold  │  • Milled billet aluminum housings   │
│  • 4-Desk Phalanx (Tech/Macro/Risk)  │  • Recessed instrument wells         │
│  • Bayer 4×4 coarse dithered art     │  • Chamfered chips & sub-pixel sheen │
│  • Redaction degradation ladder      │  • Bottom-up rising ember gradients  │
│  • Funnel Display & Geist Mono       │  • Tactile keycaps & spring presses  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. File-by-File Impact Matrix

| Area | Primary Files | Target Changes |
| :--- | :--- | :--- |
| **Fonts & Assets** | `public/fonts/*`<br>`public/brand/*`<br>`public/landing/*` | Add WOFF2 files for Funnel Display, Funnel Sans, Redaction (10-70), Geist Mono, Bebas Neue. Add Bayer 4×4 dithered Falcon and hardware desk graphics. |
| **Global Tokens** | `apps/web/src/app/globals.css` | Complete rewrite of `@theme` block in Tailwind v4 with Hoplite surface tokens (`--color-ground`, `--color-dark-ground`, `--shadow-housing`, `--shadow-well`, `--shadow-chip`, `--keycap-rim`). |
| **Primitives** | `apps/web/src/components/ui/button.tsx`<br>`card.tsx`<br>`stat-card.tsx`<br>`segmented.tsx`<br>`input.tsx` | Implement Hoplite compound glowing pill CTA, chamfered `.surface-chip` with inset sheens, recessed data wells, and tactile keycap active states. |
| **App Shell** | `desktop-sidebar.tsx`<br>`top-bar.tsx`<br>`ticker-tape.tsx`<br>`app-shell-container.tsx` | Upgrade sidebar with milled chassis borders and active chip indicators; convert ticker tape into an authentic recessed mechanical groove. |
| **Chat & AI** | `chat-screen.tsx`<br>`message.tsx`<br>`parts/agent-deliberation.tsx`<br>`parts/mastra-report.tsx`<br>`parts/pixel-desk/*` | **Deprecate 8-bit RPG sprites** (`ChartWizardSprite`, `RiskKnightSprite`). Implement the **4-Desk Hardware Telemetry Rack** with live `.usecase-trace-pulse` SVG circuits. |
| **Dashboard** | `dashboard/page.tsx`<br>`dashboard-canvas.tsx`<br>`performance-chart.tsx` | Convert flat widgets into tactile hardware cards with Geist Mono tabular metrics and Redaction emphasis typography. |
| **Public Showcase**| `apps/web/src/app/page.tsx`<br>`(marketing)/page.tsx` | Build an authentic Hoplite-grade public showpiece with Hero, 4-step circuit stepper, live TradingView perspective card, and Acropolis/Vault footer. |
| **Auth & Setup** | `(auth)/login/page.tsx`<br>`(auth)/register/page.tsx`<br>`(auth)/layout.tsx`<br>`onboarding/page.tsx` | Embed dithered falcon lockup, bottom-up ember gradient titles, and recessed authentication inputs. |

---

## 3. Step-by-Step Migration Phases

### Phase 1: Typography & Font Asset Pipeline
1. **Download & Provision WOFF2 Fonts** into `apps/web/public/fonts/`:
   - `funnel-display-latin-wght-normal.woff2` (Headline authority)
   - `funnel-sans-latin-wght-normal.woff2` (Body and chrome)
   - `redaction-35-italic.woff2`, `redaction-50-italic.woff2`, `redaction-70-italic.woff2` (Emphasis ladder)
   - `geist-mono-wght-normal.woff2` (Financial figures, quotes, code)
   - `bebas-neue-latin-400-normal.woff2` (Colossal watermarks)
2. **Configure Preloads & `@font-face` Declarations:**
   - Add `<link rel="preload">` in `apps/web/src/app/layout.tsx`.
   - Register `@font-face` rules in `globals.css`.

### Phase 2: Design Tokens & Tailwind CSS v4 `@theme` Overhaul
1. **Replace the flat monochrome variables** in `apps/web/src/app/globals.css` with:
   - **Grounds:** Warm alabaster (`#EAEAEA` / `#F2F2F0`) for light mode, Obsidian (`oklch(17% 0 0)`) for dark mode.
   - **The Brand Ember:** Pure `#FF3616` with ember accents (`#FF632A`, `#FF4800`).
   - **Market Semantics:** Mint/Emerald (`#3F9E3D`) and Crimson (`#E02C10`).
   - **Tactile Shadows:** `--shadow-housing`, `--shadow-well`, `--shadow-chip`, `--keycap-rim`, `--keycap-face`.
2. **Register Hoplite Surface Utilities:**
   - `.surface-well`, `.surface-well-deep`, `.surface-chip`, `.surface-chip-dark`, `.surface-chip-destructive`, `.status-chip`.
   - Keyframes: `progress-sweep`, `tick-countdown`, `horse-gallop-frames`, `usecase-trace-pulse`.

### Phase 3: Core UI Component Library Upgrades
1. **Button (`button.tsx`):**
   - Add `variant="tactical"`: asymmetrical compound capsule (left 6px, right pill) with multi-layer ember glow expanding on hover.
   - Add sub-pixel inset sheens and subtle active press translations (`active:translate-y-[0.5px]`).
2. **Stat Cards & Cards (`stat-card.tsx`, `card.tsx`):**
   - Implement beveled chip containers (`.surface-chip`) with recessed numeric wells (`.surface-well`).
3. **Segmented Tabs (`segmented.tsx`):**
   - Style tabs as physical keycaps (`--shadow-keycap`) with tactile pressed state and ember border highlight.

### Phase 4: App Shell & Global Chrome
1. **Desktop Sidebar (`desktop-sidebar.tsx`):**
   - Introduce milled aluminum chassis border (`border-r border-edge dark:border-dark-edge`).
   - Active navigation links become chamfered `.surface-chip` elements with an amber/orange status dot.
   - Profile avatar housed in a recessed keycap well.
2. **Top Bar & Ticker Tape (`top-bar.tsx`, `ticker-tape.tsx`):**
   - Add mechanical horizontal groove under the top bar (`--shadow-groove`).
   - Format live price ticks in Geist Mono with micro-indicators and flash animations on price tick updates.

### Phase 5: AI Chat Terminal & The 4-Desk Telemetry Rack
1. **Deprecate Fantasy RPG Sprites:**
   - Remove `ChartWizardSprite`, `RiskKnightSprite`, `MacroMageSprite` from `apps/web/src/components/chat/parts/pixel-desk/`.
2. **Build the 4-Desk Hardware Telemetry Rack:**
   - **Technical Desk:** High-frequency order block & candlestick vector oscillogram.
   - **Fundamental Desk:** Macro teleprinter stream indicator (yields, CPI, rates).
   - **Risk Desk:** Solid-state margin killswitch & vault lock indicator.
   - **Sentiment Desk:** Institutional positioning radar gauge.
3. **Pulsing SVG Circuits (`.usecase-trace-pulse`):**
   - Connect the active desk to the running chat response with animated `#FF3616` dash traces.
4. **Mastra Verified Reports (`mastra-report.tsx`):**
   - Wrap trade ideas in chamfered `.surface-panel` with sub-pixel top sheen and tabular Geist Mono data.

### Phase 6: Public Marketing Showcase (`apps/web/src/app/page.tsx`)
1. **Smart Route Resolver:**
   - Unauthenticated visitors see the full Hoplite-grade public showpiece.
   - Authenticated visitors seamlessly redirect to `/chat` or `/dashboard`.
2. **Showcase Sections:**
   - **Hero:** Ember gradient text + Redaction italic, YC/Security badge, dual CTAs, tilted TradingView preview card, and colossal `XAUUSD` watermark in Bebas Neue.
   - **How It Works (4-Step Animated Stepper):** Connect Feeds → Configure SMC Rules → 4-Desk Deliberation → Verified Execution.
   - **Parallel Intelligence ("Scale to Swarms"):** Visualization of multi-symbol parallel monitoring.
   - **Security Architecture:** Exploded isometric diagram of local BYOK encrypted sandboxes.
   - **Acropolis / Sovereign Vault Footer:** Bayer-dithered monument artwork with running steed/falcon vectors.

### Phase 7: Verification, Performance & Quality Gate
1. **Automated Testing:** Run `pnpm --filter @kestrel/web test` and `pnpm --filter @kestrel/web typecheck`.
2. **Bundle-Size Guard:** Ensure WOFF2 font subsets and SVGs stay within the bundle size limits.
3. **Accessibility:** Verify WCAG 2.2 AA contrast ratios across both light alabaster and dark obsidian themes. Ensure `prefers-reduced-motion` suppresses all keyframe hops and circuit sweeps.

---

## 4. Verification Checkpoints & Rollback Plan

- **Branch Isolation:** Work is isolated on dedicated branch `feature/hoplite-design-overhaul`. (DO NOT MERGE TO MAIN until final user signoff).
- **Atomic Commits:** Each phase (Tokens, Shell, Chat, Landing, Polish) committed independently and verified via Vitest and Playwright.
- **Rollback Safety:** Old token names aliased in `globals.css` to prevent broken styles in secondary views.

---

## 5. Implementation Status & Deployment Verification

| Phase | Description | Status | Verification Notes |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Font Asset Pipeline & Self-Hosted WOFF2 Fonts | **COMPLETED** | Funnel Display, Funnel Sans, Redaction (35/50/70), Geist Mono, Bebas Neue loaded and preloaded. |
| **Phase 2** | Tokens & Surface Utilities in `globals.css` | **COMPLETED** | `.surface-chip`, `.surface-well`, `.surface-panel`, `--shadow-chip`, `--shadow-panel`, `--shadow-tactile-pop`. |
| **Phase 3** | Primitives & Tactical Button | **COMPLETED** | Added `variant="tactical"` button with glowing ember border and tactile click state. |
| **Phase 4** | App Shell & Navigation Chrome | **COMPLETED** | Milled chassis borders on `desktop-sidebar.tsx`, `top-bar.tsx`, and `app-shell-container.tsx`. |
| **Phase 5** | Secondary App Views (Calendar, Journal, Auth) | **COMPLETED** | High-impact catalyst badges, Spartan journal cards, and recessed auth inputs. |
| **Phase 6** | Public Marketing Showcase (`page.tsx`) | **COMPLETED** | Built `LandingNav`, `LandingHero`, `LandingDesks`, `LandingStepper`, `LandingArchitecture`, `LandingFAQ`, `LandingFooter`. |
| **Phase 7** | Hoplite Polish & Interactivity Overhaul | **COMPLETED** | Added live interbank ticker ribbon, 3-symbol interactive deliberation rig, dedicated 4 specialist desks showcase (`#desks`), and IDE code tabs. |
| **Phase 8** | Vercel Preview Deployment & Auth Resilience | **COMPLETED** | Defensive fallback for preview secrets, `try/catch` around `auth()`, 100% clean deployment build. |

### Live Preview URLs
- **Latest Deployment:** `https://hamafx-c0t6li6c6-mahamad-ahmads-projects.vercel.app`
- **Branch Alias:** `https://hamafx-ai-git-feature-hoplite-de-0a238d-mahamad-ahmads-projects.vercel.app`

