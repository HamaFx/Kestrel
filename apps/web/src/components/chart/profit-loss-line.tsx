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

// SPDX-License-Identifier: Apache-2.0

// Sign-coloured profit/loss curve built directly on `bklit-tanstack-charts`.
// Combines Bklit's `LineChart`, `ProfitLossLine` (with interactive
// `ProfitLossLegend` segment highlighting), soft area shading, `Segment`
// drag-to-measure range selection, and Kestrel's recessed well chrome.
import {
  Area,
  ProfitLossLine as BklitProfitLossLine,
  ChartTooltip,
  Grid,
  Line,
  LineChart,
  ProfitLossLegend,
  ProfitLossLegendHoverProvider,
  SegmentBackground,
  SegmentLineFrom,
  SegmentLineTo,
  TooltipContent,
  XAxis,
  YAxis,
} from 'bklit-tanstack-charts';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/formatters/cn';

import { formatAxisValue } from './chart-geometry';
import { ChartLegend } from './chart-ui';

interface ProfitLossLineProps {
  values: readonly number[];
  ceilingValues?: readonly number[];
  labels?: readonly string[];
  height?: number;
  baseline?: number;
  formatValue?: (value: number) => string;
  formatAxis?: (value: number) => string;
  ariaLabel: string;
  className?: string;
  measure?: boolean;
  measureUnit?: string;
  seriesLabel?: string;
  ceilingLabel?: string;
}

const BASE_EPOCH_MS = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

interface PlRow extends Record<string, unknown> {
  date: Date;
  index: number;
  label: string;
  value: number;
  delta: number | null;
  ceiling?: number;
}

