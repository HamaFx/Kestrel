# Hoplite Design System Architecture

> **Aesthetic Thesis:** Classical Antiquity Meets Cyber-Industrial Hardware.  
> The Hoplite design system transforms Kestrel from a flat monochrome dashboard into a high-precision, tactile quantitative research terminal.

---

## 1. Design Principles & Aesthetic Foundations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            THE HOPLITE STANDARD                             │
│       Ancient Sovereign Authority   ×   Milled Industrial Hardware          │
├──────────────────────────────────────┬──────────────────────────────────────┤
│  • Sovereign Falcon of Horus / Gold  │  • Milled billet aluminum housings   │
│  • 4-Desk Phalanx (Tech/Macro/Risk)  │  • Recessed instrument data wells    │
│  • Bayer 4×4 coarse dithered art     │  • Chamfered chips & sub-pixel sheen │
│  • Redaction degradation ladder      │  • Bottom-up rising ember gradients  │
│  • Funnel Display & Geist Mono       │  • Tactile keycaps & spring presses  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

The design language balances two deliberate forces:
1. **Classical Sovereign Authority:** Monolithic headings, Spartan discipline, Greek/Egyptian mythological undertones, and intentional typography contrast.
2. **Tactile Cyber-Industrial Hardware:** Recessed data wells, chamfered chip edges, sub-pixel top specular highlights (`inset 0 1px 0 rgba(255,255,255,0.12)`), bottom-up ember heat gradients (`#FF3616`), and tabular monospace telemetry figures.

---

## 2. Typography Hierarchy & Asset Pipeline

The typography system uses five specialized typefaces, each serving an architectural role:

| Font Family | CSS Variable / Utility | Optical Weight / Style | Purpose & Usage |
| :--- | :--- | :--- | :--- |
| **Funnel Display** | `font-display` / `--font-display` | Regular 400 (tight `-0.03em`) | Monumental section headlines, hero titles, committee banners |
| **Funnel Sans** | `font-sans` / `--font-sans` | Regular 400, Medium 500 | Interface prose, body descriptions, navigation labels |
| **Redaction (35, 50, 70)** | `font-redaction-35` / `font-redaction` | Italic | Intentional organic contrast: 1–2 highlighted words per title |
| **Geist Mono** | `font-mono` / `--font-mono` | Medium 500, Bold 700 | Currency prices, spreads, latencies, code blocks, tabular badges |
| **Bebas Neue** | `font-bebas` / `--font-bebas` | Regular 400 | Monumental watermark displays in footer and hero backgrounds |

All fonts are self-hosted as modern `.woff2` files in `apps/web/public/fonts/` with `<link rel="preload">` tags configured in `apps/web/src/app/layout.tsx`.

---

## 3. Surface Language & Token Architecture

Located in `apps/web/src/app/globals.css`, the Hoplite surface token system replaces flat borders with physical depth:

### Color Palette
- **Deep Ground:** `#101112` (Obsidian canvas)
- **Panel Elevation:** `#141516` (Primary container surface)
- **Elevated Chip:** `#161718` (Chamfered interactive tiles)
- **Recessed Well:** `#08090a` (Instrument data reading groove)
- **The Brand Ember:** `#FF3616` (Primary flame / active state)
- **Semantics:** Bullish/Mint (`#3F9E3D`), Bearish/Crimson (`#E02C10`), Yields/Info (`#89B4FA`), Risk/Warn (`#FAB387`)

### Surface CSS Utility Classes

```css
/* Chamfered interactive component tile */
.surface-chip {
  background: #161718;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12),
              0 2px 8px rgba(0, 0, 0, 0.4);
}

/* Recessed instrument data well */
.surface-well {
  background: #090a0b;
  border: 1px solid rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
}

/* Primary institutional card */
.surface-panel {
  background: #141516;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.8),
              inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
```

---

## 4. Public Showcase Architecture (`apps/web/src/app/page.tsx`)

The root `/` route serves as an institutional marketing showcase for unauthenticated visitors while seamlessly redirecting logged-in operators into the trading terminal (`/chat`).

