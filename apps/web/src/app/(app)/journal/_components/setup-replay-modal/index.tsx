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

// Setup replay drawer: fetches the replay window for the selected timeframe
// and composes the header controls, candle chart, stats grid, and levels.
import type { JournalEntry, Timeframe } from '@kestrel/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { apiFetch } from '@/lib/http/api-client';
import type { TradeSetupReplayDTO } from '@/lib/services/journal';

import { ExecutionLevels } from './execution-levels';
import { ReplayChart } from './replay-chart';
import { ReplayHeader } from './replay-header';
import { ReplayStatsGrid } from './replay-stats-grid';

interface SetupReplayModalProps {
  entry: JournalEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetupReplayModal({ entry, open, onOpenChange }: SetupReplayModalProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');

  const { data, isLoading, isError, error } = useQuery<{ replay: TradeSetupReplayDTO }>({
    queryKey: ['journal-replay', entry?.id, timeframe],
    queryFn: async () => {
      if (!entry) throw new Error('No entry provided');
      return apiFetch<{ replay: TradeSetupReplayDTO }>(
        `/api/journal/${entry.id}/replay?timeframe=${timeframe}`,
      );
    },
    enabled: open && !!entry?.id,
    staleTime: 60_000,
  });

  const replay = data?.replay;

  if (!entry) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <ReplayHeader entry={entry} timeframe={timeframe} onTimeframeChange={setTimeframe} />

        <div className="flex flex-col gap-6 p-4 pt-0">
          {replay?.stats.replayWindowFallback && (
            <div className="border-warn/30 bg-warn/10 text-warn rounded-sm border px-3 py-2 text-xs">
              Historical trade window predates provider intraday retention for{' '}
              {timeframe.toUpperCase()} — showing latest available bars. Try switching to 1H or 4H
              for deeper historical coverage.
            </div>
          )}

          {/* Chart Area */}
          <ReplayChart replay={replay} isLoading={isLoading} isError={isError} error={error} />

          {/* Replay Analytics Metrics Grid */}
          {replay && <ReplayStatsGrid replay={replay} />}

          {/* Key Levels List */}
          <ExecutionLevels entry={entry} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
