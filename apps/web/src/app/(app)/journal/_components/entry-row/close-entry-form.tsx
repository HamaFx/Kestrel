'use client';

// SPDX-License-Identifier: Apache-2.0

// Inline manual close-price form for an open journal entry.
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CloseEntryFormProps {
  entryId: string;
  exit: string;
  error: string | null;
  busy: boolean;
  onExitChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function CloseEntryForm({
  entryId,
  exit,
  error,
  busy,
  onExitChange,
  onSave,
  onCancel,
}: CloseEntryFormProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
      <div>
        <label
          className="text-fg-subtle text-caption font-bold tracking-wider uppercase"
          htmlFor={`exit-${entryId}`}
        >
          Exit Price (Close Trade)
        </label>
        <Input
          id={`exit-${entryId}`}
          value={exit}
          onChange={(ev) => onExitChange(ev.target.value)}
          inputMode="decimal"
          autoFocus
          className="surface-well mt-1.5 rounded-lg border-white/10 focus:border-white/20"
        />
        {error ? <p className="text-danger mt-2 text-xs font-semibold">{error}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="md"
          onClick={onSave}
          disabled={busy || !exit}
          className="flex-1 rounded-lg active:translate-y-[0.5px]"
        >
          Save
        </Button>
        <Button
          type="button"
          size="md"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg active:translate-y-[0.5px]"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
