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

// Saved backtest run detail page.
//
// This barrel keeps the previous `./run-detail-page` import path working;
// state lives in `use-run-detail.ts` and each section is its own component.
import type { PluginPageProps } from '@kestrel/plugin-sdk/ui';
import { IconAlertTriangle, IconArrowLeft, IconLoader2 } from '@tabler/icons-react';
import Link from 'next/link';

import { MetricsGrid } from '../metrics-grid';
import { DetailTabs } from './detail-tabs';
import { EquitySection } from './equity-section';
import { RunHeader } from './run-header';
import { useRunDetail } from './use-run-detail';

export function BacktestRunPage({ params }: PluginPageProps) {
  const runId = params['runId'] ?? '';
  const detail = useRunDetail(runId);

  if (detail.loading) {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-6 text-sm">
        <IconLoader2 className="text-brand size-4 animate-spin" />
        <span className="text-fg-muted">Loading backtest run…</span>
      </div>
    );
  }

  if (detail.error || !detail.run) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/plugins/backtesting"
          className="text-fg-subtle hover:text-fg inline-flex items-center gap-1.5 text-xs font-semibold"
        >
          <IconArrowLeft className="size-3.5" />
          Backtesting Lab
        </Link>
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{detail.error ?? 'Run not found.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RunHeader
        run={detail.run}
        deleting={detail.deleting}
        onDelete={() => void detail.remove()}
      />

      <MetricsGrid metrics={detail.run.metrics} />

      <EquitySection run={detail.run} />

      <DetailTabs run={detail.run} tab={detail.tab} onTab={detail.setTab} />
    </div>
  );
}
