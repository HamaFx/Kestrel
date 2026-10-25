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
import { SYMBOLS, type Symbol, type TradeSide } from '@kestrel/shared';

import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { TagInput } from '@/components/ui/tag-input';

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
    <form onSubmit={form.submit} className="flex flex-col gap-4 px-4 pb-4">
      <Segmented<Symbol>
        label="Symbol"
        value={form.symbol}
        onChange={form.setSymbol}
        role="radiogroup"
        variant="solid"
        size="md"
        options={SYMBOLS.map((s) => ({ value: s, label: s }))}
      />

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

      <Button
        type="submit"
        size="lg"
        disabled={form.busy || !form.entry}
        loading={form.busy}
        className="mt-2"
      >
        {form.busy ? 'Saving…' : 'Save entry'}
      </Button>
    </form>
  );
}
