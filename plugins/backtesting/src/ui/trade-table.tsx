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
import type { z } from 'zod';

import type { BacktestTradeSchema } from '../schemas';
import { fmtDate, fmtMoney, fmtNumber, fmtPrice, fmtR, toneClass } from './format';

type Trade = z.infer<typeof BacktestTradeSchema>;

function reasonLabel(reason: Trade['exitReason']): string {
  switch (reason) {
    case 'stop_loss':
      return 'Stop';
    case 'take_profit':
      return 'Target';
    case 'trailing_stop':
      return 'Trail';
    case 'max_bars':
      return 'Time';
    case 'end_of_data':
      return 'EOD';
    case 'manual':
      return 'Manual';
  }
}

export function TradeTable({
  trades,
  limit = 10,
  showDates = false,
}: {
  trades: readonly Trade[];
  limit?: number;
  showDates?: boolean;
}) {
  const rows = trades.slice(-limit).reverse();

  if (rows.length === 0) {
    return (
      <div className="border-border/50 text-fg-subtle rounded-lg border border-dashed p-4 text-center text-xs">
        No trades were closed in this run.
      </div>
    );
  }

  return (
    <div className="border-border/50 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="bg-bg-elev-2/60 text-fg-subtle font-mono text-[10px] uppercase">
          <tr>
            <th className="px-2.5 py-2 font-semibold">#</th>
            <th className="px-2.5 py-2 font-semibold">Side</th>
            {showDates ? <th className="px-2.5 py-2 font-semibold">Entry</th> : null}
            <th className="px-2.5 py-2 text-right font-semibold">In</th>
            <th className="px-2.5 py-2 text-right font-semibold">Out</th>
            <th className="px-2.5 py-2 text-right font-semibold">Qty</th>
            <th className="px-2.5 py-2 text-right font-semibold">P&L</th>
            <th className="px-2.5 py-2 text-right font-semibold">R</th>
            <th className="px-2.5 py-2 font-semibold">Exit</th>
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {rows.map((trade) => (
            <tr key={trade.id} className="hover:bg-bg-elev-1/40">
              <td className="text-fg-subtle px-2.5 py-1.5 font-mono tabular-nums">{trade.id}</td>
              <td className="px-2.5 py-1.5">
                <span
                  className={
                    trade.side === 'long'
                      ? 'bg-bull/10 text-bull rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase'
                      : 'bg-bear/10 text-bear rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase'
                  }
                >
                  {trade.side}
                </span>
              </td>
              {showDates ? (
                <td className="text-fg-subtle px-2.5 py-1.5 font-mono text-[10px]">
                  {fmtDate(trade.entryTime)}
                </td>
              ) : null}
              <td className="text-fg-muted px-2.5 py-1.5 text-right font-mono tabular-nums">
                {fmtPrice(trade.entryPrice)}
              </td>
              <td className="text-fg-muted px-2.5 py-1.5 text-right font-mono tabular-nums">
                {fmtPrice(trade.exitPrice)}
              </td>
              <td className="text-fg-subtle px-2.5 py-1.5 text-right font-mono tabular-nums">
                {fmtNumber(trade.quantity, 2)}
              </td>
              <td
                className={`px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums ${toneClass(
                  trade.pnl,
                )}`}
              >
                {fmtMoney(trade.pnl)}
              </td>
              <td
                className={`px-2.5 py-1.5 text-right font-mono tabular-nums ${toneClass(
                  trade.rMultiple,
                )}`}
              >
                {fmtR(trade.rMultiple)}
              </td>
              <td className="text-fg-subtle px-2.5 py-1.5 text-[10px]">
                {reasonLabel(trade.exitReason)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
