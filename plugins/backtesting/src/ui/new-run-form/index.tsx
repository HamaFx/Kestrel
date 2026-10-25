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

// New-backtest form.
//
// This barrel keeps the previous `./new-run-form` import path working; state
// lives in `use-new-run-form.ts` and each field group is its own component.
import { IconAlertTriangle, IconFlask, IconLoader2, IconPlayerPlay } from '@tabler/icons-react';
import type { z } from 'zod';

import type { StrategySummarySchema } from '../../schemas';
import { AdvancedFields } from './advanced-fields';
import { BasicFields } from './basic-fields';
import { inputClass, type Prefill } from './constants';
import { SourceFields } from './source-fields';
import { useNewRunForm } from './use-new-run-form';

type StrategySummary = z.infer<typeof StrategySummarySchema>;

export function NewRunForm({
  strategies,
  prefill,
  onStarted,
  onQueued,
}: {
  strategies: readonly StrategySummary[];
  prefill: Prefill | null;
  onStarted: (runId: string) => void;
  onQueued: (jobId: string) => void;
}) {
  const form = useNewRunForm({ strategies, prefill, onStarted, onQueued });

  return (
    <form
      onSubmit={form.submit}
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-md">
            <IconFlask className="size-4" />
          </span>
          <div>
            <h2 className="text-fg text-sm font-semibold">New backtest</h2>
            <p className="text-fg-subtle text-[11px]">
              Deterministic, next-bar fills, stop-first tie-breaks, real costs.
            </p>
          </div>
        </div>
        {strategies.length > 0 ? (
          <select
            value={form.strategyId}
            onChange={(event) => void form.loadStrategy(event.target.value)}
            className={inputClass}
            aria-label="Load a saved strategy"
          >
            <option value="">Load saved strategy…</option>
            {strategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <BasicFields form={form} />

      {form.advanced ? <AdvancedFields form={form} /> : null}

      <SourceFields form={form} />

      {form.error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{form.error}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="text-fg-subtle inline-flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={form.background}
            onChange={(event) => form.setBackground(event.target.checked)}
            className="border-border/60 size-3.5 rounded border accent-[var(--brand)]"
          />
          Run in background (worker)
        </label>
        <button
          type="submit"
          disabled={form.busy || form.source.trim().length < 20}
          className="bg-brand inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {form.busy ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconPlayerPlay className="size-4" />
          )}
          {form.busy
            ? form.background
              ? 'Queueing…'
              : 'Running…'
            : form.background
              ? 'Queue backtest'
              : 'Run backtest'}
        </button>
      </div>
    </form>
  );
}
