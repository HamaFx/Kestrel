---
name: mdxcn
description: >-
  Draws plain-text figures for Kestrel documentation, pull requests and audits.
  Use when a write-up describes a rollout, an incident, a migration, a tradeoff,
  a release checklist, a bundle or table delta, or any ranked or tabular data
  where a framed text figure scans faster than bullets. Produces the mdxcn
  `+--- [ TITLE ] ---+` dialect only. Never produces Mermaid, SVG, a screenshot,
  or homemade ASCII art.
---

# Figures for Kestrel docs

Kestrel writes figures as fenced text. They survive code review, `grep`, copy-paste and agent reading, which images and Mermaid do not.

The templates, the chooser and the grammar live in `docs/figures.md`. Read that file before writing a figure. This skill is the trigger and the rules.

## When to use

Reach for a figure when the paragraph is describing one of these:

- a rollout or a dated sequence: a timeline
- an incident or a postmortem: a timeline, then a status strip
- a migration still running: a meter
- a release gate or a punch list: checkboxes
- what a change added, removed or kept: a diff
- a tradeoff or an ADR: two options, then the decision
- numbers that belong in columns: a table
- a ranked list: rank

Do not use a figure for a one-sentence note, a decorative header, or anything that needs a real chart with axes. Kestrel product charts are `lightweight-charts`; figures are for prose.

## Host

This repo has no MDX. Paste the fenced figure into the Markdown file, PR body or issue comment. Do not import a React component, do not add a dependency, do not suggest installing mdxcn. The React registry is out of scope here.

## Rules

- At most two figures per section. Prose between them.
- Copy the closest template from `docs/figures.md` and change the labels. Keep the frame, the corner `+`, the `[ TITLE ]` and the gutter.
- Titles are short and uppercase. Labels are lowercase (`auth middleware`, not `AuthMiddleware`).
- One row carries the emphasis (`●` or `**bold**`). The rest recede. No second accent colour, no emoji.
- Never invent ASCII art, never emit Mermaid or SVG, never paste a screenshot of a chart.
- Keep the body inside 50 columns so it fits a 390px viewport without sideways scroll.
- Run `pnpm check:figures` after editing. It fails on drifted padding and on glyphs outside the sanctioned set.

## Full catalog

The official fence for all 47 components, the chooser and the grammar are at <https://mdxcn.dev/llms.txt> (`## MDX`). Fetch it only when `docs/figures.md` has no suitable template; it is large.

## Where this lives

This file is the project copy, discovered by Claude Code at `.claude/skills/mdxcn`. A generic version for every project on this machine is at `~/.config/opencode/skills/mdxcn/SKILL.md`; OpenCode prefers it over this one, and it defers to `docs/figures.md` when a repo has one. Keep the shared rules in step if you change either.
