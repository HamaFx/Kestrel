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

// Shared sparkline primitive. A single `<path>` through normalized values,
// stretched to its container, with optional pointer scrubbing. The scrub
// readout belongs to the parent card (the existing monospace number), so no
// floating tooltip ever covers a neighbouring row.
//
// Renders nothing when fewer than 2 points are available (a flat line is not
// useful information).

import { useId } from 'react';

import { cn } from '@/lib/formatters/cn';

import { useSparklineHover } from './use-sparkline-hover';

type SparklineTone = 'bull' | 'bear' | 'neutral';
type SparklineVariant = 'line' | 'area';

const TONE_TEXT: Record<SparklineTone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  neutral: 'text-fg-subtle',
};

const Y_TOP = 10;
const Y_BOTTOM = 90;

interface SparklineProps {
  values: readonly number[];
  className?: string;
  /** Optional override stroke; defaults to currentColor so it inherits tone. */
  stroke?: string;
  /** Optional label for accessibility. */
  label?: string;
  /** Signal tone for the line and area fill. Defaults to neutral. */
  tone?: SparklineTone;
  /** Line only, or a line with a faint fill underneath. */
  variant?: SparklineVariant;
  /** Enable pointer scrubbing and the crosshair. */
  interactive?: boolean;
  /** Called with the hovered point index, or null when the pointer leaves. */
  onHoverChange?: (index: number | null) => void;
}

function buildPaths(values: readonly number[]): {
  line: string;
  area: string;
  yAt: (index: number) => number;
} {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const span = Y_BOTTOM - Y_TOP;

  const yAt = (index: number) => {
    const value = values[index] ?? min;
    return max === min ? 50 : Y_BOTTOM - ((value - min) / range) * span;
  };

  const points = values.map((_, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = yAt(index);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  const line = points.join(' ');
  return {
    line,
    area: `${line} L 100 100 L 0 100 Z`,
    yAt,
  };
}

export function Sparkline({
  values,
  className,
  stroke,
  label,
  tone = 'neutral',
  variant = 'line',
  interactive = false,
  onHoverChange,
}: SparklineProps) {
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const hover = useSparklineHover(values.length, interactive ? onHoverChange : undefined);

  if (values.length < 2) {
    return <div className={cn('h-4 w-full', className)} aria-hidden="true" />;
  }

  const { line, area, yAt } = buildPaths(values);
  const start = values[0];
  const end = values[values.length - 1];
  const hoverX = hover.hoverIndex === null ? null : (hover.hoverIndex / (values.length - 1)) * 100;
  const hoverY = hover.hoverIndex === null ? null : yAt(hover.hoverIndex);

  return (
    <div
      ref={interactive ? hover.containerRef : undefined}
      className={cn(
        'relative overflow-hidden',
        TONE_TEXT[tone],
        interactive && 'cursor-crosshair touch-pan-y',
        className,
      )}
      {...(interactive ? hover.handlers : {})}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={label ? `${label} trend: ${start} to ${end}` : `Trend: ${start} to ${end}`}
      >
        {variant === 'area' ? (
          <>
            <defs>
              <linearGradient id={`${gradId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke ?? 'currentColor'} stopOpacity="0.22" />
                <stop offset="100%" stopColor={stroke ?? 'currentColor'} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradId}-fill)`} stroke="none" aria-hidden="true" />
          </>
        ) : null}
        <path
          d={line}
          fill="none"
          stroke={stroke ?? 'currentColor'}
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hoverX !== null ? (
          <line
            x1={hoverX}
            x2={hoverX}
            y1="0"
            y2="100"
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth="1"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
        ) : null}
      </svg>
      {hoverX !== null && hoverY !== null ? (
        <span
          className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
          style={{ left: `${hoverX}%`, top: `${hoverY}%` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
