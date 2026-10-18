# Ground-Truth Visual Inspection: https://hoplite.sh

**Benchmark Audit for Kestrel (`apps/web`) Design System Alignment**

- **URL:** `https://hoplite.sh`
- **Audit Date:** 2026-10-18
- **Extraction Tools:** Dembrandt CLI v0.39.2 (Chromium headless engine) + Playwright v1.62.1 Live DOM Inspection
- **Artifacts Generated:**
  - `docs/audits/hoplite-tokens.json` (Dembrandt full extraction)
  - `docs/audits/hoplite-playwright-live.json` (Playwright computed styles & responsive inspection)
  - `docs/audits/screenshots/` (Full-page 1440, 1280, 768, 390 viewports, dark mode full-page, component captures)

---

## 1. Executive Summary

1. **Obsidian Surface Discipline:** Hoplite achieves tactile cyber-industrial precision through a strict 3-tier elevation model (`--ground: #121212` → `--well: #161616` → `--card: #1d1d1d`), avoiding blurred glass sheets in favor of opaque surfaces defined by 0.5px/1px hairline borders (`rgba(18,18,18,0.1)` light / `oklch(0.39 0 0)` dark).
2. **Specular Inset Illumination:** Tactile depth is governed by microscopic multi-layer inset specular highlights (`inset 0 1px 0 rgba(255,255,255,0.08)`, `inset 0 -1px 0 rgba(0,0,0,0.35)` and `inset 0 1.429px 0`) mimicking milled anodized metal rather than generic box-shadow fuzz.
3. **Typographic Orthogonality:** Headings belong strictly to `Funnel Display` (42px–54px at -0.022em tracking), interface copy strictly to `Funnel Sans` (14px–16px at 400/500 weight), and telemetry/keyboard/price indicators strictly to `Geist Mono` (11.25px uppercase with +1.125px tracking).
4. **Subtle Kinetic Weight:** Micro-interactions emphasize mechanical responsiveness over playful bounce: primary buttons depress by `0.5px` (`active:translate-y-[0.5px]`) and brighten by 10% (`hover:brightness-110`), orchestrated by snappy `cubic-bezier(0.32, 0.72, 0, 1)` and `cubic-bezier(0.23, 1, 0.32, 1)` easing curves.
5. **Exact Color Concordance with Kestrel:** The brand accent `#FF3616` is identical to Kestrel's forge flame orange (`rgb(255, 54, 22)`, LCH `57.023% 98.164 41.508`), confirming Kestrel's brand token matches ground-truth Hoplite, with drift occurring primarily in surface hierarchy and excessive backdrop blur.

---

## 2. Color & Surface System

### 2.1 Color Palette Table

Every observed color from Dembrandt extraction and Playwright live evaluation:

