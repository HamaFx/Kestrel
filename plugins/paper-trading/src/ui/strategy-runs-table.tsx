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
import {
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
} from '@tabler/icons-react';

import type { StrategyRunView } from '../schemas';
import { fmtDate } from './format';

export function StrategyRunsTable({
  runs,
  busyId,
  onAction,
  onDelete,
}: {
  runs: readonly StrategyRunView[];
  busyId: string | null;
  onAction: (run: StrategyRunView, action: 'pause' | 'resume' | 'stop') => void;
  onDelete: (run: StrategyRunView) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-6 text-center text-[11px]">
        No deployed strategies yet. Open a completed backtest and choose “Deploy to Paper Sandbox”.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {runs.map((run) => {
        const busy = busyId === run.id;
        return (
          <article
            key={run.id}
            className="border-border/60 bg-bg-elev-2/40 flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-fg truncate text-[11px] font-semibold">{run.name}</span>
                <span
                  className={
                    run.status === 'active'
                      ? 'text-bull border-bull/30 bg-bull/10 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase'
                      : run.status === 'paused'
                        ? 'text-warn border-warn/30 bg-warn/10 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase'
                        : run.status === 'error'
                          ? 'text-danger border-danger/30 bg-danger/10 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase'
                          : 'text-fg-subtle border-border/60 bg-bg-elev-3 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase'
                  }
                >
                  {run.status}
                </span>
              </div>
              <div className="text-fg-subtle mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px]">
                <span>
                  {run.symbol} · {run.timeframe} · risk {run.riskPct}%
                </span>
                <span>
                  {run.lastSignal
                    ? `${run.lastSignal} @ ${fmtDate(run.lastSignalAt ?? '')}`
                    : 'no signal yet'}
                </span>
                <span>
                  {run.orderCount} orders · {run.signalCount} signals
                </span>
                {run.lastBarTime ? <span>bar {fmtDate(run.lastBarTime)}</span> : null}
              </div>
              {run.lastError ? (
                <p className="text-danger mt-0.5 line-clamp-1 text-[10px]">{run.lastError}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              {run.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => onAction(run, 'pause')}
                  disabled={busy}
                  className="border-border/60 text-fg-muted hover:text-fg inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-40"
                >
                  {busy ? (
                    <IconLoader2 className="size-3 animate-spin" />
                  ) : (
                    <IconPlayerPause className="size-3" />
                  )}
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAction(run, 'resume')}
                  disabled={busy || run.status === 'stopped'}
                  className="border-border/60 text-fg-muted hover:text-fg inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-40"
                >
                  {busy ? (
                    <IconLoader2 className="size-3 animate-spin" />
                  ) : (
                    <IconPlayerPlay className="size-3" />
                  )}
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={() => onAction(run, 'stop')}
                disabled={busy || run.status === 'stopped'}
                className="text-fg-subtle hover:text-warn inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold disabled:opacity-40"
                title="Stop future entries"
              >
                <IconPlayerStop className="size-3" />
                Stop
              </button>
              <button
                type="button"
                onClick={() => onDelete(run)}
                disabled={busy}
                className="text-fg-subtle hover:text-danger inline-flex size-7 items-center justify-center rounded-md disabled:opacity-40"
                aria-label={`Delete ${run.name}`}
              >
                <IconTrash className="size-3.5" />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
