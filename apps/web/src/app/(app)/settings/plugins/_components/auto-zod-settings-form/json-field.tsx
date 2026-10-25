'use client';

// SPDX-License-Identifier: Apache-2.0

// JSON textarea control with inline parse-error reporting.
import { useState } from 'react';

import { cn } from '@/lib/formatters/cn';

export function JsonField({
  id,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  error?: string | undefined;
}) {
  const initial = typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
  const [draft, setDraft] = useState(initial);
  const [parseError, setParseError] = useState<string | null>(null);

  function commit(next: string) {
    setDraft(next);
    if (next.trim().length === 0) {
      setParseError(null);
      onChange(undefined);
      return;
    }
    try {
      onChange(JSON.parse(next));
      setParseError(null);
    } catch {
      setParseError('Enter valid JSON');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        id={id}
        value={draft}
        disabled={disabled}
        spellCheck={false}
        rows={5}
        onChange={(event) => commit(event.target.value)}
        className={cn(
          'bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:bg-bg-elev-1/80',
          'w-full rounded-sm border px-4 py-3 font-mono text-sm',
          error || parseError
            ? 'border-danger/60 focus:ring-danger/30 focus:ring-2 focus:outline-none'
            : 'border-border focus:outline-none',
        )}
      />
      {(error || parseError) && (
        <p role="alert" className="text-danger text-xs">
          {parseError ?? error}
        </p>
      )}
    </div>
  );
}
