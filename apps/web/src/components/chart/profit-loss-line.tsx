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

// Sign-coloured profit/loss line with a zero baseline, in-place hover readout,
// and click-and-drag range measurement. Drawn as one stretched SVG path and
// clipped above/below the baseline, so the line changes colour exactly where
// it crosses zero. No chart library and no floating tooltip over neighbours.
import { useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/formatters/cn';

const Y_TOP = 8;
const Y_BOTTOM = 92;

interface ProfitLossLineProps {
  values: readonly number[];
  /** Optional secondary series (e.g. the running equity peak) shaded behind. */
  ceilingValues?: readonly number[];
  /** X-axis labels; the first, middle and last are shown. */
  labels?: readonly string[];
  height?: number;
  /** Zero line, defaults to 0. */
  baseline?: number;
  formatValue?: (value: number) => string;
  ariaLabel: string;
  className?: string;
  /** Enable click-and-drag range measurement. */
  measure?: boolean;
  /** Unit shown in the measurement HUD, e.g. "trades". */
  measureUnit?: string;
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
  ariaLabel,
  className,
  measure = false,
  measureUnit = 'points',
}: ProfitLossLineProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const aboveId = `pl-above-${rawId}`;
  const belowId = `pl-below-${rawId}`;
  const plotRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const geometry = useMemo(() => {
    const ceiling = ceilingValues?.length === values.length ? ceilingValues : null;
    const all = [...values, ...(ceiling ?? []), baseline];
    const low = Math.min(...all);
    const high = Math.max(...all);
    const pad = (high - low) * 0.08 || Math.abs(high || 1) * 0.1 || 1;
    const min = low - pad;
    const max = high + pad;
    const span = max - min || 1;
    const yFor = (value: number) => Y_TOP + (1 - (value - min) / span) * (Y_BOTTOM - Y_TOP);
    const xFor = (index: number) => (index / Math.max(values.length - 1, 1)) * 100;

    const line = values
      .map(
        (value, index) =>
          `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`,
      )
      .join(' ');
    const baselineY = yFor(baseline);
    const area = `${line} L 100 ${baselineY.toFixed(2)} L 0 ${baselineY.toFixed(2)} Z`;

    let shade: string | null = null;
    if (ceiling) {
      const ceilingPoints = ceiling
        .map((value, index) => `${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`)
        .reverse()
        .map((point) => `L ${point}`)
        .join(' ');
      shade = `${line} ${ceilingPoints} Z`;
    }

    return { yFor, xFor, line, area, shade, baselineY };
  }, [values, ceilingValues, baseline]);

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

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px]">
        <span className="text-fg-subtle">
          {safeHover !== null
            ? `Point ${safeHover + 1} of ${values.length}`
            : measure
              ? 'Drag to measure · click to clear'
              : 'Hover to inspect'}
        </span>
        <span className={cn('font-semibold tabular-nums', displayTone)} aria-live="polite">
          {formatValue(displayValue)}
        </span>
      </div>

      <div
        ref={plotRef}
        role="img"
        tabIndex={0}
        aria-label={`${ariaLabel}. Use arrow keys to inspect values.`}
        className={cn(
          'surface-well relative touch-pan-y overflow-hidden rounded-xl outline-none select-none focus-visible:ring-2 focus-visible:ring-brand/40',
          dragging ? 'cursor-col-resize' : measure ? 'cursor-crosshair' : 'cursor-default',
        )}
        style={{ height }}
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
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={aboveId}>
              <rect x="0" y="0" width="100" height={geometry.baselineY} />
            </clipPath>
            <clipPath id={belowId}>
              <rect x="0" y={geometry.baselineY} width="100" height={100 - geometry.baselineY} />
            </clipPath>
          </defs>

          {[Y_TOP, geometry.baselineY, Y_BOTTOM].map((y, index) => (
            <line
              key={`grid-${index}`}
              x1="0"
              x2="100"
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {geometry.shade ? (
            <path
              d={geometry.shade}
              fill="var(--chart-negative)"
              fillOpacity={0.14}
              stroke="none"
            />
          ) : null}

          <path
            d={geometry.area}
            fill="var(--chart-positive)"
            fillOpacity={0.14}
            clipPath={`url(#${aboveId})`}
          />
          <path
            d={geometry.area}
            fill="var(--chart-negative)"
            fillOpacity={0.14}
            clipPath={`url(#${belowId})`}
          />

          <line
            x1="0"
            x2="100"
            y1={geometry.baselineY}
            y2={geometry.baselineY}
            stroke="var(--color-fg-subtle)"
            strokeOpacity={0.4}
            strokeDasharray="2 4"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <path
            d={geometry.line}
            fill="none"
            stroke="var(--chart-positive)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${aboveId})`}
          />
          <path
            d={geometry.line}
            fill="none"
            stroke="var(--chart-negative)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${belowId})`}
          />

          {selectionStart !== null && selectionEnd !== null ? (
            <>
              <rect
                x={geometry.xFor(selectionStart)}
                y="0"
                width={selectionWidth}
                height="100"
                fill="var(--chart-line-primary)"
                fillOpacity={0.08}
              />
              {[selectionStart, selectionEnd].map((index) => (
                <line
                  key={`selection-${index}`}
                  x1={geometry.xFor(index)}
                  x2={geometry.xFor(index)}
                  y1="0"
                  y2="100"
                  stroke="var(--chart-line-primary)"
                  strokeOpacity={0.55}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </>
          ) : null}

          {safeHover !== null ? (
            <line
              x1={geometry.xFor(safeHover)}
              x2={geometry.xFor(safeHover)}
              y1="0"
              y2="100"
              stroke="var(--color-fg-subtle)"
              strokeOpacity={0.55}
              strokeWidth="1"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {selectionStart !== null && selectionEnd !== null ? (
          <span
            className="surface-chip text-fg absolute top-1.5 z-10 rounded-md px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap tabular-nums"
            style={{ left: `${Math.min(88, Math.max(12, selectionX))}%`, translate: '-50% 0' }}
            aria-hidden="true"
          >
            Δ {formatValue(selectionDelta)} · {Math.abs(selectionEnd - selectionStart)}{' '}
            {measureUnit}
          </span>
        ) : null}

        {safeHover !== null ? (
          <span
            className="bg-brand absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${geometry.xFor(safeHover)}%`,
              top: `${geometry.yFor(values[safeHover] ?? baseline)}%`,
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {labels && labels.length >= 2 ? (
        <div className="text-fg-subtle mt-1 flex justify-between font-mono text-[9px]">
          <span>{labels[0]}</span>
          <span>{midLabel}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}
