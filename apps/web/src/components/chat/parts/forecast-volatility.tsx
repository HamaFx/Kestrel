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

// Bespoke renderer for the `forecast_volatility` tool part.
//
// Upgraded to the Kestrel volatility cone: a recessed plot anchored on the
// live mid, an ATR band that widens with the square root of the horizon, a
// pulsing terminal ring, and the next high-impact event marked on the time
// axis. The ATR readouts remain above the plot so the card still works when
// the tool omits the projected range (stale or missing live quote).

import { IconCalendarEvent } from '@tabler/icons-react';

import { Card } from '@/components/ui/card';

import type { ToolPartProps } from './registry';
import { VolatilityConePlot, VolatilityConeUnavailable } from './volatility-cone-plot';

function formatPips(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} pips`;
}

function formatAsOf(asOf: number): string {
  return new Date(asOf).toISOString().slice(11, 16);
}

function formatEventWhen(whenIso: string): string {
  const date = new Date(whenIso);
  if (Number.isNaN(date.getTime())) return whenIso;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function ForecastVolatilityPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'forecast_volatility'>) {
  if (state === 'error') return <ErrorCard message={errorMessage} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  return (
    <Card
      as="section"
      aria-label={`${output.symbol} volatility forecast`}
      className="gap-3.5 p-3.5 sm:p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-fg text-sm font-semibold">
            {output.symbol} · {output.horizonHours}h forward volatility
          </h3>
          <p className="text-fg-subtle mt-0.5 font-mono text-[10px] tracking-wider uppercase">
            ATR(14) · {output.tf} · as of {formatAsOf(output.asOf)} UTC
          </p>
        </div>
        {output.eventAdjusted ? (
          <span className="border-warn/30 bg-warn/10 text-warn rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase">
            Event-adjusted ×{output.eventMultiplier.toFixed(1)}
          </span>
        ) : (
          <span className="border-border/60 bg-bg-elev-2 text-fg-subtle rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide uppercase">
            No event in window
          </span>
        )}
      </header>

      <dl className="grid grid-cols-3 gap-2 font-mono tabular-nums">
        <Stat label={`ATR (${output.tf})`} value={formatPips(output.atrPips)} />
        <Stat label="30d ATR baseline" value={formatPips(output.atrPipsBaseline30d)} />
        <Stat label="Expected move" value={formatPips(output.expectedMovePips)} tone="brand" />
      </dl>

      {output.expectedRange ? (
        <VolatilityConePlot
          symbol={output.symbol}
          horizonHours={output.horizonHours}
          range={output.expectedRange}
          asOf={output.asOf}
          event={output.nextHighImpact}
        />
      ) : (
        <VolatilityConeUnavailable />
      )}

      {output.nextHighImpact ? (
        <div className="border-border/50 text-fg-muted flex items-start gap-2 border-t pt-2.5 text-xs">
          <IconCalendarEvent className="text-warn mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="text-fg font-medium">{output.nextHighImpact.title}</span>
            {output.nextHighImpact.currency ? (
              <span className="text-fg-subtle"> · {output.nextHighImpact.currency}</span>
            ) : null}
            <span className="text-fg-subtle block font-mono text-[10px]">
              {formatEventWhen(output.nextHighImpact.whenIso)}
            </span>
          </div>
        </div>
      ) : null}

      <p className="text-fg-subtle text-[11px] leading-relaxed">{output.notes}</p>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'brand' }) {
  return (
    <div className="border-white/5 bg-bg-elev-2/50 flex flex-col gap-1 rounded-lg border p-2.5">
      <dt className="text-fg-subtle text-[9px] tracking-wider uppercase">{label}</dt>
      <dd className={tone === 'brand' ? 'text-brand text-xs font-semibold' : 'text-fg text-xs'}>
        {value}
      </dd>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card
      as="section"
      className="gap-3.5 p-3.5 sm:p-4"
      aria-busy="true"
      aria-label="Forecasting volatility"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="bg-bg-elev-2 h-14 animate-pulse rounded-lg" />
        ))}
      </div>
      <div className="bg-bg-elev-2 h-44 animate-pulse rounded-xl" />
    </Card>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-xl border p-3 text-sm"
    >
      Vol forecast failed{message ? ` · ${message}` : ''}
    </div>
  );
}
