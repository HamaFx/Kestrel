'use client';

// SPDX-License-Identifier: Apache-2.0

// Notes textarea with a live character counter for the entry form.
interface NotesFieldProps {
  notes: string;
  onChange: (value: string) => void;
}

export function NotesField({ notes, onChange }: NotesFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-fg-subtle text-body-sm tracking-wide uppercase" htmlFor="notes">
        Notes (optional)
      </label>
      <textarea
        id="notes"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="thesis, news context, levels of interest…"
        maxLength={5000}
        rows={4}
        className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle border-border focus:bg-bg-elev-1/80 focus:ring-fg/30 w-full resize-y rounded-sm border px-4 py-3 text-base leading-[1.4] transition-all duration-150 ease-in-out focus:ring-2 focus:outline-none"
      />
      <p className="text-fg-subtle text-caption text-right tabular-nums">
        {notes.length.toLocaleString()} / 5,000
      </p>
    </div>
  );
}
