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

// Backtesting Lab page.
//
// This barrel keeps the previous `./backtest-page` import path working; state
// and effects live in `use-backtest-page.ts` and each section is its own
// component.
import type { PluginPageProps } from '@kestrel/plugin-sdk/ui';
import { IconAlertTriangle, IconChartLine, IconFlask, IconLoader2 } from '@tabler/icons-react';

import { SummaryStats } from './summary-stats';
import { TabBar } from './tab-bar';
import { TabPanels } from './tab-panels';
import { useBacktestPage } from './use-backtest-page';

export function BacktestingPage(_props: PluginPageProps) {
  const page = useBacktestPage();

  return (
    <div className="flex flex-col gap-4">
      <SummaryStats page={page} />

      <TabBar page={page} />

      {page.error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{page.error}</span>
        </div>
      ) : null}

      {page.queuedJobId ? (
        <div className="border-brand/30 bg-brand/5 text-brand flex items-center gap-2 rounded-lg border p-3 text-xs">
          <IconLoader2 className="size-4 animate-spin" />
          <span>
            Queued for the worker. {page.queueMessage ?? 'Waiting for a worker…'} Job{' '}
            <span className="font-mono">{page.queuedJobId.slice(0, 8)}</span>
          </span>
        </div>
      ) : null}

      <TabPanels page={page} />

      <footer className="text-fg-subtle flex items-center gap-2 text-[10px]">
        <IconFlask className="size-3" />
        {page.summary?.engineVersion ?? 'kestrel-engine-1'}
        <span className="text-border">·</span>
        <IconChartLine className="size-3" />
        Fills are next-bar; stop wins intrabar ties; costs applied on both sides.
      </footer>
    </div>
  );
}
