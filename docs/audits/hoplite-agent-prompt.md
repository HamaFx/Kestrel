# Hoplite Inspection — Agent Prompt

> Copy-paste this entire file as the prompt for the other AI agent (the one with `dembrandt` + `playwright` MCPs). It will produce `docs/audits/hoplite-inspection.md` that you can send back.

---

You are a Principal Product Designer + Staff Frontend Engineer. Your job is to produce a **ground-truth visual inspection of https://hoplite.sh** that another agent will use as the design benchmark for auditing `apps/web` of Kestrel (`https://github.com/HamaFx/Kestrel`).

Do not hallucinate. Report only observed values. Every color, spacing, radius, font, shadow, and border you report must come from a tool extraction or computed style — not memory.

## Context

Kestrel is an AI-powered market research assistant for Forex/Gold/Crypto. Its design system in `apps/web/src/app/globals.css` claims to follow the Hoplite aesthetic (obsidian dark palette, hairline borders, recessed wells, chamfered chips, tabular mono data). We need to verify what Hoplite _actually_ ships on https://hoplite.sh so we can flag drift in Kestrel's tokens, surfaces, typography, spacing, and component consistency.

## Objective

Produce a single analysis file at `docs/audits/hoplite-inspection.md` (and optionally `docs/audits/hoplite-tokens.json` raw dump) that answers: what makes hoplite.sh feel high-precision/technical, and what exact tokens produce that feel.

## Phase A — Dembrandt token extraction (do in small batches, sync mode)

Run these extractions against `https://hoplite.sh` — one at a time, wait for completion before next:

1. `get_design_tokens` (full) with `pages: 3` and `wcag: true` — captures complete system
2. `get_color_palette` — report semantic roles (bg, bg-elev-1/2/3, border, divider, fg, fg-muted, fg-subtle, brand, bull/bear/success/danger/warn/info), every hex + RGB + LCH/OKLCH, usage frequency, confidence, CSS custom properties
3. `get_typography` — every font family + fallback stack + source (Google Fonts URL if any), type scale grouped by context (display/heading/body/caption/button/link/mono), size px+rem, weight, line-height, letter-spacing, text-transform
4. `get_spacing` — common margin/padding values by frequency, px+rem, detected grid scale (4px/8px/custom)
5. `get_surfaces` — border radii with element context (buttons vs cards vs inputs vs modals), border patterns (width+style+color), box-shadow elevation levels with exact values
6. `get_component_styles` — button variants with default/hover/active/focus states (bg, text color, padding, border-radius, border, shadow, outline, opacity), input styles, link styles, badge/tag styles
7. `get_brand_identity` — site name, logo source/dimensions, favicons, tech stack, icon systems, breakpoints
8. `get_motion` — durations, easings, per-component context, keyframe names, hover patterns, gradients

For each extraction: record the `job_id`, wait via `get_job_status`, save the raw JSON. Never invent a slot — if a token is absent, say "not observed".

## Phase B — Playwright live inspection (one action at a time)

1. `browser_navigate` to `https://hoplite.sh`, then `browser_snapshot` (full) and `browser_take_screenshot` (fullPage)
2. Inspect via `browser_snapshot` / `browser_evaluate`:
   - Compute the actual page background, card/panel backgrounds, border colors/widths, radius values (via `getComputedStyle` on hero, cards, buttons, inputs, nav, code blocks, tables)
   - Measure typography on: hero headline, section heading, body paragraph, mono price/badge, caption, button label, code block
   - Measure spacing: gap between nav items, card padding, section padding, grid gaps
   - Identify layout paradigms: nav type (sticky/fixed), hero structure, card grid, density
   - Capture interactive states: hover a primary button and a card, record `:hover` computed style changes
   - Test responsive: `browser_resize` to 390, 768, 1280, 1440 — note what changes
   - Check `prefers-color-scheme`, dark mode support, scrollbar styling
3. Record the exact CSS for 3 representative components: primary CTA button, a card/panel, and the navigation header (copy computed style block)

## Phase C — Synthesis (what the benchmark _means_)

Write `docs/audits/hoplite-inspection.md` with this exact structure:

### 1. Executive Summary (5 bullets)

What makes Hoplite feel precise/technical in one sentence per dimension.

### 2. Color & Surface System

- Palette table: token | hex | RGB | LCH | usage | WCAG contrast vs bg
- Surface hierarchy: ground → panel → chip → well — with bg/border/shadow/inset-highlight per level
- How depth is created (recess vs blur vs shadow) — with exact shadow values
- Border discipline: widths, colors (rgba), where hairlines are used vs not

### 3. Typography System

- Font stack table: role | family | fallbacks | weights | source
- Type scale table: context | size px/rem | weight | line-height | letter-spacing | transform
- Rules: when mono vs sans vs display is used (with examples from the page)

### 4. Spacing, Radius & Layout

- Spacing scale + grid detection
- Radius values by component
- Page layout, nav structure, card grid, density (compact/comfortable/spacious)

### 5. Component Details

- Button variants (primary/secondary/ghost) — all states with exact values
- Cards/panels, inputs, links, badges — same
- Table/code-block styling if present

### 6. Motion & Polish

- Durations, easings, hover/press patterns, any canvas/WebGL if present
- What is animated vs static

### 7. Screenshot & Evidence Index

- List of screenshots taken + what each shows
- dembrandt job_ids + extraction timestamps
- Any discrepancies between dembrandt tokens and computed styles

### 8. Benchmark Implications for Kestrel

For each Kestrel token in `apps/web/src/app/globals.css` (--color-bg, --color-bg-elev-_, --color-border, --color-fg-_, --color-brand, radii, shadows):

- Hoplite observed value vs Kestrel declared value — match / drift / missing
- Concrete recommendation (keep / adjust hex / replace shadow / remove blur)

## Quality Rules

- No invented values. If dembrandt says a slot is absent, write "not observed — no value".
- Prefer `sync: true` for single-page extractions to avoid job polling complexity, but either is fine.
- Run dembrandt jobs one at a time (small batches) to avoid rate limits.
- Save raw JSON dumps alongside the markdown for verification.
- Take at least one fullPage screenshot as evidence.

## Deliverable

- Primary: `docs/audits/hoplite-inspection.md` (human-readable, structured as above)
- Optional: `docs/audits/hoplite-tokens.json` (raw merged dembrandt output)
- Both must be written to disk so the user can upload them back.

Start with `get_design_tokens` for hoplite.sh and proceed sequentially.
