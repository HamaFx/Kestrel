'use client';

// SPDX-License-Identifier: Apache-2.0

// Execution-levels summary for the setup replay: entry, stop, target, exit.
import type { JournalEntry } from '@kestrel/shared';

export function ExecutionLevels({ entry }: { entry: JournalEntry }) {
  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-sm border p-4">
      <h4 className="text-fg text-caption font-bold tracking-wider uppercase sm:text-xs">
        Execution Levels
      </h4>
      <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
        <div>
          <span className="text-fg-subtle text-caption block font-medium">Entry Price</span>
          <span className="text-info font-mono font-bold tabular-nums">{entry.entry}</span>
        </div>
        <div>
          <span className="text-fg-subtle text-caption block font-medium">Stop Loss</span>
          <span className="text-bear font-mono font-bold tabular-nums">{entry.stop ?? 'None'}</span>
        </div>
        <div>
          <span className="text-fg-subtle text-caption block font-medium">Take Profit Target</span>
          <span className="text-bull font-mono font-bold tabular-nums">
            {entry.target ?? 'None'}
          </span>
        </div>
        <div>
          <span className="text-fg-subtle text-caption block font-medium">Actual Exit</span>
          <span className="text-fg font-mono font-bold tabular-nums">{entry.exit ?? 'Open'}</span>
        </div>
      </div>
    </div>
  );
}
