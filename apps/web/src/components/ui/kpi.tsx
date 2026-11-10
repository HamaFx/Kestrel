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

// <Kpi> — PanelUI-inspired shared-hairline metric strip with polarity-aware
// `<KpiTrend goodDirection="up" | "down">`. In trading telemetry, metrics like
// Max Drawdown (MAE), Slippage, Latency, and AI Spend use `goodDirection="down"`
// so lower readings automatically color `bull` (green) and higher readings color
// `bear` (crimson), using the typographic minus sign (`−` U+2212).

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

type KpiCols = 2 | 3 | 4;
type KpiTone = 'fg' | 'bull' | 'bear' | 'brand' | 'info' | 'warn' | 'muted';

const gridCols: Record<KpiCols, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

const valueTones: Record<KpiTone, string> = {
  fg: 'text-fg',
  bull: 'text-bull',
  bear: 'text-bear',
  brand: 'text-brand',
  info: 'text-info',
  warn: 'text-warn',
  muted: 'text-fg-subtle',
};

export function KpiGroup({
  cols = 4,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { cols?: KpiCols }) {
  return (
    <div
      role="group"
      data-slot="kpi-group"
      className={cn(
        'grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06]',
        gridCols[cols],
        className,
      )}
      {...props}
    />
  );
}

export function Kpi({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="kpi"
      className={cn('bg-[#0d0e10] flex min-w-0 flex-col justify-between gap-1 p-3', className)}
      {...props}
    />
  );
}

export function KpiHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="kpi-header"
      className={cn('flex items-center justify-between gap-1.5', className)}
      {...props}
    />
  );
}

export function KpiLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="kpi-label"
      className={cn(
        'text-fg-subtle flex items-center gap-1 truncate font-mono text-[9px] font-semibold tracking-wider uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function KpiValue({
  tone = 'fg',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: KpiTone }) {
  return (
    <div
      data-slot="kpi-value"
      className={cn(
        'font-mono text-sm font-bold tracking-tight tabular-nums sm:text-base',
        valueTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function KpiTrend({
  change,
  goodDirection = 'up',
  decimals = 2,
  suffix = '',
  className,
}: {
  change: number | null;
  goodDirection?: 'up' | 'down';
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  if (change === null || !Number.isFinite(change)) {
    return (
      <span
        data-slot="kpi-trend"
        className={cn('text-fg-subtle font-mono text-[10px] tabular-nums', className)}
      >
        —
      </span>
    );
  }

  const isZero = Math.abs(change) < 1e-9;
  const isGood = goodDirection === 'up' ? change > 0 : change < 0;
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  const formatted = `${sign}${Math.abs(change).toFixed(decimals)}${suffix}`;

  return (
    <span
      data-slot="kpi-trend"
      className={cn(
        'inline-flex w-fit items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
        isZero
          ? 'border-white/10 bg-white/[0.04] text-fg-subtle'
          : isGood
            ? 'border-bull/30 bg-bull/10 text-bull'
            : 'border-bear/30 bg-bear/10 text-bear',
        className,
      )}
    >
      {formatted}
    </span>
  );
}

export function KpiFooter({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="kpi-footer"
      className={cn('text-fg-subtle truncate font-mono text-[10px] tabular-nums', className)}
      {...props}
    />
  );
}
