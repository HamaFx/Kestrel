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

// Ranked sweep results table.
import type { z } from 'zod';

import type { SweepResultSchema } from '../../schemas';
import { fmtMoney, fmtPct, toneClass } from '../format';

type SweepResult = z.infer<typeof SweepResultSchema>;

export function SweepResultsTable({ results }: { results: readonly SweepResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[11px]">
        <thead className="text-fg-subtle text-[10px] uppercase">
          <tr className="border-border/60 border-b">
            <th className="py-1.5 pr-2 font-semibold">Params</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Trades</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Win</th>
            <th className="py-1.5 pr-2 text-right font-semibold">PF</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Exp R</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Net P&L</th>
            <th className="py-1.5 text-right font-semibold">Score</th>
          </tr>
        </thead>
        <tbody>
          {results.slice(0, 20).map((result, index) => (
            <tr key={index} className="border-border/40 border-b">
              <td className="text-fg-muted max-w-64 truncate py-1.5 pr-2 font-mono text-[10px]">
                {JSON.stringify(result.params)}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {result.metrics?.trades ?? '—'}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {result.metrics ? fmtPct(result.metrics.winRate) : '—'}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {result.metrics?.profitFactor.toFixed(2) ?? '—'}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {result.metrics?.expectancyR.toFixed(2) ?? '—'}
              </td>
              <td
                className={`py-1.5 pr-2 text-right tabular-nums ${
                  result.metrics ? toneClass(result.metrics.netPnl) : ''
                }`}
              >
                {result.metrics ? fmtMoney(result.metrics.netPnl) : '—'}
              </td>
              <td className="py-1.5 text-right tabular-nums">{result.score?.toFixed(3) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
