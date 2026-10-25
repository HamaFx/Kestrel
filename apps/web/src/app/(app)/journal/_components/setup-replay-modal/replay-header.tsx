'use client';

// SPDX-License-Identifier: Apache-2.0

// Drawer header for the setup replay: symbol/side/outcome badge, description,
// and the replay-timeframe segmented control.
import type { JournalEntry, Timeframe } from '@kestrel/shared';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';

import { DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/formatters/cn';

interface ReplayHeaderProps {
  entry: JournalEntry;
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
}

export function ReplayHeader({ entry, timeframe, onTimeframeChange }: ReplayHeaderProps) {
  const isWin = entry.outcome === 'win';
  const isLoss = entry.outcome === 'loss';
  const isLong = entry.side === 'long';

  return (
    <DrawerHeader>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-10 items-center justify-center rounded-sm text-sm font-black',
              isLong ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear',
            )}
          >
            {isLong ? (
              <IconArrowUpRight className="size-6" />
            ) : (
              <IconArrowDownRight className="size-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <DrawerTitle className="text-base font-bold">
                {entry.symbol} {entry.side.toUpperCase()}
              </DrawerTitle>
              <span
                className={cn(
                  'rounded-xs px-2 py-0.5 text-xs font-black uppercase',
                  isWin && 'bg-bull/10 text-bull',
                  isLoss && 'bg-bear/10 text-bear',
                  entry.outcome === 'breakeven' && 'bg-neutral/10 text-neutral',
                  entry.outcome === 'open' && 'bg-info/10 text-info',
                )}
              >
                {entry.outcome}
              </span>
            </div>
            <DrawerDescription className="text-xs">
              Setup Replay & Historical Execution Diagnostics
            </DrawerDescription>
          </div>
        </div>

        <Segmented
          value={timeframe}
          onChange={(next) => onTimeframeChange(next as Timeframe)}
          options={[
            { value: '5m', label: '5M' },
            { value: '15m', label: '15M' },
            { value: '1h', label: '1H' },
            { value: '4h', label: '4H' },
          ]}
          ariaLabel="Replay timeframe"
          variant="solid"
        />
      </div>
    </DrawerHeader>
  );
}