| Token / Role                       | Normalized Hex | RGB                         | OKLCH / LCH                                             | Observed Count | WCAG vs Ground (#121212 / #eaeaea)               |
| ---------------------------------- | -------------- | --------------------------- | ------------------------------------------------------- | -------------- | ------------------------------------------------ |
| `--ground` (Dark Canvas)           | `#121212`      | `rgb(18, 18, 18)`           | `oklch(18.22% 0 0)` / `lch(5.46% 0.004 53.34)`          | 162            | Ground baseline (Dark: 1:1, Light: 15.57:1 AAA)  |
| `--well` (Dark Recess)             | `#161616`      | `rgb(22, 22, 22)`           | `oklch(20.48% 0 0)` / `lch(7.28% 0.003 53.35)`          | 46             | Recessed background (1.18:1 vs ground)           |
| `--card` (Dark Elevated)           | `#1d1d1d`      | `rgb(29, 29, 29)`           | `oklch(23.46% 0 0)` / `lch(9.91% 0.003 53.35)`          | 69             | Surface elevation (1.47:1 vs ground)             |
| `--edge` (Hairline Border)         | `#2c2c2c`      | `rgb(44, 44, 44)`           | `oklch(29.74% 0 0)` / `lch(15.93% 0.003 53.35)`         | 34             | Structural separation hairline                   |
| `--brand` / `--action`             | `#ff3616`      | `rgb(255, 54, 22)`          | `oklch(64.90% 0.238 31.58)` / `lch(57.02% 98.16 41.51)` | 21             | 3.63:1 (Large text / UI graphic only)            |
| `--brand-soft` / `--action-bright` | `#ff632a`      | `rgba(255, 99, 42, 0.6)`    | `oklch(69.36% 0.202 38.67)`                             | 4              | Secondary brand glow / gradient                  |
| `--chart-1` / `--chart-positive`   | `#70d66e`      | `rgb(112, 214, 110)`        | `oklch(79.04% 0.171 143.38)`                            | 4              | Bullish / success state (10.12:1 AAA vs #121212) |
| `--chart-2` / `--chart-negative`   | `#ff3616`      | `rgb(255, 54, 22)`          | `oklch(64.90% 0.238 31.58)`                             | 21             | Bearish / danger state                           |
| `--ink` (Foreground Text)          | `#e5e5e5`      | `rgb(229, 229, 229)`        | `oklch(91.75% 0 0)` / `lch(90.87% 0 0)`                 | 148            | 13.94:1 (AAA Pass)                               |
| `--strong` (High Contrast Ink)     | `#dadada`      | `rgb(218, 218, 218)`        | `oklch(88.42% 0 0)` / `lch(86.92% 0 0)`                 | 52             | 12.64:1 (AAA Pass)                               |
| `--body` (Muted Ink 60%)           | `#e5e5e599`    | `rgba(229, 229, 229, 0.6)`  | `oklch(91.75% 0 0 / 0.6)`                               | 114            | 8.36:1 (AAA Pass)                                |
| `--sheen` (Specular Edge)          | `#ffffff21`    | `rgba(255, 255, 255, 0.13)` | `oklch(100% 0 0 / 0.13)`                                | 88             | Micro-bevel highlight                            |
| Light Ground (Dual-Theme)          | `#eaeaea`      | `rgb(234, 234, 234)`        | `oklch(92.83% 0 0)`                                     | 84             | Light canvas baseline                            |
| Light Card                         | `#f4f4f4`      | `rgb(244, 244, 244)`        | `oklch(96.72% 0 0)`                                     | 69             | Light surface panel                              |
| Light Edge                         | `#e3e3e3`      | `rgb(227, 227, 227)`        | `oklch(90.65% 0 0)`                                     | 45             | Light border hairline                            |

### 2.2 Surface Hierarchy

The Hoplite architecture uses four defined levels:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Ground Canvas (--ground: #121212 / #eaeaea)              │
│    Flat base. No borders, no shadows.                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 2. Recessed Well (--well: #161616 / #e5e5e5)          │  │
│  │    Recess: inset 0 2px 2px rgba(0,0,0,0.05)           │  │
│  │    Specular: 0 1px 1px rgba(255,255,255,0.65)         │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ 3. Elevated Panel / Card (--card: #1d1d1d)      │  │  │
│  │  │    Hairline: 1px solid oklch(0.39 0 0)          │  │  │
│  │  │    Highlight: inset 0 1px 0 rgba(255,255,255,0.04)│  │
│  │  │    Shadow: 0 1px 2px rgba(0,0,0,0.50)           │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │ 4. Interactive Chip / Button              │  │  │  │
│  │  │  │    Bg: oklch(0.25 0 0) (Dark)             │  │  │  │
│  │  │  │    Top Inset: inset 0 1px 0 rgba(255,255,255,0.08)  │
│  │  │  │    Side Inset: inset ±1px 0 rgba(255,255,255,0.043) │
│  │  │  │    Bottom Groove: inset 0 -1px rgba(0,0,0,0.35)    │
│  │  │  │    Shadow: 0 1px 2px rgba(0,0,0,0.5), 0 4px 8px   │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 How Depth is Created (Recess vs Blur vs Shadow)

- **Backdrop-Blur is absent from standard cards and shells.** Out of 61 observed shadow surfaces, `backdrop-filter: blur(...)` appears only on a single subtle floating pill tag (`backdrop-blur-[2px]`). All cards (`surface-card`) and buttons (`surface-button`) have `backdrop-filter: none`.
- **Specular Inset Highlights:** Hoplite replaces fuzzy ambient shadows with tight, directional inset bevels:
  - Top edge specular highlight: `rgb(255, 255, 255) 0px 1.429px 0px 0px inset`
  - Subtle secondary rim: `rgba(255, 255, 255, 0.5) 0px -1px 0px 0px inset`
  - Lateral housing rim: `rgba(255, 255, 255, 0.12) 0px 0px 0px 1.071px inset`
- **Low-Spread Ambient Shadows:** Instead of high-blur dropshadows (e.g., `0 20px 40px`), Hoplite uses multi-stop micro-shadows:
  `0 13px 5px rgba(0,0,0,0.01), 0 7px 4px rgba(0,0,0,0.03), 0 3px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.05)`.

### 2.4 Border Discipline

- **Hairline Width:** Consistently `1px` (rendered `border-[0.5px]` or `border-[0.714px]` on high-DPI).
- **Border Colors:**
  - Dark Mode: `oklch(0.39 0 0)` (equivalent to `rgba(255, 255, 255, 0.10)`) and `--edge: #2c2c2c`.
  - Light Mode: `rgba(18, 18, 18, 0.10)` / `rgb(227, 227, 227)`.
- **Hairlines vs Inset Highlights:** Hairline borders are used on exterior perimeter containers. Inset highlights (`box-shadow: inset ...`) are used inside cards and pressable controls so borders do not accumulate double thickness when nested.

---

## 3. Typography System

### 3.1 Font Stack Table

| Role                     | Family           | Fallbacks Stack                                                         | Weights    | Source / Asset                                                    |
| ------------------------ | ---------------- | ----------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| **Monumental Display**   | `Funnel Display` | `"Funnel Sans", sans-serif`                                             | 400        | `https://hoplite.sh/fonts/funnel-display-latin-wght-normal.woff2` |
| **Interface / Prose**    | `Funnel Sans`    | `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif` | 400, 500   | `https://hoplite.sh/fonts/funnel-sans-latin-wght-normal.woff2`    |
| **Telemetry / Mono**     | `Geist Mono`     | `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace` | 400        | `https://hoplite.sh/fonts/geist-mono-wght-normal.woff2`           |
| **Editorial Accent**     | `Redaction`      | `serif` (Redaction 10, 20, 35, 50, 70, 100 Italic)                      | 400 Italic | `https://hoplite.sh/fonts/redaction-*-italic.woff2`               |
| **Watermark / Poster**   | `Bebas Neue`     | `sans-serif`                                                            | 400        | `https://hoplite.sh/fonts/bebas-neue-latin-400-normal.woff2`      |
| **Skeleton / Wireframe** | `Flow Rounded`   | `sans-serif`                                                            | 400        | `https://hoplite.sh/fonts/flow-rounded-regular.woff2`             |

### 3.2 Type Scale Table

| Context / Element           | Size (px / rem)   | Weight | Line Height    | Letter Spacing      | Text Transform | Example Usage on hoplite.sh                                       |
| --------------------------- | ----------------- | ------ | -------------- | ------------------- | -------------- | ----------------------------------------------------------------- |
| **Hero Title (H1)**         | 54px (3.375rem)   | 400    | 54px (1.0)     | -1.188px (-0.022em) | `none`         | "Hoplite" Hero headline with orange text gradient                 |
| **Major Section (H2)**      | 42px (2.625rem)   | 400    | 42px (1.0)     | -0.924px (-0.022em) | `none`         | "Deploy Into Every Part Of The Development", "Scale To Infinity"  |
| **Sub Section (H2)**        | 28px (1.750rem)   | 400    | 28px (1.0)     | -0.616px (-0.022em) | `none`         | "From Local To Cloud Agents In Four Steps", "FAQ"                 |
| **Feature Lead**            | 24px (1.500rem)   | 500    | 24px (1.0)     | -0.240px (-0.010em) | `none`         | Key feature introductions                                         |
| **Primary Body**            | 16.1px (1.01rem)  | 400    | 22.1px (1.37)  | -0.177px (-0.011em) | `none`         | Descriptive paragraphs, card descriptions                         |
| **Interactive UI / Button** | 14px / 16.1px     | 500    | 16.8px–22px    | -0.177px            | `none`         | "Download for Mac", "Start free", nav menu items                  |
| **Eyebrow / Category**      | 11.25px (0.70rem) | 400    | 22.1px (1.96)  | +1.125px (+0.100em) | `uppercase`    | Section category tags ("PRODUCT", "CAPABILITIES") in `Geist Mono` |
| **Keyboard / Badge**        | 11.25px (0.70rem) | 400    | 15.75px (1.40) | +0.450px (+0.040em) | `none`         | `⌘K` command hint, numeric counters                               |

### 3.3 Typographic Rules of Engagement

1. **Mono is never used for sentences or body copy.** Mono (`Geist Mono`) is restricted to numeric data, keyboard shortcuts (`kbd`), commands, and uppercase category eyebrows.
2. **Display is never used for numbers.** `Funnel Display` is used exclusively for H1 and H2 editorial headers. Numbers inside instrument components are set in `Geist Mono` with `tabular-nums`.
3. **Redaction is purely ornamental.** Redaction Italic is loaded for single-word contrast accents on marketing headlines. It does not appear in interface chrome.

---

## 4. Spacing, Radius & Layout

### 4.1 Spacing Scale & Grid

Dembrandt detected a **custom grid** based on a strict 4px/8px industrial cadence with 2.2px/7.5px concentric insets:

| Spacing Value     | Rem Equivalent    | Frequency | Typical Element Context                                             |
| ----------------- | ----------------- | --------- | ------------------------------------------------------------------- |
| `1px` / `2px`     | 0.08rem / 0.15rem | 23        | Hairline gaps, micro-borders, button translation                    |
| `2.2px` / `2.6px` | 0.17rem / 0.20rem | 100       | Tight inner padding on chips and status pills                       |
| `4px`             | 0.25rem / 0.31rem | 23        | Internal icon-to-label gaps (`gap-[4px]`)                           |
| `6px` / `7.5px`   | 0.38rem / 0.47rem | 41        | Card container inner padding (`p-[7.5px]`), chip horizontal padding |
| `8px`             | 0.50rem / 0.62rem | 35        | Navigation gaps, flex item spacing (`gap-[8px]`)                    |
| `12px`            | 0.75rem / 0.92rem | 37        | Button horizontal padding (`px-[12px]`), section header gaps        |
| `16px`            | 1.00rem / 1.23rem | 11        | Card margin, column spacing                                         |
| `24px`            | 1.50rem / 1.85rem | 27        | Major component spacing                                             |
| `78px`            | 4.88rem / 6.00rem | 9         | Section padding vertical                                            |

### 4.2 Radius Hierarchy

Observed border radii mapped by component type:

- **Buttons (`surface-button`):** `12px` (`rounded-lg` in Tailwind v4)
- **Cards & Panels (`surface-card`):** `16px` (`rounded-[16px]`)
- **Outer Concentric Wrappers:** `20px` (`rounded-[20px]`)
- **Pills / Status Chips:** `14px` (`rounded-concentric`) / `20px`
- **Keyboard Shortcuts (`kbd`):** `3px` / `4px`
- **Inner Indicators / Dots:** `0.6px` / `1px` / `2.2px`

### 4.3 Layout Paradigms & Density

- **Navigation Header:** `sticky top-0 z-50`, height `51.5px`, transparent backdrop with child pill container. Desktop nav items (`Product`, `Docs`, `Pricing`) use `display: flex`, collapsing to a `size-[40px] md:hidden` hamburger trigger at `< 768px`.
- **Hero Structure:** Asymmetrical two-column grid at desktop (`1440px`), collapsing to a single-column stacked layout at `768px` and `390px`.
- **Card Grid & Sizing:** Fixed modular widths (`w-[231px]` sidebar cards, concentric preview panels) with tight internal padding (`7.5px`–`12px`), giving a high-density "cockpit instrument" feel rather than a loose marketing site.

---

## 5. Component Details

### 5.1 Buttons

#### Variant 1: Primary Tactile Button (`surface-button`)

- **Classes:** `inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-body font-medium whitespace-nowrap transition-[color,background-color,filter] surface-button text-secondary-foreground hover:brightness-110 focus-visible:brightness-110 active:translate-y-[0.5px] h-8 px-3`
- **Light State:**
  - Background: `rgb(252, 252, 252)`
  - Text Color: `rgb(37, 37, 37)` (`#252525`)
  - Border: `1px solid rgba(0, 0, 0, 0)`
  - Border Radius: `12px`
  - Shadow: `rgba(0, 0, 0, 0.04) 0px 3px 3px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px, rgb(255, 255, 255) 0px 0px 1px 0.5px inset`
- **Dark State:**
  - Background: `oklch(0.25 0 0)` (`#282828`)
  - Text Color: `oklch(0.95 0 0)` (`#f2f2f2`)
  - Border: `1px solid rgba(0, 0, 0, 0)`
  - Border Radius: `12px`
  - Shadow: `rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(255, 255, 255, 0.043) 1px 0px 0px 0px inset, rgba(255, 255, 255, 0.043) -1px 0px 0px 0px inset, rgba(0, 0, 0, 0.35) 0px -1px 0px 0px inset, rgba(0, 0, 0, 0.5) 0px 1px 2px 0px, rgba(0, 0, 0, 0.35) 0px 4px 8px -2px`
- **Hover:** `filter: brightness(1.10)`
- **Active / Press:** `transform: translateY(0.5px)`

#### Variant 2: Nav Ghost Button

- **Classes:** `text-[14px] leading-[1.2] whitespace-nowrap text-(--body) transition-opacity hover:opacity-60 flex items-center gap-[4px] outline-none`
- **Default:** Background `transparent`, text `rgba(18, 18, 18, 0.6)` (light) / `rgba(229, 229, 229, 0.6)` (dark).
- **Hover:** `opacity: 0.60`.

#### Variant 3: Active Chip / Segmented Option (`New thread`, `Threads`)

- **Classes:** `relative flex h-[32px] min-w-0 items-center text-left transition-[width,padding,gap] duration-200 motion-reduce:transition-none ease-[cubic-bezier(0.32,0.72,0,1)] w-full gap-[8px] px-[12px] bg-card-selected shadow-[var(--shadow-card-panel)] rounded-lg border-[0.714px] border-transparent`
- **Dark Inset:** `dark:border-(--art-face) dark:bg-(--art-face) dark:text-white dark:shadow-(--shadow-art-chip)`

### 5.2 Cards and Panels (`surface-card`)

- **Classes:** `surface-card rounded-[16px] border-[0.5px] border-(--panel-hairline) relative flex shrink-0 flex-col gap-[8px] overflow-hidden p-[7.5px]`
- **Light Computed:**
  - Background: `rgb(244, 244, 244)` (`#f4f4f4`)
  - Border: `1px solid rgba(18, 18, 18, 0.10)`
  - Radius: `16px`
  - Shadow: `rgba(0, 0, 0, 0.04) 0px 3px 3px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px, rgb(255, 255, 255) 0px 1px 0px 0px inset, rgba(255, 255, 255, 0.4) 0px -1px 0px 0px inset`
- **Dark Computed:**
  - Background: `rgb(29, 29, 29)` (`#1d1d1d`)
  - Border: `1px solid oklch(0.39 0 0)`
  - Radius: `16px`
  - Shadow: `rgba(0, 0, 0, 0.5) 0px 1px 2px 0px, rgba(255, 255, 255, 0.04) 0px 1px 0px 0px inset`

### 5.3 Badges and Chips

- **Concentric Pill Badge:**
  - Radius: `20px` (`rounded-[20px]`)
  - Background: `rgba(18, 18, 18, 0.1)` (light) / `rgba(229, 229, 229, 0.1)` (dark)
  - Border: `0.714px solid transparent`
  - Padding: `4px 12px`
  - Text: `14px`, `Funnel Sans` 500 weight.

---

## 6. Motion & Polish

### 6.1 Durations & Easings

- **Primary Mechanical Easing:** `cubic-bezier(0.32, 0.72, 0, 1)` (count: 24) — governs sidebar, drawers, and active tab transitions (`duration-200`).
- **Organic Fluid Easing:** `cubic-bezier(0.23, 1, 0.32, 1)` (count: 105) — matches Kestrel's `--ease-organic`.
- **Standard UI Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (count: 166) — button color transitions (`duration: 0.15s`).
- **Spring Bounce Animation:** `effort-pop` utilizes `linear(0 0%, 0.347 9.09%, 0.768 18.18%, 1.027 36.36%, 1 100%)` for numeric/badge pop-in.

### 6.2 Kinetic Patterns

- **Static Data Chrome:** Tables, borders, and housing chrome are completely static (zero continuous animation), preventing eye fatigue.
- **Micro-tactile Press:** Buttons translate `translateY(0.5px)` on active press.
- **Hero Title Text Gradient:**
  `radial-gradient(55% 170% at 89% 100%, rgb(255, 54, 22) 0%, rgba(248, 72, 44, 0.875) 6.6%, rgba(241, 90, 66, 0.75) 13.2%, rgba(227, 127, 111, 0.5) 26.4%, rgba(199, 199, 199, 0) 52.9%), linear-gradient(rgb(18, 18, 18), rgb(18, 18, 18))` with `-webkit-background-clip: text`.

---

## 7. Screenshot & Evidence Index

| Screenshot File                                     | Resolution  | Description & Verified Elements                                                                                     |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `docs/audits/screenshots/hoplite-fullpage-1440.png` | 1440 × 6480 | Full landing inspection on desktop: hero title gradient, 3-tier card panels, pricing grid, concentric pill chips    |
| `docs/audits/screenshots/hoplite-dark-fullpage.png` | 1440 × 6480 | Full landing inspection under `color-scheme: dark`: obsidian `#121212` ground, `#1d1d1d` cards, dark button shadows |
| `docs/audits/screenshots/hoplite-1280.png`          | 1280 × 800  | Laptop desktop viewport: header navigation layout, 3-column feature grid                                            |
| `docs/audits/screenshots/hoplite-768.png`           | 768 × 1024  | Tablet viewport: navigation collapse, stacked card column                                                           |
| `docs/audits/screenshots/hoplite-390.png`           | 390 × 844   | Mobile viewport: full hamburger menu activation (`size-[40px]`), full-width cards                                   |
| `docs/audits/screenshots/hoplite-primary-cta.png`   | Component   | Close-up of primary tactile CTA button (`surface-button`) showing specular inset bevel                              |
| `docs/audits/screenshots/hoplite-card.png`          | Component   | Close-up of `surface-card` with `p-[7.5px]`, `rounded-[16px]`, and `0.5px` border                                   |
| `docs/audits/screenshots/hoplite-nav.png`           | Component   | Close-up of sticky header navigation container                                                                      |

### Discrepancy Analysis: Dembrandt vs Live Computed Styles

1. **Light/Dark Semantic Detection:** Dembrandt evaluated the default DOM in light mode (since the landing page serves light mode by default with `dark:` variants). Playwright live evaluation with `emulateMedia({ colorScheme: 'dark' })` was required to extract the dark CSS custom variables (`dark:[--ground:#121212]`, `dark:[--card:#1d1d1d]`, etc.).
2. **Radius Floor:** Dembrandt identified raw subpixel radii down to `0.6px` (used for micro-dots and indicators); the macro component radii are clearly `12px` (`rounded-lg`) and `16px` (`rounded-[16px]`).

---

## 8. Benchmark Implications for Kestrel

Comparison between Hoplite ground truth and Kestrel's declarations in `apps/web/src/app/globals.css`:

| Token                | Hoplite Observed                                     | Kestrel Declared                                   | Status        | Concrete Recommendation                                                                                           |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--color-bg`         | `#121212`                                            | `#121212`                                          | **MATCH**     | Keep as-is. Ground canvas is identical.                                                                           |
| `--color-bg-elev-1`  | `#161616` (well) / `#1d1d1d` (card)                  | `#1a1a1a`                                          | **DRIFT**     | Replace linear hexes with semantic roles: define `--color-well: #161616` and `--color-card: #1d1d1d`.             |
| `--color-bg-elev-2`  | `#1d1d1d`                                            | `#242424`                                          | **DRIFT**     | `#242424` is too bright. Recenter elevated panels to `#1d1d1d` to preserve obsidian contrast.                     |
| `--color-bg-elev-3`  | `oklch(0.25 0 0)` (`#282828`)                        | `#2d2d2d`                                          | **DRIFT**     | Lower chip background from `#2d2d2d` to `#262626`–`#282828`.                                                      |
| `--color-border`     | `oklch(0.39 0 0)` / `#2c2c2c`                        | `#2c2c2c`                                          | **MATCH**     | Keep `#2c2c2c` for containers; use `rgba(255,255,255,0.08)` for interior hairlines.                               |
| `--color-fg`         | `#e5e5e5` (`rgb(229, 229, 229)`)                     | `#f0f0f0`                                          | **DRIFT**     | Soften stark `#f0f0f0` to `#e5e5e5` to reduce eye fatigue across dense market tables.                             |
| `--color-fg-muted`   | `rgba(229, 229, 229, 0.60)`                          | `#8e8e8e`                                          | **DRIFT**     | Switch to alpha-blended ink (`var(--color-fg) / 60%`) so muted text tints correctly across wells and panels.      |
| `--color-brand`      | `#ff3616`                                            | `#ff3616`                                          | **MATCH**     | Exact match (`rgb(255, 54, 22)`). Keep as-is.                                                                     |
| `--radius-sm`        | `4px`                                                | `4px`                                              | **MATCH**     | Wells and inputs match Hoplite's `4px`.                                                                           |
| `--radius-md`        | `6px` / `8px`                                        | `6px`                                              | **MATCH**     | Tight panel chips match Hoplite.                                                                                  |
| `--radius-lg`        | `12px`                                               | `8px`                                              | **DRIFT**     | Hoplite uses `12px` (`rounded-lg`) for primary buttons and interactive chips. Adjust `--radius-lg` to `12px`.     |
| `--radius-xl`        | `16px`                                               | `12px`                                             | **DRIFT**     | Hoplite cards use `16px` (`rounded-[16px]`). Kestrel components had `rounded-xl` mapped to 12px.                  |
| `--shadow-chip`      | Stacked 5-layer shadow + 1.429px top inset highlight | Stacked 5-layer shadow + 1.429px inset             | **MATCH**     | Kestrel's `--shadow-chip` math in `globals.css:149` is identical to Hoplite.                                      |
| Card Backdrop Blur   | `none` (opaque `#1d1d1d`)                            | `backdrop-blur-md`                                 | **VIOLATION** | **Remove `backdrop-blur` from `card.tsx` and dashboard containers.** True Hoplite uses opaque panels + hairlines. |
| Button Active Motion | `active:translate-y-[0.5px]`                         | none                                               | **MISSING**   | Add `active:translate-y-[0.5px]` to `components/ui/button.tsx` to replicate Hoplite's tactile keyboard feel.      |
| Header Stack         | Single 51.5px sticky band                            | 4 stacked dividers (topbar, ticker, session, tabs) | **DRIFT**     | Consolidate Kestrel's 4 stacked borders into a single header band with recessed well strips.                      |
