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

// <Slider> — PanelUI-inspired hardware slider supporting `variant="fill"` (label
// on the left and tabular readout on the right *inside* the recessed bar) and
// `origin="start" | "center"` (bidirectional fill from the midpoint), backed by
// a native `<input type="range">` for full pointer, touch, and keyboard control.

import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

type SliderTone = 'brand' | 'bull' | 'bear' | 'info';

interface SliderProps {
  label?: ReactNode;
  valueLabel?: ReactNode;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  origin?: 'start' | 'center';
  tone?: SliderTone;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  className?: string;
}

const fillTones: Record<SliderTone, string> = {
  brand: 'bg-brand/25 border-brand/50',
  bull: 'bg-bull/25 border-bull/50',
  bear: 'bg-bear/25 border-bear/50',
  info: 'bg-info/25 border-info/50',
};

const thumbTones: Record<SliderTone, string> = {
  brand: 'bg-brand shadow-[0_0_8px_rgba(255,54,22,0.65)]',
  bull: 'bg-bull shadow-[0_0_8px_rgba(63,158,61,0.65)]',
  bear: 'bg-bear shadow-[0_0_8px_rgba(240,62,62,0.65)]',
  info: 'bg-info shadow-[0_0_8px_rgba(79,163,181,0.65)]',
};

const textTones: Record<SliderTone, string> = {
  brand: 'text-brand',
  bull: 'text-bull',
  bear: 'text-bear',
  info: 'text-info',
};

export function Slider({
  label,
  valueLabel,
  ariaLabel,
  value,
  min,
  max,
  step,
  origin = 'start',
  tone = 'brand',
  disabled = false,
  onValueChange,
  className,
}: SliderProps) {
  const span = max > min ? max - min : 1;
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const resolvedStep = step ?? Math.max(0.00001, span / 200);

  const fillLeft = origin === 'center' ? Math.min(50, pct) : 0;
  const fillWidth = origin === 'center' ? Math.abs(pct - 50) : pct;

  return (
    <div
      data-slot="slider"
      data-origin={origin}
      className={cn(
        'surface-well focus-within:border-brand/60 focus-within:ring-brand/30 relative flex h-9 w-full items-center overflow-hidden rounded-lg border border-white/10 px-3 select-none focus-within:ring-2',
        disabled && 'opacity-60',
        className,
      )}
    >
      {/* Proportional Fill Bar */}
      <div
        aria-hidden="true"
        style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        className={cn(
          'pointer-events-none absolute inset-y-0 border-r transition-[left,width] duration-75',
          fillTones[tone],
        )}
      />

      {/* Center Origin Hairline */}
      {origin === 'center' ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-white/20"
        />
      ) : null}

      {/* Active Position Indicator Line */}
      <span
        aria-hidden="true"
        style={{ left: `${pct}%` }}
        className={cn(
          'pointer-events-none absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full transition-[left] duration-75',
          thumbTones[tone],
        )}
      />

      {/* In-Bar Left Label & Right Value Readout */}
      <div className="pointer-events-none relative z-10 flex w-full items-center justify-between gap-2">
        {label ? (
          <span className="text-fg-subtle font-mono text-[10px] font-semibold tracking-wider uppercase">
            {label}
          </span>
        ) : (
          <span />
        )}
        {valueLabel !== undefined ? (
          <span className={cn('font-mono text-xs font-bold tabular-nums', textTones[tone])}>
            {valueLabel}
          </span>
        ) : null}
      </div>

      {/* Native Accessible Range Input Overlay */}
      <input
        type="range"
        min={min}
        max={max}
        step={resolvedStep}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
