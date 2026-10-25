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

// Parameter-sweep form: strategy/symbol/timeframe/objective choice and the
// parameter grid.
import { IconFlask, IconLoader2, IconPlus, IconX } from '@tabler/icons-react';
import type { z } from 'zod';

import type { StrategySummarySchema } from '../../schemas';
import { inputClass, OBJECTIVES, TIMEFRAMES } from './constants';
import type { SweepPanelController } from './use-sweep-panel';

type StrategySummary = z.infer<typeof StrategySummarySchema>;

export function SweepControls({
  panel,
  strategies,
}: {
  panel: SweepPanelController;
  strategies: readonly StrategySummary[];
}) {
  return (
    <section className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2">
        <IconFlask className="text-brand size-4" />
        <h2 className="text-fg text-sm font-semibold">Parameter sweep</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-fg-subtle text-[10px] font-semibold uppercase">Strategy</span>
          <select
            value={panel.strategyId}
            onChange={(event) => panel.setStrategyId(event.target.value)}
            className={inputClass}
          >
            {strategies.length === 0 ? <option value="">No saved strategies</option> : null}
            {strategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-fg-subtle text-[10px] font-semibold uppercase">Symbol</span>
          <input
            value={panel.symbol}
            onChange={(event) => panel.setSymbol(event.target.value.toUpperCase())}
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-fg-subtle text-[10px] font-semibold uppercase">Timeframe</span>
          <select
            value={panel.timeframe}
            onChange={(event) => panel.setTimeframe(event.target.value as typeof panel.timeframe)}
            className={inputClass}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-fg-subtle text-[10px] font-semibold uppercase">Objective</span>
          <select
            value={panel.objective}
            onChange={(event) => panel.setObjective(event.target.value as typeof panel.objective)}
            className={inputClass}
          >
            {OBJECTIVES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-fg-subtle text-[10px] font-semibold uppercase">Max combos</span>
          <input
            type="number"
            min={1}
            max={200}
            value={panel.maxCombinations}
            onChange={(event) => panel.setMaxCombinations(Number(event.target.value) || 1)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-fg-subtle text-[10px] font-semibold uppercase">Min trades</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={panel.minTrades}
            onChange={(event) => panel.setMinTrades(Number(event.target.value) || 1)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-fg-subtle text-[10px] font-semibold uppercase">Parameter grid</span>
          <button
            type="button"
            onClick={() => panel.setParams((rows) => [...rows, { name: '', values: '' }])}
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-[10px] font-semibold"
          >
            <IconPlus className="size-3" />
            Add parameter
          </button>
        </div>
        {panel.params.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={row.name}
              onChange={(event) =>
                panel.setParams((rows) =>
                  rows.map((item, i) =>
                    i === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
              placeholder="paramName"
              className={`${inputClass} max-w-44 font-mono`}
              maxLength={40}
            />
            <input
              value={row.values}
              onChange={(event) =>
                panel.setParams((rows) =>
                  rows.map((item, i) =>
                    i === index ? { ...item, values: event.target.value } : item,
                  ),
                )
              }
              placeholder="1, 2, 3"
              className={`${inputClass} font-mono`}
            />
            <button
              type="button"
              onClick={() => panel.setParams((rows) => rows.filter((_, i) => i !== index))}
              disabled={panel.params.length === 1}
              className="text-fg-subtle hover:text-danger inline-flex size-8 shrink-0 items-center justify-center rounded-md disabled:opacity-30"
              aria-label="Remove parameter"
            >
              <IconX className="size-3.5" />
            </button>
          </div>
        ))}
        <p className="text-fg-subtle text-[10px]">
          Values are typed automatically (numbers when numeric). The product of all value lists must
          stay under the max-combination limit.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void panel.startSweep()}
        disabled={panel.busy || strategies.length === 0}
        className="bg-brand/10 text-brand border-brand/30 hover:bg-brand/20 inline-flex h-9 items-center gap-1.5 self-start rounded-md border px-3 text-xs font-semibold disabled:opacity-40"
      >
        {panel.busy ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : (
          <IconFlask className="size-3.5" />
        )}
        Run sweep
      </button>
    </section>
  );
}
