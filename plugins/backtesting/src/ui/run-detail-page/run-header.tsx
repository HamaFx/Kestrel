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

// Run header: identity, net P&L summary and the delete action.
import { IconArrowLeft, IconLoader2, IconTrash } from '@tabler/icons-react';
import type { z } from 'zod';

import type { RunDetailSchema } from '../../schemas';
import { fmtDate, fmtMoney, fmtNumber, fmtPct, toneClass } from '../format';

type RunDetail = z.infer<typeof RunDetailSchema>;

export function RunHeader({
  run,
  deleting,
  onDelete,
}: {
  run: RunDetail;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-3">
        <a
          href="/plugins/backtesting"
          className="text-fg-subtle hover:text-fg mt-1 inline-flex size-7 items-center justify-center rounded-md"
          aria-label="Back to Backtesting Lab"
        >
          <IconArrowLeft className="size-4" />
        </a>
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-fg text-lg font-semibold tracking-tight">{run.name}</h2>
            <span className="bg-bg-elev-2 text-fg-subtle rounded px-2 py-0.5 font-mono text-[10px] uppercase">
              {run.symbol} · {run.timeframe}
            </span>
            {run.truncated ? (
              <span className="bg-warn/10 text-warn rounded px-2 py-0.5 font-mono text-[10px] uppercase">
                preview
              </span>
            ) : null}
          </div>
          <p className="text-fg-subtle font-mono text-[11px]">
            {run.bars} bars · {fmtDate(run.from)} → {fmtDate(run.to)} · {run.trades.length} trades ·{' '}
            {run.engineVersion}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p
            className={`font-mono text-lg font-bold tabular-nums ${toneClass(run.metrics.netPnl)}`}
          >
            {fmtMoney(run.metrics.netPnl)}
          </p>
          <p className={`font-mono text-[11px] ${toneClass(run.metrics.returnPct)}`}>
            {fmtPct(run.metrics.returnPct)} · {fmtNumber(run.metrics.expectancyR, 2)}R avg
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="text-fg-subtle hover:text-danger border-border/60 inline-flex size-9 items-center justify-center rounded-md border transition-colors disabled:opacity-50"
          aria-label="Delete run"
        >
          {deleting ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconTrash className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