```
┌─────────────────────────────────────────────────────────────┐
│                        LANDING NAV                          │
│  [Logo: KESTREL]  [XAU/USD Live Pulse]  [Desks] [Pipeline]   │
├─────────────────────────────────────────────────────────────┤
│                        LANDING HERO                         │
│  • Live Multi-Asset Ticker Ribbon (XAU, EUR, GBP, DXY, 10Y) │
│  • Monumental Headline (Funnel Display + Redaction Italic)  │
│  • Interactive 3-Symbol Deliberation Rig (XAU, EUR, GBP)    │
│  • Compound Tactical Order Card (Entry, Stop, R:R Cones)    │
├─────────────────────────────────────────────────────────────┤
│                     LANDING DESKS (#desks)                  │
│  • 4 Autonomous Specialist Desks (Tech, Macro, Risk, COT)   │
│  • Live hypothesis badges, key metrics, and rationales      │
├─────────────────────────────────────────────────────────────┤
│                    LANDING STEPPER (#stepper)               │
│  • 4-Stage Pipeline: Ingestion → Deliberate → Veto → Cones  │
│  • Dark-Chrome IDE Window with Syntax Highlighting          │
├─────────────────────────────────────────────────────────────┤
│                 LANDING ARCHITECTURE (#architecture)        │
│  • 4-Pillar Infrastructure Grid with Tactile Micro-Visuals  │
├─────────────────────────────────────────────────────────────┤
│                      LANDING FAQ (#faq)                     │
│  • Monospace-Numbered Accordion (01 - 05)                   │
├─────────────────────────────────────────────────────────────┤
│                       LANDING FOOTER                        │
│  • System status pill + Colossal Bebas Neue Watermark       │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown
1. **`LandingNav` (`landing-nav.tsx`):** Sticky frosted header (`backdrop-blur-2xl bg-[#101112]/90 border-b border-white/10`) with live XAU/USD status pill and responsive mobile navigation drawer.
2. **`LandingHero` (`landing-hero.tsx`):**
   - **Market Ticker Ribbon:** Continuous interbank feed metrics (`XAU/USD $2,864.20 ▲ +1.42%`, `DXY 104.12 ▼ -0.34%`).
   - **Deliberation Rig:** Interactive hardware console allowing symbol switching between Spot Gold, Euro, and British Pound, dynamically updating desk signals and order cards.
   - **Tactical Button (`variant="tactical"`):** Glowing ember pill button with active press translation.
3. **`LandingDesks` (`landing-desks.tsx`):** Interactive deep-dive into the 4 specialist desks (SMC Technical, Central Bank Macro, 1% Quantitative Risk, and CFTC Institutional Flow).
4. **`LandingStepper` (`landing-stepper.tsx`):** IDE-styled code window with macOS hardware dots, tabbed files, colored syntax blocks, and latency benchmarks (14ms, 82ms, 44ms, 18ms).
5. **`LandingArchitecture` (`landing-architecture.tsx`):** 4 infrastructure pillars with embedded micro-diagrams (Consensus node network, Risk formula boundary, Multi-venue latency matrix, AES-256 vault).
6. **`LandingFAQ` (`landing-faq.tsx`):** Monospace-numbered accordion explaining arbitration, non-custodial security, and models.
7. **`LandingFooter` (`landing-footer.tsx`):** Operational uptime pill, terminal navigation links, and colossal Bebas Neue watermark.

---

## 5. In-App Experience & Component Alignment

The Hoplite design language extends across internal trading surfaces:
- **`top-bar.tsx` & `desktop-sidebar.tsx`:** Milled borders, active `.surface-chip` tabs with glowing amber indicators, and recessed avatar wells.
- **`calendar-hero.tsx` & `event-card.tsx`:** High-impact economic catalysts categorized with monospace impact badges and countdown timers.
- **`(auth)/layout.tsx`:** Bottom-up ember glow on login/registration forms with recessed inputs.
