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

// <RangeMeter> — PanelUI-inspired 41-tick precision wave ruler.
// Tick heights rise in a Gaussian wave around `value`, with ticks between
// `marker` (e.g. Entry level or threshold) and `value` illuminated in `tone`.

import { cn } from '@/lib/formatters/cn';

type RangeMeterTone = 'brand' | 'bull' | 'bear' | 'warn';

interface RangeMeterProps {
  value: number;
  min: number;
  max: number;
  /** Optional reference marker (e.g. entry price between SL and TP). */
  marker?: number;
  markerLabel?: string;
  tone?: RangeMeterTone;
  ariaLabel: string;
  className?: string;
}

const TICK_COUNT = 41;

const activeTickTone: Record<RangeMeterTone, string> = {
  brand: 'bg-brand',
  bull: 'bg-bull',
  bear: 'bg-bear',
  warn: 'bg-warn',
};

export function RangeMeter({
  value,
  min,
  max,
  marker,
  markerLabel,
  tone = 'brand',
  ariaLabel,
  className,
}: RangeMeterProps) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const span = high > low ? high - low : 1;

  const valueRatio = Math.min(1, Math.max(0, (value - low) / span));
  const markerRatio =
    marker !== undefined ? Math.min(1, Math.max(0, (marker - low) / span)) : undefined;

  const regionStart = markerRatio !== undefined ? Math.min(valueRatio, markerRatio) : 0;
  const regionEnd = markerRatio !== undefined ? Math.max(valueRatio, markerRatio) : valueRatio;

  return (
    <div
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={low}
      aria-valuemax={high}
      aria-valuenow={value}
      data-slot="range-meter"
      className={cn(
        'surface-well relative flex flex-col gap-1 rounded-lg border border-white/10 px-3 py-2 select-none',
        className,
      )}
    >
      {/* 41-Tick Wave Ruler */}
      <div className="relative flex h-6 w-full items-end justify-between">
        {Array.from({ length: TICK_COUNT }, (_, idx) => {
          const tickRatio = idx / (TICK_COUNT - 1);
          const dist = Math.abs(tickRatio - valueRatio);
          // Smooth Gaussian wave peaking at the live reading
          const wave = Math.exp(-(dist * dist) / 0.012);
          const isMajor = idx % 5 === 0;
          const baseHeight = isMajor ? 8 : 5;
          const heightPx = Math.round(baseHeight + wave * 14);
          const inActiveSpan = tickRatio >= regionStart - 0.015 && tickRatio <= regionEnd + 0.015;
          const isNearest = dist < 1 / (TICK_COUNT * 1.5);

          return (
            <span
              key={idx}
              aria-hidden="true"
              style={{ height: `${heightPx}px` }}
              className={cn(
                'w-[1.5px] rounded-full transition-all duration-150',
                isNearest
                  ? cn('w-[2px]', activeTickTone[tone])
                  : inActiveSpan
                    ? cn('opacity-85', activeTickTone[tone])
                    : isMajor
                      ? 'bg-white/25'
                      : 'bg-white/12',
              )}
            />
          );
        })}

        {/* Reference Marker Diamond (e.g. Entry Price) */}
        {markerRatio !== undefined ? (
          <span
            aria-hidden="true"
            title={markerLabel}
            style={{ left: `${markerRatio * 100}%` }}
            className="bg-warn absolute -bottom-1 z-10 size-2 -translate-x-1/2 rotate-45 rounded-[1px] shadow-[0_0_6px_rgba(217,143,0,0.8)]"
          />
        ) : null}
      </div>
    </div>
  );
}
