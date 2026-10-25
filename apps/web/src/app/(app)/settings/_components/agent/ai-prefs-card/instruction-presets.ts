// SPDX-License-Identifier: Apache-2.0

// Preset custom-instruction prompts for the AI preferences card, plus the
// pure helpers used to look one up and to append it to existing text.

export interface InstructionPreset {
  id: 'concise' | 'technical' | 'challenge' | 'sources' | 'risk';
  label: string;
  prompt: string;
}

/**
 * Phase A — UX_UPGRADE_PLAN.md item 6.
 * Preset prompts the user can apply with one tap. Each preset
 * REPLACES the current `customInstructions` field (with a confirm
 * if the field is non-empty) and writes through `update()` so the
 * change persists to localStorage immediately.
 *
 * Append mode (`appendPreset`) joins the preset text to the existing
 * value with a blank line separator — used by the "Append" button
 * next to each chip.
 */
export const INSTRUCTION_PRESETS: readonly InstructionPreset[] = [
  {
    id: 'concise',
    label: 'Be concise',
    prompt: 'Reply in 2-3 sentences max. Lead with the answer.',
  },
  {
    id: 'technical',
    label: 'Be technical',
    prompt:
      'Use precise terminology. Cite indicator names and timeframes explicitly. Show your reasoning.',
  },
  {
    id: 'challenge',
    label: 'Challenge my bias',
    prompt:
      'When I state a directional view, give me the strongest counter-argument before agreeing.',
  },
  {
    id: 'sources',
    label: 'Cite sources inline',
    prompt: 'After every factual claim, cite the tool or data point that supports it.',
  },
  {
    id: 'risk',
    label: 'Risk-first',
    prompt:
      'For any trade idea, lead with position sizing, stop placement, and R:R. Bias toward capital preservation.',
  },
] as const;

/** Find a preset by id; returns null when not found. */
export function getPreset(id: string): InstructionPreset | null {
  return INSTRUCTION_PRESETS.find((p) => p.id === id) ?? null;
}

/** Join a preset's prompt to existing instructions with a blank line. */
export function appendPreset(current: string, presetId: string): string {
  const p = getPreset(presetId);
  if (!p) return current;
  const trimmed = current.trim();
  const safeCurrent = typeof current === 'string' ? trimmed : '';
  if (safeCurrent.length === 0) return p.prompt;
  return `${safeCurrent}\n\n${p.prompt}`;
}
