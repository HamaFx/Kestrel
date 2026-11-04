# Figures in documentation

Kestrel docs use plain-text figures from [mdxcn](https://mdxcn.dev) instead of images or Mermaid. A figure is a fenced block, so it survives review, copy-paste, `grep`, and reading by an agent.

This repo has no MDX pipeline, so the fenced form is the only form used here. The React components at mdxcn.dev are not installed.

## Rules

- Figures go in Markdown only: `docs/**`, `README.md`, `CONTRIBUTING.md`, PR descriptions, issue comments.
- At most two figures per section, with prose between them.
- Copy a template from this file or the `.md` tab of the matching page on [mdxcn.dev/docs](https://mdxcn.dev/docs). Do not draw your own ASCII art and do not substitute Mermaid, SVG or a screenshot.
- Keep the frame: `+` corners, dashed top edge, `[ TITLE ]` on the top edge, one space of gutter inside the body.
- Swap labels, keep the widths. `pnpm check:figures` fails on a line whose padding drifted or a glyph outside the sanctioned set.
- Titles are short and uppercase. Labels are lowercase and plain (`auth middleware`, not `AuthMiddleware`).
- Mark the row that matters with `●` / `**bold**`; leave the rest to recede. Do not add a second accent colour.
- Dated, ordered work uses a timeline. A punch list uses checkboxes. Deltas use a diff. Do not restate a table as a timeline.

Existing diagrams in `docs/design-system.md` are hand-drawn with box-drawing characters and predate this rule. Leave them; new figures use the `+` dialect below. Do not mix the two dialects inside one document.

## Chooser

| The writing is about           | Use                                                         |
| ------------------------------ | ----------------------------------------------------------- |
| A dated sequence or rollout    | Timeline                                                    |
| Done / not done                | Check                                                       |
| What a change added or removed | Diff                                                        |
| Label and value rows           | Spec                                                        |
| Numbers in columns             | Table                                                       |
| One value between 0 and 1      | Meter                                                       |
| A ranked list                  | Rank (`- 12,400 /docs`, see mdxcn.dev/docs/graph-rank)      |
| Grouped tables                 | Sheet (`### Scope` + table, see mdxcn.dev/docs/graph-sheet) |

Anything else: the full chooser and the official fence for every component are in [llms.txt](https://mdxcn.dev/llms.txt) under `## MDX`.

## Grammar

The figure body is Markdown, so the marks mean something:

| Write            | Means                                                  |
| ---------------- | ------------------------------------------------------ |
| `**bold**`       | now, chosen, the total, the row to read                |
| `*italic*`       | next, rejected, an aside                               |
| `- label: value` | one row; the label is everything before the first `: ` |
| `x — note`       | a side note under the item                             |
| `- [x] done`     | a checked box; `[ ]` is open                           |
| `a → b → c`      | a path                                                 |
| `### heading`    | a section or column                                    |
| `\| table \|`    | a table; a bold last row is the footer                 |
| `ok*40`          | a run: forty `ok` values                               |

## Templates

### Timeline

```
+------------------- [ PHASE 7 ] --------------------+
|                                                    |
| ●  10-14  agent tool registry                      |
| │                                                  |
| ●  10-21  web state and debloat                    |
| │                                                  |
| ○  10-28  audit remainder                          |
+----------------------------------------------------+
```

### Check

```
+------------------- [ RELEASE ] --------------------+
|                                                    |
| [x]  postgres rls suite                            |
| [x]  static guards                                 |
| [ ]  bundle budget — pending                       |
+----------------------------------------------------+
```

### Diff

```
+-------------------- [ BUNDLE ] --------------------+
|                                                    |
|   vendor       84 kb                               |
| + app          31 kb                               |
| - sourcemaps   12 kb                               |
| ---------------------                              |
|   shipped     103 kb                               |
+----------------------------------------------------+
```

### Spec

```
+------------------- [ RUNTIME ] --------------------+
|                                                    |
| Node       22.22                                   |
| Postgres   16 + pgvector                           |
| pnpm       12                                      |
| Motion     14.3                                    |
+----------------------------------------------------+
```

### Meter

```
+------------------- [ BACKFILL ] -------------------+
|                                                    |
| [=========-----]  67%                              |
| users table, 1.2M of 1.8M rows                     |
+----------------------------------------------------+
```

### Table

```
+------------- [ WHAT THE AUDIT COST ] --------------+
|                                                    |
| Agent              | Tokens | Time                 |
| -------------------+-------+-----                  |
| Architecture       | 115,207 | 16m                 |
| Security           | 135,218 | 16m                 |
| -------------------+-------+-----                  |
| Total              | 250,425 | 32m                 |
+----------------------------------------------------+
```

## Checking

```
pnpm check:figures
```

The guard walks `docs/**/*.md`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SUPPORT.md` and `DEPLOY.md`, and checks every block that opens with `+--- [`. It reports the file, line and expected width. It does not check prose, tables, or diagrams drawn with box-drawing characters.

## Provenance

The dialect and the glyph set belong to mdxcn (MIT, [shadcn-labs/mdxcn](https://github.com/shadcn-labs/mdxcn)). The component gallery, the chooser and every official fence are at [mdxcn.dev](https://mdxcn.dev). The agent skill is vendored at `.claude/skills/mdxcn/SKILL.md`.
