// SPDX-License-Identifier: Apache-2.0

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

// Phase 1.6 — Equity curve widget.
//
// Wraps the existing `PerformanceChart` so it fits the dashboard's
// widget chrome. We trim the chart's own header so the surrounding
// canvas label remains the primary visual anchor.
import type { JournalEntry } from '@kestrel/shared';
import { IconChartLine } from '@tabler/icons-react';

import { PerformanceChart } from '@/components/chart/performance-chart';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface EquityCurveWidgetProps {
  entries: readonly JournalEntry[];
}

export function EquityCurveWidget({ entries }: EquityCurveWidgetProps) {
  return (
    <Card as="section" aria-label="Equity curve">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconChartLine className="text-fg-subtle size-4" aria-hidden="true" />
          <div>
            <h2 className="text-fg text-body-sm font-semibold">Performance</h2>
            <p className="text-fg-subtle text-caption">Cumulative R-multiple</p>
          </div>
        </div>
        <Badge tone="neutral">Closed trades</Badge>
      </header>
      <div className="border-divider border-t pt-3">
        <PerformanceChart entries={[...entries]} height={200} />
      </div>
    </Card>
  );
}
