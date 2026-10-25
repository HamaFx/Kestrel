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

// Recent sweep list with a refresh control.
import { IconLoader2, IconRefresh } from '@tabler/icons-react';

import type { SweepPanelController } from './use-sweep-panel';

export function SweepList({ panel }: { panel: SweepPanelController }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-fg text-sm font-semibold">Recent sweeps</h2>
        <button
          type="button"
          onClick={() => void panel.load()}
          disabled={panel.loading}
          className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-[10px] font-semibold disabled:opacity-40"
        >
          {panel.loading ? (
            <IconLoader2 className="size-3 animate-spin" />
          ) : (
            <IconRefresh className="size-3" />
          )}
          Refresh
        </button>
      </div>
      {panel.sweeps.length === 0 ? (
        <p className="text-fg-subtle text-[11px]">No sweeps yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {panel.sweeps.map((sweep) => (
            <li key={sweep.id}>
              <button
                type="button"
                onClick={() => void panel.openSweep(sweep.id)}
                className="border-border/50 hover:bg-bg-elev-2/50 flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left"
              >
                <span className="min-w-0">
                  <span className="text-fg block truncate text-[11px] font-semibold">
                    {sweep.name}
                  </span>
                  <span className="text-fg-subtle block font-mono text-[10px]">
                    {sweep.symbol} · {sweep.timeframe} · {sweep.status} · {sweep.completed}/
                    {sweep.total}
                  </span>
                </span>
                <span className="text-fg-subtle shrink-0 font-mono text-[10px]">
                  {sweep.bestScore !== null ? sweep.bestScore.toFixed(2) : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
