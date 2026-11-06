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

// Shared sparkline primitive. Uses monotone cubic Hermite interpolation
// (`smoothPath`) in real pixel coordinates (via ResizeObserver with an SSR
// fallback) so curves, strokes, and terminal markers never distort.
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { smoothPath } from '@/components/chart/chart-geometry';
import { cn } from '@/lib/formatters/cn';

import { useSparklineHover } from './use-sparkline-hover';

type SparklineTone = 'bull' | 'bear' | 'neutral';
type SparklineVariant = 'line' | 'area';

const TONE_TEXT: Record<SparklineTone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  neutral: 'text-fg-subtle',
};

const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 40;
const PAD_X = 2;
const PAD_Y = 4;

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

function buildPixelGeometry(
  values: readonly number[],
  width: number,
  height: number,
): {
  line: string;
  area: string;
  xAt: (index: number) => number;
  yAt: (index: number) => number;
} {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = Math.max(1, width - PAD_X * 2);
  const innerH = Math.max(1, height - PAD_Y * 2);

  const xAt = (index: number) => PAD_X + (index / Math.max(values.length - 1, 1)) * innerW;
  const yAt = (index: number) => {
    const value = values[index] ?? min;
    return max === min ? height / 2 : PAD_Y + (1 - (value - min) / range) * innerH;
  };

  const points = values.map((_, index) => ({ x: xAt(index), y: yAt(index) }));
  const line = smoothPath(points);
  const firstX = xAt(0);
  const lastX = xAt(values.length - 1);
  const area = `${line} L ${lastX.toFixed(2)} ${height.toFixed(2)} L ${firstX.toFixed(2)} ${height.toFixed(2)} Z`;

  return { line, area, xAt, yAt };
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
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ width: number; height: number }>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });

  useEffect(() => {
    const el = interactive ? hover.containerRef.current : measureRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const sync = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (w > 0 && h > 0) {
        setBox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [interactive, hover.containerRef]);

  const geometry = useMemo(
    () => (values.length >= 2 ? buildPixelGeometry(values, box.width, box.height) : null),
    [values, box.width, box.height],
  );

  if (values.length < 2 || !geometry) {
    return <div className={cn('h-4 w-full', className)} aria-hidden="true" />;
  }

  const start = values[0];
  const end = values[values.length - 1];
  const hoverX = hover.hoverIndex === null ? null : geometry.xAt(hover.hoverIndex);
  const hoverY = hover.hoverIndex === null ? null : geometry.yAt(hover.hoverIndex);

  return (
    <div
      ref={interactive ? hover.containerRef : measureRef}
      className={cn(
        'relative overflow-hidden',
        TONE_TEXT[tone],
        interactive && 'cursor-crosshair touch-pan-y',
        className,
      )}
      {...(interactive ? hover.handlers : {})}
    >
      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        className="h-full w-full"
        role="img"
        aria-label={label ? `${label} trend: ${start} to ${end}` : `Trend: ${start} to ${end}`}
      >
        {variant === 'area' ? (
          <>
            <defs>
              <linearGradient id={`${gradId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke ?? 'currentColor'} stopOpacity="0.28" />
                <stop offset="100%" stopColor={stroke ?? 'currentColor'} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path
              d={geometry.area}
              fill={`url(#${gradId}-fill)`}
              stroke="none"
              aria-hidden="true"
            />
          </>
        ) : null}
        <path
          d={geometry.line}
          fill="none"
          stroke={stroke ?? 'currentColor'}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoverX !== null && hoverY !== null ? (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1="0"
              y2={box.height}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeWidth="1"
              strokeDasharray="2 2"
              aria-hidden="true"
            />
            <circle
              cx={hoverX}
              cy={hoverY}
              r="2.75"
              fill="currentColor"
              stroke="#0d0e10"
              strokeWidth="1.25"
              aria-hidden="true"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}
