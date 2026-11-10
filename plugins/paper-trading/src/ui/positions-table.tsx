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
import { IconLoader2, IconX } from '@tabler/icons-react';
import type { z } from 'zod';

import type { PositionSchema } from '../schemas';
import {
  fmtDate,
  fmtMoney,
  fmtPrice,
  fmtQty,
  fmtR,
  PLUGIN_UI_CLASSES,
  toneClass,
} from './format';

type Position = z.infer<typeof PositionSchema>;

export function PositionsTable({
  positions,
  busyId,
  onClose,
  compact = false,
}: {
  positions: readonly Position[];
  busyId?: string | null;
  onClose?: (position: Position, half: boolean) => void;
  compact?: boolean;
}) {
  if (positions.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-subtle rounded-xl border border-dashed p-6 text-center text-xs">
        No Open Positions. Place a paper order to open one.
      </div>
    );
  }

  return (
    <div className={PLUGIN_UI_CLASSES.tableWrap}>
      <table
        data-slot="table"
        className={`${PLUGIN_UI_CLASSES.table} ${compact ? 'min-w-[560px]' : 'min-w-[860px]'}`}
      >
        <thead data-slot="table-header" className={PLUGIN_UI_CLASSES.tableHead}>
          <tr>
            <th className="px-2.5 py-2 font-semibold">Market</th>
            <th className="px-2.5 py-2 font-semibold">Side</th>
            <th className="px-2.5 py-2 text-right font-semibold">Qty</th>
            <th className="px-2.5 py-2 text-right font-semibold">Entry</th>
            {compact ? null : (
              <>
                <th className="px-2.5 py-2 text-right font-semibold">SL</th>
                <th className="px-2.5 py-2 text-right font-semibold">TP</th>
              </>
            )}
            <th className="px-2.5 py-2 text-right font-semibold">Unrealized P&L</th>
            <th className="px-2.5 py-2 text-right font-semibold">R</th>
            {compact ? null : <th className="px-2.5 py-2 font-semibold">Opened</th>}
            {onClose ? <th className="px-2.5 py-2" /> : null}
          </tr>
        </thead>
        <tbody data-slot="table-body" className={PLUGIN_UI_CLASSES.tableBody}>
          {positions.map((position) => {
            const open = position.status === 'open';
            return (
              <tr key={position.id} data-slot="table-row" className={PLUGIN_UI_CLASSES.tableRow}>
                <td className="px-2.5 py-2">
                  <div className="flex flex-col">
                    <span className="text-fg font-mono text-xs font-semibold">
                      {position.symbol}
                    </span>
                    <span className="text-fg-subtle text-[11px]">{position.accountName}</span>
                  </div>
                </td>
                <td className="px-2.5 py-2">
                  <span
                    className={
                      position.side === 'long'
                        ? 'bg-bull/10 text-bull rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase'
                        : 'bg-bear/10 text-bear rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase'
                    }
                  >
                    {position.side}
                  </span>
                </td>
                <td className="text-fg px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtQty(position.quantity)}
                </td>
                <td className="text-fg-muted px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtPrice(position.entryPrice)}
                </td>
                {compact ? null : (
                  <>
                    <td className="text-fg-muted px-2.5 py-2 text-right font-mono tabular-nums">
                      {fmtPrice(position.stopLoss)}
                    </td>
                    <td className="text-fg-muted px-2.5 py-2 text-right font-mono tabular-nums">
                      {fmtPrice(position.takeProfit)}
                    </td>
                  </>
                )}
                <td
                  className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${toneClass(
                    position.pnl,
                  )}`}
                >
                  {fmtMoney(position.pnl)}
                </td>
                <td
                  className={`px-2.5 py-2 text-right font-mono tabular-nums ${toneClass(
                    position.rMultiple,
                  )}`}
                >
                  {fmtR(position.rMultiple)}
                </td>
                {compact ? null : (
                  <td className="text-fg-subtle px-2.5 py-2 font-mono text-[11px]">
                    {open
                      ? fmtDate(position.entryTime)
                      : `${position.closeReason ?? 'closed'} · ${fmtDate(position.closeTime ?? position.entryTime)}`}
                  </td>
                )}
                {onClose && open ? (
                  <td className="px-2.5 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onClose(position, true)}
                        disabled={busyId !== null}
                        className="surface-button text-fg-subtle hover:text-fg focus-visible:ring-brand inline-flex h-8 items-center rounded-lg border border-white/[0.09] px-2.5 text-[11px] font-semibold transition-all focus:outline-none focus-visible:ring-2 disabled:opacity-40"
                      >
                        Close 50%
                      </button>
                      <button
                        type="button"
                        onClick={() => onClose(position, false)}
                        disabled={busyId !== null}
                        className="text-fg-subtle hover:text-danger focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-40"
                        aria-label={`Close ${position.symbol}`}
                      >
                        {busyId === position.id ? (
                          <IconLoader2 className="size-3.5 animate-spin" />
                        ) : (
                          <IconX className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                ) : onClose ? (
                  <td />
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
