'use client';

// SPDX-License-Identifier: Apache-2.0

// Notes textarea with a live character counter for the entry form.
import { Textarea } from '@/components/ui/textarea';

interface NotesFieldProps {
  notes: string;
  onChange: (value: string) => void;
}

export function NotesField({ notes, onChange }: NotesFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="notes"
        label="Notes (optional)"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Setup rationale, news context, levels of interest…"
        maxLength={5000}
        rows={4}
      />
      <p className="text-fg-subtle text-caption text-right tabular-nums">
        {notes.length.toLocaleString()} / 5,000
      </p>
    </div>
  );
}
