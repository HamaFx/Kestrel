'use client';

// SPDX-License-Identifier: Apache-2.0

// Machined semicircle notch gauge for a 0–100 budget, powered by
// `bklit-tanstack-charts` Gauge primitive with Kestrel's compact numeric readout.
import { Gauge } from 'bklit-tanstack-charts';

import { cn } from '@/lib/formatters/cn';

type RingTone = 'success' | 'warn' | 'danger' | 'brand';

const TONE_CLASS: Record<RingTone, string> = {
  success: 'text-success',
  warn: 'text-warn',
  danger: 'text-danger',
  brand: 'text-brand',
};

const TONE_COLOR: Record<RingTone, string> = {
  success: 'var(--color-success)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
  brand: 'var(--color-brand)',
};

export function RingGauge({
  value,
  size = 88,
  tone = 'brand',
  label,
  showLabel = true,
  className,
}: {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  size?: number;
  tone?: RingTone;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const height = Math.round(size * 0.72);
  const notches = size <= 64 ? 18 : 24;

  return (
    <div
      role="img"
      aria-label={`${label ?? 'Gauge'}: ${Math.round(pct)}%`}
      className={cn(
        'relative inline-flex shrink-0 flex-col items-center justify-end',
        TONE_CLASS[tone],
        className,
      )}
      style={{ width: size, height }}
    >
      <Gauge
        value={pct}
        orientation="arc"
        startAngle={180}
        endAngle={360}
        totalNotches={notches}
        spacing={28}
        notchCornerRadius={1.5}
        notchLengthPercent={86}
        activeFill={TONE_COLOR[tone]}
        inactiveFill="var(--chart-grid)"
        inactiveFillOpacity={0.9}
        width={size}
        height={height}
        minWidth={size}
        className="pointer-events-none"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0.5 flex flex-col items-center leading-none">
        <span
          className="font-mono font-bold tracking-tight tabular-nums"
          style={{ fontSize: Math.max(10, Math.round(size * 0.17)) }}
        >
          {Math.round(pct)}%
        </span>
        {showLabel && label ? (
          <span className="text-fg-subtle mt-0.5 font-mono text-[7px] tracking-wider uppercase">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
