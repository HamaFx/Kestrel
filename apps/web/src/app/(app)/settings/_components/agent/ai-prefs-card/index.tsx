'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { IconBolt, IconX } from '@tabler/icons-react';
import Link from 'next/link';

import { updateAiPrefsAction } from '@/app/(app)/settings/actions';

import { INSTRUCTION_PRESETS } from './instruction-presets';
import { useAiPrefs } from './use-ai-prefs';

export type { AIPrefs } from './use-ai-prefs';
export { AI_PREFS_STORAGE_KEY } from './use-ai-prefs';
export type { InstructionPreset } from './instruction-presets';
export { appendPreset, getPreset, INSTRUCTION_PRESETS } from './instruction-presets';

/**
 * Card on /settings → "AI Preferences".
 *
 * Owns two distinct concerns:
 *   1. Custom instructions — appended to the AI's system prompt on
 *      every chat turn. Works today.
 *   2. (No longer here) Per-domain model selectors. The previous
 *      version of this card exposed fundamentalModel / technicalModel
 *      / summaryModel selectors, but those values were only consumed
 *      by the plan-then-act planner and the title-generation path —
 *      not the main chat turn. The actual chat-turn model lives in
 *      `user_settings.default_models` (DB) and is set via the
 *      /settings/models browser.
 *
 *      Removing the misleading selectors here; users who want to
 *      change the chat model follow the "Manage models →" link below.
 */
export function AIPrefsCard({
  initialCustomInstructions,
}: {
  initialCustomInstructions?: string | null;
}) {
  const { customInstructions, hydrated, confirmEl, update, handleInstructionsChange, applyPreset } =
    useAiPrefs(initialCustomInstructions);

  if (!hydrated) return null;

  return (
    <section
      aria-labelledby="ai-prefs-heading"
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4"
    >
      <header className="flex items-center gap-3 pb-1">
        <h2 id="ai-prefs-heading" className="text-fg text-base font-semibold tracking-tight">
          AI Preferences
        </h2>
        <Link
          href="/settings/models"
          className="text-fg-subtle hover:text-fg text-caption ml-auto inline-flex items-center gap-1 font-medium transition-colors"
        >
          Manage models
          <span aria-hidden="true">→</span>
        </Link>
      </header>

      <p className="text-fg-muted text-xs">
        Model choices are server-side and apply to every chat turn. Use the header link above to
        manage which models handle each kind of analysis.
      </p>

      <div className="flex flex-col gap-2 pt-1 pb-1">
        <label htmlFor="custom-instructions" className="text-fg text-sm font-medium">
          Custom instructions
        </label>
        <p className="text-fg-muted text-xs">
          Appended to the AI&rsquo;s core instructions on every turn. Use this to change formatting,
          personality, or behaviour.
        </p>

        {/* Phase A — UX_UPGRADE_PLAN.md item 6.
            Preset chips. Each chip replaces the textarea content
            (after a confirm if non-empty); the + button on the chip
            appends instead. The Clear button empties the field. */}
        <div className="flex flex-wrap items-center gap-2">
          {INSTRUCTION_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="border-border bg-bg-elev-2 text-caption inline-flex items-center overflow-hidden rounded-sm border"
            >
              <button
                type="button"
                onClick={() => applyPreset(preset.id, 'replace')}
                aria-label={`Apply preset "${preset.label}" (replace existing instructions)`}
                className="hover:bg-bg-elev-3 text-fg-muted hover:text-fg px-3 py-1 transition-colors"
              >
                <IconBolt className="mr-1 inline size-3 align-text-bottom" aria-hidden="true" />
                {preset.label}
              </button>
              <button
                type="button"
                onClick={() => applyPreset(preset.id, 'append')}
                aria-label={`Append preset "${preset.label}" to existing instructions`}
                title="Append to existing"
                className="border-border text-fg-subtle hover:text-fg hover:bg-bg-elev-3 -ml-px border-l px-2 py-1 transition-colors"
              >
                +
              </button>
            </div>
          ))}
          {customInstructions.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                update('customInstructions', '');
                updateAiPrefsAction('');
              }}
              className="text-fg-subtle hover:text-fg text-caption ml-1 inline-flex items-center gap-1 px-2 py-1 transition-colors"
              aria-label="Clear custom instructions"
            >
              <IconX className="size-3" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>

        <textarea
          id="custom-instructions"
          value={customInstructions}
          onChange={(e) => handleInstructionsChange(e.target.value)}
          placeholder="e.g. Always respond in bullet points. Do not use emojis."
          rows={3}
          className="border-border bg-bg-elev-2 text-fg placeholder:text-fg-muted focus:ring-fg resize-none rounded-sm border p-3 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <p className="text-fg-subtle text-caption tracking-wider uppercase">Saved to account</p>
      {confirmEl}
    </section>
  );
}
