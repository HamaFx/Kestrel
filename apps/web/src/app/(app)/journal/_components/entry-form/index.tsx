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

// New journal-entry form. Mobile-first: stacked, all tap targets ≥ 44px,
// CTA is the size-lg primary button so it sits in the thumb zone of the
// drawer.
import { DEFAULT_WATCHLIST_SYMBOLS, SYMBOLS, type Symbol, type TradeSide } from '@kestrel/shared';

import { Field } from '@/components/ui/field';
import { HoldToExecuteButton } from '@/components/ui/hold-to-execute-button';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { cn } from '@/lib/formatters/cn';

import { MindsetSelector } from './mindset-selector';
import { NotesField } from './notes-field';
import { PriceFields } from './price-fields';
import { ScreenshotField } from './screenshot-field';
import { useEntryForm } from './use-entry-form';

interface EntryFormProps {
  onCreated?: () => void;
}

export function EntryForm({ onCreated }: EntryFormProps) {
  const form = useEntryForm({ onCreated });

  return (
    <form
      onSubmit={form.submit}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
    >
      <div className="flex flex-col gap-2">
        <Field label="Symbol" htmlFor="journal-symbol">
          <Select
            id="journal-symbol"
            value={form.symbol}
            onChange={(e) => form.setSymbol(e.target.value as Symbol)}
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-fg-subtle font-mono text-[10px] uppercase">Quick pick:</span>
          {DEFAULT_WATCHLIST_SYMBOLS.map((s) => {
            const active = form.symbol === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => form.setSymbol(s)}
                className={cn(
                  'rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors',
                  active
                    ? 'border-brand/50 bg-brand/15 text-brand'
                    : 'border-white/10 bg-white/[0.03] text-fg-muted hover:text-fg',
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <Segmented<TradeSide>
        label="Side"
        value={form.side}
        onChange={form.handleSideChange}
        role="radiogroup"
        variant="tone"
        size="md"
        options={[
          { value: 'long', label: 'LONG ↑', tone: 'bull' },
          { value: 'short', label: 'SHORT ↓', tone: 'bear' },
        ]}
      />

      <PriceFields
        entry={form.entry}
        stop={form.stop}
        target={form.target}
        size={form.size}
        fieldErrors={form.fieldErrors}
        onEntryChange={form.handleEntryChange}
        onEntryBlur={form.handleEntryBlur}
        onStopChange={form.handleStopChange}
        onStopBlur={form.handleStopBlur}
        onTargetChange={form.handleTargetChange}
        onTargetBlur={form.handleTargetBlur}
        onSizeChange={form.handleSizeChange}
      />

      <NotesField notes={form.notes} onChange={form.setNotes} />

      <ScreenshotField
        screenshotUrl={form.screenshotUrl}
        uploading={form.uploadingScreenshot}
        onPick={form.handleScreenshotPick}
        onRemove={form.removeScreenshot}
      />

      <MindsetSelector tags={form.tags} onToggle={form.toggleTag} />

      <TagInput
        value={form.tags}
        onChange={form.setTags}
        suggestions={form.tagSuggestions}
        placeholder="Add tags (e.g. London breakout, trend continuation)"
        label="Tags"
      />

      {form.error ? (
        <p className="text-danger text-sm" role="alert">
          {form.error}
        </p>
      ) : null}

      <HoldToExecuteButton
        size="lg"
        variant="brand"
        disabled={form.busy || !form.entry}
        onExecute={() => form.submit()}
        label={form.busy ? 'Saving…' : 'Hold to Log Trade (1.2s)'}
        executingLabel="Recording Trade…"
        completedLabel="Trade Logged"
        className="mt-2 min-h-[48px] w-full"
      />
    </form>
  );
}
