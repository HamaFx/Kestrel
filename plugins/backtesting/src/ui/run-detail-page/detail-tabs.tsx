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

// Trades / diagnostics / source tabs for the run detail page.
import { IconCode } from '@tabler/icons-react';
import type { z } from 'zod';

import type { RunDetailSchema } from '../../schemas';
import { fmtDate } from '../format';
import { TradeTable } from '../trade-table';
import type { DetailTab } from './state';

type RunDetail = z.infer<typeof RunDetailSchema>;

export function DetailTabs({
  run,
  tab,
  onTab,
}: {
  run: RunDetail;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
}) {
  return (
    <>
      <div className="border-border/60 flex items-center gap-1 border-b pb-1">
        {(
          [
            ['trades', `Trades (${run.trades.length})`],
            ['diagnostics', `Diagnostics (${run.rejectedSignals.length})`],
            ['source', 'Strategy source'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={
              tab === id
                ? 'bg-bg-elev-2 text-fg border-brand/40 rounded-md border px-3 py-1.5 text-xs font-semibold'
                : 'text-fg-subtle hover:text-fg rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'trades' ? <TradeTable trades={run.trades} limit={500} showDates /> : null}

      {tab === 'diagnostics' ? <DiagnosticsPanel run={run} /> : null}

      {tab === 'source' ? (
        <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2">
            <IconCode className="text-fg-subtle size-3.5" />
            <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
              Exact source
            </h3>
            <span className="text-fg-subtle ml-auto font-mono text-[10px]">
              params {JSON.stringify(run.params)}
            </span>
          </div>
          <pre className="border-border/40 bg-bg-elev-1/50 text-fg-muted max-h-[520px] overflow-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed">
            {run.source}
          </pre>
        </section>
      ) : null}
    </>
  );
}

function DiagnosticsPanel({ run }: { run: RunDetail }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
        <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
          Rejected signals
        </h3>
        {run.rejectedSignals.length === 0 ? (
          <p className="text-fg-subtle text-xs">None.</p>
        ) : (
          <ul className="divide-border/40 flex max-h-72 flex-col divide-y overflow-auto">
            {run.rejectedSignals.map((rejection, index) => (
              <li key={`${rejection.signalTime}-${index}`} className="flex flex-col gap-0.5 py-1.5">
                <span className="text-fg-muted text-xs">{rejection.reason}</span>
                <span className="text-fg-subtle font-mono text-[10px]">
                  bar {rejection.signalIndex} · {fmtDate(rejection.signalTime)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
        <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
          Strategy logs
        </h3>
        {run.logs.length === 0 ? (
          <p className="text-fg-subtle text-xs">The strategy did not log anything.</p>
        ) : (
          <pre className="border-border/40 bg-bg-elev-1/50 text-fg-muted max-h-72 overflow-auto rounded-md border p-2 font-mono text-[10px] whitespace-pre-wrap">
            {run.logs.join('\n')}
          </pre>
        )}
      </section>
    </div>
  );
}
