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

// Wires the form (in a Drawer), list, stats summary, and performance curve together.
// Implements an advanced, responsive two-column grid on desktop, showing the equity curve and list
// on the left, and stats summary / analytics on the right.
import type { JournalEntry, JournalStats } from '@kestrel/shared';
import { IconActivity, IconPlus, IconRefresh, IconUpload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PerformanceChart } from '@/components/chart/performance-chart';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Segmented } from '@/components/ui/segmented';
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { cn } from '@/lib/formatters/cn';
import { apiFetch } from '@/lib/http/api-client';

import { EntryForm } from '../entry-form';
import { EntryList } from '../entry-list';
import { ImportTrades } from '../import-trades';
import { StatsSummary } from '../stats-summary';
import { JournalAnalyticsTab } from './journal-analytics-tab';
import { RecentExecutions } from './recent-executions';

const QKEY = ['journal'] as const;

interface JournalResponse {
  entries: JournalEntry[];
  stats: JournalStats;
}

export function JournalView({ initialData }: { initialData?: JournalResponse } = {}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'analytics' | 'trades'>('overview');
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isFetching, isError, error } = useQuery<JournalResponse>({
    queryKey: QKEY,
    queryFn: async () => {
      return apiFetch<JournalResponse>('/api/journal');
    },
    initialData,
    staleTime: 10_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: QKEY });

  return (
    <div className="animate-in fade-in flex flex-col gap-6 duration-300">
      <PageHeader
        title="Trade Journal"
        description="Log, tag, and audit your executions, R-multiples, and behavioral edge."
      >
        <div className="flex flex-wrap items-center gap-2">
          <StaleIndicator isFetching={isFetching && !isLoading} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setImportOpen(true)}
            aria-label="Import trades"
          >
            <IconUpload className="size-4" aria-hidden="true" />
            Import
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} aria-label="Refresh logs">
            <IconRefresh
              className={cn('size-4', isFetching && 'animate-spin')}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <IconPlus className="size-4" aria-hidden="true" />
            Log Trade
          </Button>
        </div>
      </PageHeader>

      {/* Main Responsive Grid Layout */}
      {isLoading ? (
        <div role="status" className="flex h-[350px] flex-col items-center justify-center gap-2.5">
          <IconActivity aria-hidden="true" className="text-fg size-6 animate-pulse" />
          <p className="text-fg-muted text-xs font-bold tracking-wider uppercase">
            Loading your metrics...
          </p>
        </div>
      ) : isError ? (
        <div className="border-danger/20 bg-danger/5 flex flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center">
          <p className="text-danger text-sm font-semibold" role="alert">
            Failed to load journal portfolio
          </p>
          <p className="text-fg-subtle text-xs">
            {(error as Error)?.message || 'Unknown network error'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Segmented
            value={tab}
            onChange={(next) => setTab(next as typeof tab)}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'analytics', label: 'Analytics' },
              { value: 'trades', label: 'Trades' },
            ]}
            ariaLabel="Journal view"
            role="tablist"
            variant="solid"
            groupId="journal-tabs"
          />

          {tab === 'overview' && (
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
              {/* Left Column: Equity curve and entries list (occupies 2/3 of desktop width) */}
              <div className="flex flex-col gap-6 lg:col-span-2">
                {/* Cum R Equity Curve */}
                <PerformanceChart entries={data?.entries ?? []} />

                {/* Newest executions preview — the full filterable table lives
                    in the Trades tab. */}
                <RecentExecutions
                  entries={data?.entries ?? []}
                  onViewAll={() => setTab('trades')}
                />
              </div>

              {/* Right Column: IconKey performance metrics & analytics (occupies 1/3 of desktop width) */}
              <div className="lg:col-span-1">
                {data?.stats ? (
                  <div className="sticky top-[calc(var(--topbar-h)+24px+env(safe-area-inset-top,0px))] flex flex-col gap-6 lg:top-0">
                    <StatsSummary stats={data.stats} entries={data.entries} />
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {tab === 'analytics' && data?.stats && (
            <JournalAnalyticsTab entries={data.entries} stats={data.stats} />
          )}

          {tab === 'trades' && (
            <EntryList entries={data?.entries ?? []} onClosed={refresh} onDeleted={refresh} />
          )}
        </div>
      )}

      {/* Slide-over Trade entry Logger Drawer */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-display text-fg text-lg font-normal tracking-[-0.03em]">
              Log New Position
            </DrawerTitle>
            <DrawerDescription className="text-fg-subtle text-xs">
              Record entry, size, stop-loss, and target. Outcome stats calculate automatically upon
              trade closure.
            </DrawerDescription>
          </DrawerHeader>
          <EntryForm
            onCreated={() => {
              refresh();
              setOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>

      {/* Import Trades Drawer */}
      <Drawer open={importOpen} onOpenChange={setImportOpen}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-display text-fg text-lg font-normal tracking-[-0.03em]">
              Import Trades
            </DrawerTitle>
            <DrawerDescription className="text-fg-subtle text-xs">
              Upload a CSV file to bulk-import your trading history.
            </DrawerDescription>
          </DrawerHeader>
          <ImportTrades
            onImported={() => {
              refresh();
              setImportOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
