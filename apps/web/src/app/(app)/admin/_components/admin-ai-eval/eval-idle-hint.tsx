'use client';

// SPDX-License-Identifier: Apache-2.0

// Idle-state hint shown before an AI eval run starts.
import { IconFlask } from '@tabler/icons-react';

export function EvalIdleHint() {
  return (
    <div className="border-border border-warn/30 bg-warn/5 text-fg-muted mt-4 flex items-start gap-2 rounded-sm border p-3 text-xs">
      <IconFlask className="text-warn mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Keep this tab open while the run is in progress. Each prompt creates a fresh thread, waits
        for the Mastra report, and moves to the next. When it finishes, open{' '}
        <strong className="text-fg">AI Compare</strong> to review Mastra-vs-legacy rows.
      </span>
    </div>
  );
}
