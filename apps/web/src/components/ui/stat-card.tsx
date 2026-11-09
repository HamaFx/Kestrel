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

// KPI tile used across the journal and dashboard. The number is the anchor;
// either a recessed sparkline or a machined meter carries the trend / budget
// context below the readout.
import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

import { Sparkline } from './sparkline';

export type StatTone = 'fg' | 'bull' | 'bear' | 'muted' | 'warn';

export interface StatCardProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  tone?: StatTone;
  /** Sparkline values (most recent last). Hidden when < 2 points. */
  sparkline?: readonly number[];
  /** Short context line in the header. */
  hint?: string;
  /** Optional progress meter under the tile (ignored when a sparkline is shown). */
  meter?: { value: number; max: number; tone?: StatTone; showPct?: boolean };
  className?: string;
}

const TONE_CLASS: Record<StatTone, string> = {
  fg: 'text-fg',
  bull: 'text-bull',
  bear: 'text-bear',
  muted: 'text-fg-muted',
  warn: 'text-warn',
};

const TONE_ICON: Record<StatTone, string> = {
  fg: 'text-fg-subtle',
  bull: 'text-bull/85',
  bear: 'text-bear/85',
  muted: 'text-fg-subtle',
  warn: 'text-warn/85',
};

const TONE_BAR: Record<StatTone, string> = {
  fg: 'bg-fg-muted',
  bull: 'bg-bull',
  bear: 'bg-bear',
  muted: 'bg-fg-subtle',
  warn: 'bg-warn',
};

const TONE_DOT: Record<StatTone, string> = {
  fg: 'bg-fg-subtle',
  bull: 'bg-bull',
  bear: 'bg-bear',
  muted: 'bg-fg-subtle',
  warn: 'bg-warn',
};

export function StatCard({
  icon,
  label,
  value,
  tone = 'fg',
  sparkline,
  hint,
  meter,
  className,
}: StatCardProps) {
  const hasSparkline = Boolean(sparkline && sparkline.length >= 2);
  const meterPct = meter
    ? Math.min(100, Math.max(0, (meter.value / Math.max(meter.max, 1)) * 100))
    : 0;
  const showMeterPct = meter?.showPct ?? true;

  return (
    <div
      role="group"
      aria-label={`${label}: ${value}${hint ? `. ${hint}` : ''}`}
      className={cn(
        'surface-card group relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/[0.06] p-3.5 transition-colors hover:border-white/12',
        className,
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-fg-subtle flex min-w-0 items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase">
            {icon ? (
              <span className={cn('inline-flex shrink-0 [&>svg]:size-3.5', TONE_ICON[tone])}>
                {icon}
              </span>
            ) : (
              <span
                className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone])}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{label}</span>
          </div>
          {hint ? (
            <span className="text-fg-subtle shrink-0 font-mono text-[11px] tracking-wide uppercase">
              {hint}
            </span>
          ) : null}
        </div>

        <div
          className={cn(
            'text-numeric-lg sm:text-numeric-xl mt-2.5 truncate font-mono leading-none font-bold tracking-tight tabular-nums',
            TONE_CLASS[tone],
          )}
        >
          {value}
        </div>
      </div>

      {hasSparkline && sparkline ? (
        <div className="surface-well mt-3 h-10 overflow-hidden rounded-lg px-1.5 py-1">
          <Sparkline
            values={sparkline}
            label={label}
            variant="area"
            tone={tone === 'bull' ? 'bull' : tone === 'bear' ? 'bear' : 'neutral'}
            className={cn('h-full w-full', TONE_CLASS[tone])}
          />
        </div>
      ) : meter ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="surface-well h-1.5 flex-1 overflow-hidden rounded-full p-[1px]">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                TONE_BAR[meter.tone ?? tone],
              )}
              style={{ width: `${meterPct}%` }}
            />
          </div>
          {showMeterPct ? (
            <span className="text-fg-subtle font-mono text-[11px] tabular-nums">
              {Math.round(meterPct)}%
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
