# SKILL.md format

A skill is a Markdown file with YAML frontmatter. Mastra validates it with
`validateSkillContent()`; the Agent Studio uses the same validator, so a file
that saves is a file the runtime can load.

```markdown
---
name: london-open-playbook
description: Use when the user asks for the London open liquidity sweep rules.
---

# London Open Playbook

1. Mark the Asian range high and low.
2. Wait for a sweep of one side in the first 90 minutes of London.
3. Require displacement away from the sweep.
4. Enter on the first unmitigated fair value gap in the direction of displacement.
5. Stop beyond the sweep; target the opposite side of the Asian range.
```

## Rules

- `name`: lowercase letters, numbers and hyphens; 1–64 characters.
- `description`: one sentence, written as a trigger ("Use when …").
- Body: the actual instructions. Prefer numbered rules over prose.
- Limits: 24,000 characters per skill in the Studio, 12 skills per agent.
- References are optional extra documents in a `references/` folder; when you
  paste a skill into the Studio, keep it self-contained.

## What makes a good skill

- It changes behaviour; it is not a summary of the product.
- It names concrete conditions, thresholds or time windows.
- It states what invalidates the rule.
- It does not contain secrets, API keys or personal data.

## `.agent.md` import

The Studio can import a whole agent definition from Markdown. Frontmatter is
optional:

```markdown
---
name: My Macro Agent
description: Rates and dollar transmission.
model: openai:gpt-5
---

You are a macro analyst. ...
```

Without frontmatter, the first `# Heading` becomes the name and the rest is
treated as instructions.
