// SPDX-License-Identifier: Apache-2.0

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
import { IconCheck, IconCpu, IconLoader2 } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/formatters/cn';
import { apiMutate } from '@/lib/http/api-client';

/** Q2 decision: exactly two analysis modes — `single` and `full`. */
type AnalysisMode = 'single' | 'full';

const MODE_OPTIONS: Array<{
  value: AnalysisMode;
  label: string;
  description: string;
  latencyS: number;
  costMultiplier: number;
}> = [
  {
    value: 'single',
    label: 'Single-desk',
    description: 'One technical desk. Use Full for the 4-desk committee.',
    latencyS: 2,
    costMultiplier: 1,
  },
  {
    value: 'full',
    label: 'Full',
    description: '4-desk committee deliberation, verified',
    latencyS: 8,
    costMultiplier: 4,
  },
];

/** Map a legacy persisted default onto the two-mode schema (Q2 compat shim). */
function normalizeInitialMode(value: string): AnalysisMode {
  return value === 'full' || value === 'standard' ? 'full' : 'single';
}

interface AnalysisModeFormProps {
  /** Persisted default; legacy values normalize onto the two-mode schema (Q2). */
  initialMode: string;
  showOpinions: boolean;
}

export function AnalysisModeForm({
  initialMode,
  showOpinions: initialShowOpinions,
}: AnalysisModeFormProps) {
  const [mode, setMode] = useState<AnalysisMode>(normalizeInitialMode(initialMode));
  const [showOpinions, setShowOpinions] = useState(initialShowOpinions);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasChanges = mode !== initialMode || showOpinions !== initialShowOpinions;

  function save() {
    startTransition(async () => {
      try {
        await apiMutate('/api/settings/analysis-mode', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            defaultAnalysisMode: mode,
            showAgentOpinions: showOpinions,
          }),
        });
        setSaved(true);
        toast.success('Analysis mode saved');
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  return (
    <section aria-labelledby="analysis-mode-heading" className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <IconCpu className="text-fg-muted size-4" />
        <h2 id="analysis-mode-heading" className="text-fg-muted text-sm font-medium">
          Analysis Mode
        </h2>
      </header>
      <p className="text-fg-muted text-xs">
        Choose how the AI analyzes your questions. Multi-agent modes use specialized agents that run
        in parallel for deeper analysis.
      </p>
      <p className="text-fg-subtle text-caption">
        Time and cost multipliers are upper-bound estimates for planning; actual usage is reconciled
        from model tokens.
      </p>

      <div className="flex flex-col gap-2">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            aria-pressed={mode === opt.value}
            className={cn(
              'flex items-center justify-between gap-3 rounded-sm border p-3 text-left transition-colors',
              mode === opt.value
                ? 'border-border bg-bg-elev-1'
                : 'border-border bg-bg-elev-1 hover:border-border',
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-fg text-sm font-medium">{opt.label}</span>
              <span className="text-fg-muted text-xs">{opt.description}</span>
              {opt.latencyS > 0 && (
                <span className="text-fg-subtle text-caption tabular-nums">
                  ~{opt.latencyS}s · {opt.costMultiplier}× cost
                </span>
              )}
            </div>
            {mode === opt.value && <IconCheck className="text-fg size-4 shrink-0" />}
          </button>
        ))}
      </div>

      <label className="mt-1 flex items-center gap-2">
        <input
          type="checkbox"
          checked={showOpinions}
          onChange={(e) => setShowOpinions(e.target.checked)}
          className="border-border size-4 rounded-sm"
        />
        <span className="text-fg-muted text-sm">Show agent opinions in chat</span>
      </label>

      {hasChanges && (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-fg hover:bg-fg/90 inline-flex items-center gap-2 self-start rounded-sm px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          {pending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : saved ? (
            <IconCheck className="size-4" />
          ) : null}
          {saved ? 'Saved' : 'Save changes'}
        </button>
      )}
    </section>
  );
}
