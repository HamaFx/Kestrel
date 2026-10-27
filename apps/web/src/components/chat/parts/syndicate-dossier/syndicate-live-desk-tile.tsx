'use client';

// SPDX-License-Identifier: Apache-2.0

// One live desk tile for the Council Circuit: neoclassical engraving
// watermark, canonical desk code, live bias pill + conviction bar.
import Image from 'next/image';

import { cn } from '@/lib/formatters/cn';
import type { StrategistDeskConfig } from '@/lib/kestrel-strategist-desks';

export function LiveDeskTile({
  desk,
  status,
  bias,
  confidence,
}: {
  desk: StrategistDeskConfig;
  status: 'pending' | 'running' | 'done' | 'error';
  bias?: 'bullish' | 'bearish' | 'neutral';
  confidence?: number;
}) {
  const pct = Math.round((confidence ?? 0) * 100);
  return (
    <div
      className={cn(
        'surface-chip relative overflow-hidden rounded-lg border p-2.5',
        status === 'running'
          ? 'border-brand/50 shadow-[0_0_12px_rgba(255,54,22,0.15)]'
          : status === 'done'
            ? 'border-edge/80'
            : 'border-edge/60 opacity-70',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 -right-2 z-0 size-14 opacity-[0.12] mix-blend-luminosity"
      >
        <Image src={desk.artworkPath} alt="" fill unoptimized className="object-contain" />
      </div>
      <div className="relative z-10 flex items-center justify-between gap-1">
        <span className="text-brand font-mono text-[9px] font-semibold tracking-wider uppercase">
          {desk.code}
        </span>
        {status === 'done' && bias ? (
          <span
            className={cn(
              'rounded border px-1 py-0.5 font-mono text-[9px] font-bold uppercase',
              bias === 'bullish'
                ? 'border-bull/30 bg-bull/10 text-bull'
                : bias === 'bearish'
                  ? 'border-bear/30 bg-bear/10 text-bear'
                  : 'border-warn/30 bg-warn/10 text-warn',
            )}
          >
            {bias} · {pct}%
          </span>
        ) : (
          <span
            className={cn(
              'font-mono text-[9px] font-semibold uppercase',
              status === 'running' ? 'text-brand animate-pulse' : 'text-fg-subtle',
              status === 'error' && 'text-danger',
            )}
          >
            {status === 'running' ? 'Analyzing' : status === 'error' ? 'Failed' : 'Queued'}
          </span>
        )}
      </div>
      <div className="text-fg relative z-10 mt-1 truncate text-[11px] font-semibold">{desk.label}</div>
      <div className="bg-bg-elev-3 relative z-10 mt-1.5 h-0.5 w-full overflow-hidden rounded-full">
        <div
          className={cn('h-full', bias === 'bearish' ? 'bg-bear' : bias ? 'bg-bull' : 'bg-brand')}
          style={{ width: `${status === 'done' ? pct : status === 'running' ? 60 : 8}%` }}
        />
      </div>
    </div>
  );
}