export function ProfitLossLine({
  values,
  ceilingValues,
  labels,
  height = 200,
  baseline = 0,
  formatValue = (value) => value.toFixed(2),
  formatAxis = formatAxisValue,
  ariaLabel,
  className,
  measure = false,
  seriesLabel = 'Equity',
  ceilingLabel,
}: ProfitLossLineProps) {
  const [legendHovered, setLegendHovered] = useState<number | null>(null);
  const hasCeiling = Boolean(ceilingValues && ceilingValues.length === values.length);

  const { rows, labelByTime, isUnderwaterOnly } = useMemo(() => {
    const map = new Map<number, string>();
    let allNonPositive = true;
    const built: PlRow[] = values.map((val, idx) => {
      const time = BASE_EPOCH_MS + idx * DAY_MS;
      const label = labels?.[idx] ?? `Pt ${idx + 1}`;
      map.set(time, label);
      if (val > baseline) allNonPositive = false;
      const prev = idx > 0 ? (values[idx - 1] ?? baseline) : null;
      return {
        date: new Date(time),
        index: idx,
        label,
        value: val,
        delta: prev !== null ? val - prev : null,
        ...(hasCeiling && ceilingValues ? { ceiling: ceilingValues[idx] ?? baseline } : {}),
      };
    });
    return { rows: built, labelByTime: map, isUnderwaterOnly: allNonPositive };
  }, [values, ceilingValues, hasCeiling, labels, baseline]);

  if (values.length < 2) {
    return (
      <div
        className={cn('surface-well flex items-center justify-center rounded-xl', className)}
        style={{ height }}
      >
        <span className="text-fg-subtle text-xs">Not enough data points</span>
      </div>
    );
  }

  const lastValue = values[values.length - 1] ?? baseline;
  const lastTone =
    lastValue > baseline ? 'text-bull' : lastValue < baseline ? 'text-bear' : 'text-fg';

  return (
    <ProfitLossLegendHoverProvider hoveredIndex={legendHovered}>
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
          {hasCeiling ? (
            <ChartLegend
              items={[
                {
                  label: seriesLabel,
                  tone: isUnderwaterOnly ? 'bear' : 'bull',
                  ...(isUnderwaterOnly ? {} : { dualTone: ['bull', 'bear'] as const }),
                },
                ...(ceilingLabel
                  ? [{ label: ceilingLabel, tone: 'muted' as const, dashed: true }]
                  : []),
              ]}
            />
          ) : (
            <div className="flex items-center gap-3">
              <ProfitLossLegend
                hoveredIndex={legendHovered}
                onHoverChange={setLegendHovered}
                className="font-mono text-[10px]"
              />
              {measure ? (
                <span className="text-fg-subtle hidden font-mono text-[9px] tracking-wider uppercase sm:inline">
                  Drag to select segment
                </span>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="text-fg-subtle uppercase">{seriesLabel}</span>
            <span className={cn('font-semibold tabular-nums', lastTone)}>
              {formatValue(lastValue)}
            </span>
          </div>
        </div>

        <div
          className="surface-well relative overflow-hidden rounded-xl border border-white/[0.05]"
          style={{ height }}
        >
          <LineChart
            data={rows}
            xDataKey="date"
            aspectRatio="unset"
            style={{ height: '100%', aspectRatio: 'unset' }}
            margin={{ top: 16, right: 54, bottom: 28, left: 14 }}
            ariaLabel={ariaLabel}
          >
            <Grid
              horizontal
              numTicksRows={4}
              highlightRowValues={[baseline]}
              highlightRowStroke="var(--color-fg-subtle)"
              highlightRowStrokeOpacity={0.45}
            />

            {measure ? (
              <>
                <SegmentBackground fill="var(--chart-segment-background)" />
                <SegmentLineFrom stroke="var(--chart-segment-line)" variant="dashed" />
                <SegmentLineTo stroke="var(--chart-segment-line)" variant="dashed" />
              </>
            ) : null}

            <Area
              dataKey="value"
              showLine={false}
              showHighlight={false}
              fill={isUnderwaterOnly ? 'var(--chart-negative)' : 'var(--chart-line-primary)'}
              fillOpacity={isUnderwaterOnly ? 0.24 : 0.14}
              gradientToOpacity={0.01}
            />

            <BklitProfitLossLine
              dataKey="value"
              positiveColor="var(--chart-positive)"
              negativeColor="var(--chart-negative)"
              strokeWidth={2.25}
            />

            {hasCeiling ? (
              <Line
                dataKey="ceiling"
                stroke="var(--color-fg-subtle)"
                strokeWidth={1.25}
                dashFromIndex={0}
                dashArray="4,4"
                fadeEdges={false}
                showHighlight={false}
              />
            ) : null}

            <XAxis
              numTicks={Math.min(5, rows.length)}
              formatValue={(date) => labelByTime.get(date.getTime()) ?? ''}
            />
            <YAxis
              orientation="right"
              numTicks={4}
              formatLargeNumbers={false}
              formatValue={formatAxis}
            />

            <ChartTooltip
              showDatePill={false}
              content={({ point }) => {
                const row = point as PlRow;
                const val = typeof row.value === 'number' ? row.value : baseline;
                const delta = typeof row.delta === 'number' ? row.delta : null;
                const ceiling = typeof row.ceiling === 'number' ? row.ceiling : null;
                return (
                  <TooltipContent
                    title={typeof row.label === 'string' ? row.label : undefined}
                    rows={[
                      {
                        color: val >= baseline ? 'var(--chart-positive)' : 'var(--chart-negative)',
                        label: seriesLabel,
                        value: formatValue(val),
                      },
                      ...(delta !== null
                        ? [
                            {
                              color: delta >= 0 ? 'var(--chart-positive)' : 'var(--chart-negative)',
                              label: 'Change',
                              value: formatValue(delta),
                            },
                          ]
                        : []),
                      ...(ceiling !== null
                        ? [
                            {
                              color: 'var(--color-fg-subtle)',
                              label: ceilingLabel ?? 'Peak',
                              value: formatValue(ceiling),
                            },
                          ]
                        : []),
                    ]}
                  />
                );
              }}
            />
          </LineChart>
        </div>
      </div>
    </ProfitLossLegendHoverProvider>
  );
}
