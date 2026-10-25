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

// Trade-journal synchronization after a position closes.

import { createJournalEntry } from '@kestrel/db';

import { updatePosition } from '../db/queries';
import type { PaperAccountRow, PaperPositionRow } from '../db/tables';
import { outcomeFor, type PositionCloseReason } from '../domain';
import type { PaperSettings } from '../settings';

export async function syncJournal(args: {
  position: PaperPositionRow;
  account: PaperAccountRow;
  exitPrice: number;
  pnl: number;
  recordedQuantity: number;
  reason: PositionCloseReason;
  settings: PaperSettings;
  closedAt: Date;
  onError?: (err: unknown) => void;
}): Promise<string | null> {
  if (!args.settings.autoJournal || args.position.journalEntryId) return null;
  try {
    const rMultiple =
      args.position.initialRiskAmount > 0 ? args.pnl / args.position.initialRiskAmount : 0;
    const entry = await createJournalEntry({
      userId: args.position.userId,
      symbol: args.position.symbol,
      side: args.position.side === 'short' ? 'short' : 'long',
      openedAt: args.position.entryTime,
      closedAt: args.closedAt,
      entry: args.position.entryPrice,
      stop: args.position.stopLoss,
      target: args.position.takeProfit,
      exit: args.exitPrice,
      size: args.recordedQuantity,
      outcome: outcomeFor(args.pnl),
      rMultiple: Math.round(rMultiple * 10_000) / 10_000,
      notes: [
        `Paper trade · ${args.account.name} (${args.account.mode})`,
        `Closed: ${args.reason}`,
        args.position.notes,
      ]
        .filter(Boolean)
        .join(' · '),
      tags: ['paper', `paper-${args.account.mode}`, args.position.symbol],
    });
    await updatePosition(args.position.userId, args.position.id, {
      journalEntryId: entry.id,
    });
    return entry.id;
  } catch (err) {
    args.onError?.(err);
    return null;
  }
}
