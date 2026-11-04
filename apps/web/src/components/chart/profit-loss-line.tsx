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

// Sign-coloured profit/loss curve with real axes, layered grid, a smoothed
// line, an area gradient and a hover card. The zero baseline is the colour
// boundary; drag to measure remains available for range analysis.
import { useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/formatters/cn';

import { buildProfitLossGeometry, formatAxisValue } from './chart-geometry';
import { ChartLegend, ChartTooltip, ChartYAxis } from './chart-ui';
import { ProfitLossSvg } from './profit-loss-svg';

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

function clampIndex(index: number, length: number): number {
  return Math.min(length - 1, Math.max(0, index));
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
  measureUnit = 'points',
  seriesLabel = 'Equity',
  ceilingLabel,
}: ProfitLossLineProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const plotRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const geometry = useMemo(
    () => buildProfitLossGeometry(values, ceilingValues, baseline),
    [values, ceilingValues, baseline],
  );

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

  const indexFromClientX = (clientX: number): number | null => {
    const element = plotRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return clampIndex(Math.round(ratio * (values.length - 1)), values.length);
  };

  const startMeasure = (clientX: number) => {
    if (!measure) return;
    const index = indexFromClientX(clientX);
    if (index === null) return;
    draggingRef.current = true;
    setSelection({ start: index, end: index });
    setDragging(true);
  };

  const updateMeasure = (clientX: number) => {
    if (!draggingRef.current) return;
    const index = indexFromClientX(clientX);
    if (index === null) return;
    setSelection((previous) => (previous ? { ...previous, end: index } : previous));
  };

  const endMeasure = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setSelection((previous) => {
      if (previous && previous.start === previous.end) return null;
      return previous;
    });
  };

  const safeHover =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < values.length ? hoverIndex : null;
  const displayIndex = safeHover ?? values.length - 1;
  const displayValue = values[displayIndex] ?? baseline;
  const previousValue = displayIndex > 0 ? (values[displayIndex - 1] ?? baseline) : null;
  const displayTone =
    displayValue > baseline ? 'text-bull' : displayValue < baseline ? 'text-bear' : 'text-fg';

  const selectionStart = selection ? Math.min(selection.start, selection.end) : null;
  const selectionEnd = selection ? Math.max(selection.start, selection.end) : null;
  const selectionDelta =
    selection && selectionStart !== null && selectionEnd !== null
      ? (values[selectionEnd] ?? baseline) - (values[selectionStart] ?? baseline)
      : 0;
  const selectionX =
    selectionStart !== null && selectionEnd !== null
      ? (geometry.xFor(selectionStart) + geometry.xFor(selectionEnd)) / 2
      : 0;
  const selectionWidth =
    selectionStart !== null && selectionEnd !== null
      ? geometry.xFor(selectionEnd) - geometry.xFor(selectionStart)
      : 0;
  const midLabel = labels?.[Math.floor((labels.length - 1) / 2)];
  const legendItems = [
    { label: seriesLabel, tone: 'brand' as const },
    ...(ceilingLabel ? [{ label: ceilingLabel, tone: 'muted' as const, dashed: true }] : []),
  ];

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <ChartLegend items={legendItems} />
        <div className="flex items-center gap-2 font-mono text-[10px]">
          {safeHover !== null ? (
            <span className="text-fg-subtle">
              {labels?.[safeHover] ?? `Point ${safeHover + 1}`}
            </span>
          ) : null}
          <span className={cn('font-semibold tabular-nums', displayTone)}>
            {formatValue(displayValue)}
          </span>
        </div>
      </div>

      <div className="relative" style={{ height }}>
        <div
          ref={plotRef}
          role="img"
          tabIndex={0}
          aria-label={`${ariaLabel}. Use arrow keys to inspect values.`}
          className={cn(
            'surface-well absolute inset-y-0 right-12 left-0 touch-pan-y rounded-xl outline-none select-none focus-visible:ring-2 focus-visible:ring-brand/40',
            dragging ? 'cursor-col-resize' : measure ? 'cursor-crosshair' : 'cursor-default',
          )}
          onPointerDown={(event) => {
            const index = indexFromClientX(event.clientX);
            setHoverIndex(index);
            if (measure) {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              startMeasure(event.clientX);
            }
          }}
          onPointerMove={(event) => {
            const index = indexFromClientX(event.clientX);
            setHoverIndex(index);
            updateMeasure(event.clientX);
          }}
          onPointerUp={() => endMeasure()}
          onPointerCancel={() => endMeasure()}
          onPointerLeave={() => {
            if (!draggingRef.current) setHoverIndex(null);
          }}
          onDoubleClick={() => setSelection(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              setHoverIndex((previous) => {
                const current = previous ?? values.length - 1;
                return clampIndex(current + (event.key === 'ArrowLeft' ? -1 : 1), values.length);
              });
            } else if (event.key === 'Home') {
              event.preventDefault();
              setHoverIndex(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              setHoverIndex(values.length - 1);
            } else if (event.key === 'Escape') {
              setHoverIndex(null);
              setSelection(null);
            }
          }}
        >
          <ProfitLossSvg
            rawId={rawId}
            geometry={geometry}
            values={values}
            ceilingValues={ceilingValues}
            selectionStart={selectionStart}
            selectionEnd={selectionEnd}
            selectionWidth={selectionWidth}
            safeHover={safeHover}
          />

          {safeHover !== null ? (
            <ChartTooltip
              x={geometry.xFor(safeHover)}
              y={geometry.yFor(values[safeHover] ?? baseline)}
              title={labels?.[safeHover] ?? `Point ${safeHover + 1}`}
              rows={[
                {
                  label: seriesLabel,
                  value: formatValue(values[safeHover] ?? baseline),
                  tone: displayValue >= baseline ? 'bull' : 'bear',
                },
                ...(previousValue !== null
                  ? [
                      {
                        label: 'Change',
                        value: formatValue((values[safeHover] ?? baseline) - previousValue),
                        tone:
                          (values[safeHover] ?? baseline) >= previousValue
                            ? ('bull' as const)
                            : ('bear' as const),
                      },
                    ]
                  : []),
                ...(ceilingValues?.[safeHover] !== undefined
                  ? [
                      {
                        label: ceilingLabel ?? 'Peak',
                        value: formatValue(ceilingValues[safeHover]!),
                        tone: 'muted' as const,
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}

          <span
            className="bg-brand absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${geometry.xFor(values.length - 1)}%`,
              top: `${geometry.yFor(values[values.length - 1] ?? baseline)}%`,
            }}
            aria-hidden="true"
          />

          {selectionStart !== null && selectionEnd !== null ? (
            <span
              className="surface-panel text-fg absolute top-2 z-20 rounded-md border border-white/10 px-2 py-1 font-mono text-[9px] whitespace-nowrap tabular-nums shadow-xl"
              style={{ left: `${Math.min(84, Math.max(16, selectionX))}%`, translate: '-50% 0' }}
            >
              <span className="text-fg-subtle mr-1 tracking-wider uppercase">Measure</span>
              {formatValue(selectionDelta)} · {Math.abs(selectionEnd - selectionStart)}{' '}
              {measureUnit}
            </span>
          ) : null}
        </div>

        <ChartYAxis ticks={geometry.ticks} yFor={geometry.yFor} format={formatAxis} />
      </div>

      {labels && labels.length >= 2 ? (
        <div className="text-fg-subtle mt-1.5 flex justify-between pl-1 font-mono text-[9px]">
          <span>{labels[0]}</span>
          <span>{midLabel}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}
