'use client';

// SPDX-License-Identifier: Apache-2.0

// Actual/forecast/previous row with the beat/miss verdict.
import type { EconomicEvent } from '@kestrel/shared';

import { cn } from '@/lib/formatters/cn';

export function DataRow({ event }: { event: EconomicEvent }) {
  const beat = beatMiss(event);
  return (
    <dl className="surface-well bg-bg/60 border-edge/40 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border p-2 font-mono text-xs tabular-nums sm:text-sm">
      {event.actual !== null && (
        <Stat label="actual" value={event.actual} unit={event.unit} emphasis />
      )}
      {event.forecast !== null && (
        <Stat label="forecast" value={event.forecast} unit={event.unit} />
      )}
      {event.previous !== null && <Stat label="prev" value={event.previous} unit={event.unit} />}
      {beat ? (
        <span
          className={cn(
            'text-caption ml-auto inline-flex items-center gap-1 px-1.5 font-bold uppercase tabular-nums',
            beat === 'beat' ? 'text-bull' : 'text-bear',
          )}
        >
          {beat === 'beat' ? '▲ beat' : '▼ miss'}
        </span>
      ) : null}
    </dl>
  );
}

function Stat({
  label,
  value,
  unit,
  emphasis,
}: {
  label: string;
  value: number;
  unit: string | null;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <dt className="text-fg-subtle text-caption tracking-wide uppercase">{label}</dt>
      <dd className={cn('font-semibold', emphasis ? 'text-fg' : 'text-fg-muted')}>
        {value}
        {unit ? <span className="text-fg-subtle ml-0.5 font-normal">{unit}</span> : null}
      </dd>
    </span>
  );
}

function beatMiss(event: EconomicEvent): 'beat' | 'miss' | null {
  if (event.actual === null || event.forecast === null) return null;
  const delta = event.actual - event.forecast;
  if (delta === 0) return null;
  const isSignificant =
    event.forecast !== 0
      ? Math.abs(delta) / Math.abs(event.forecast) > 0.01
      : Math.abs(delta) > 0.01;
  if (!isSignificant) return null;
  return delta > 0 ? 'beat' : 'miss';
}
