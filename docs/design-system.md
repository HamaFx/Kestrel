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
│  [Logo: KESTREL]  [XAU/USD Live Pulse]  [Desks] [Simulator] │
├─────────────────────────────────────────────────────────────┤
│                        LANDING HERO                         │
│  • Sovereign Falcon of Horus Classical Pediment Masterwork  │
│  • Live Multi-Asset Ticker Ribbon (XAU, EUR, GBP, DXY, 10Y) │
│  • Monumental Headline (Funnel Display + Redaction Italic)  │
│  • Interactive 3-Symbol Deliberation Rig (XAU, EUR, GBP)    │
│  • Gliding Spring Pills (`layoutId`) & Smooth Transitions   │
├─────────────────────────────────────────────────────────────┤
│                     LANDING DESKS (#desks)                  │
│  • Cybernetic Hoplite Spartan Bust Masterwork Backdrop      │
│  • 4 Autonomous Specialist Desks (Tech, Macro, Risk, COT)   │
│  • Gliding Active Indicator (`layoutId`) & AnimatePresence  │
├─────────────────────────────────────────────────────────────┤
│                  LANDING SIMULATOR (#simulator)             │
│  • Interactive Syndicate Transaction Simulator              │
│  • Market Event Injector & Live 4-Desk Voting Animation     │
│  • Interactive Risk Ceiling Slider & Live Veto Enforcement  │
│  • Certified Cryptographic Order Ticket & FIX Bridge Test   │
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
│  • Smooth Auto-Height Spring Animation (`AnimatePresence`)  │
├─────────────────────────────────────────────────────────────┤
│                       LANDING FOOTER                        │
│  • System status pill + Colossal Bebas Neue Watermark       │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown
1. **`LandingNav` (`landing-nav.tsx`):** Sticky frosted header (`backdrop-blur-2xl bg-[#101112]/90 border-b border-white/10`) with live XAU/USD status pill, `Live Simulator` anchor, and responsive mobile navigation drawer.
2. **`LandingHero` (`landing-hero.tsx`):**
   - **Horus Falcon Masterpiece:** Neoclassical predatory raptor on temple pediment blended into the obsidian canvas with radial vignette masking.
   - **Market Ticker Ribbon:** Continuous interbank feed metrics (`XAU/USD $2,864.20 ▲ +1.42%`, `DXY 104.12 ▼ -0.34%`).
   - **Deliberation Rig:** Interactive hardware console with `layoutId` gliding symbol selector and `AnimatePresence` data transitions.
   - **Tactical Button (`variant="tactical"`):** Glowing ember pill button with active press translation.
3. **`LandingDesks` (`landing-desks.tsx`):** Interactive deep-dive into the 4 specialist desks with the Cybernetic Hoplite Spartan bust backdrop, `layoutId="active-desk-tab-indicator"`, and smooth `AnimatePresence` transitions.
4. **`LandingSimulator` (`landing-simulator.tsx`):** Hands-on interactive transaction simulator featuring scenario injection, live 4-desk radial voting progress, interactive draggable risk governor slider (with live red veto triggers when $>1.0\%$), and mock FIX bridge dispatching.
5. **`LandingStepper` (`landing-stepper.tsx`):** IDE-styled code window with macOS hardware dots, tabbed files, colored syntax blocks, and latency benchmarks (14ms, 82ms, 44ms, 18ms).
6. **`LandingArchitecture` (`landing-architecture.tsx`):** 4 infrastructure pillars with embedded micro-diagrams (Consensus node network, Risk formula boundary, Multi-venue latency matrix, AES-256 vault).
7. **`LandingFAQ` (`landing-faq.tsx`):** Monospace-numbered accordion with smooth spring-based auto-height expanding and closing via `motion/react` and `AnimatePresence`.
8. **`LandingFooter` (`landing-footer.tsx`):** Operational uptime pill, terminal navigation links, and colossal Bebas Neue watermark.

---

## 5. Neoclassical Cyber-Art Masterworks & Visual Identity

| Masterpiece | Asset Location | Aesthetic Rationale |
| :--- | :--- | :--- |
| **Sovereign Falcon of Horus** | `/landing/kestrel-horus-statue.webp` | Forged in titanium, bronze, and obsidian with glowing circuit wings perched atop a classical Greek temple pediment with holographic financial telemetry. Represents Kestrel's apex surveillance over currency and bullion flows. |
| **Cybernetic Hoplite Spartan Bust** | `/landing/hoplite-spartan-bust.webp` | Classical Greek bronze sculpture fused with glowing molten ember-orange optical circuits and Greek key armor engravings. Symbolizes the unbreakable algorithmic phalanx of the 4 specialist desks. |

---

## 6. Motion & Spring Physics Architecture (`motion/react`)

Kestrel utilizes Framer Motion / Motion One (`motion/react`) for institutional-grade micro-interactions:
- **Gliding Indicator Tabs (`layoutId`):** Active states seamlessly glide between buttons without layout jumps using spring physics (`stiffness: 450, damping: 32`).
- **Directional State Transitions (`AnimatePresence mode="wait"`):** Seamless fading and vertical translation when switching active symbols, desks, or stepper tabs.
- **Auto-Height Accordion:** FAQs dynamically compute content height with spring easing (`[0.16, 1, 0.3, 1]`) preventing abrupt content pop-in.
- **Staggered Orchestrated Entrances:** Critical hero typography and telemetry consoles cascade in with controlled delays.
