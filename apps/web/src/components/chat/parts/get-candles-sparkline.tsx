// SPDX-License-Identifier: Apache-2.0

// Phase 1.2a — inline candle sparkline for the `get_candles` tool part.

import type { GetCandlesOutput } from '@kestrel/shared';

import { SERIES_BEAR_HEX, SERIES_BULL_HEX } from '@/components/chart/chart-colors';

// Phase 1.2a — inline candle sparkline. Pure inline SVG (no chart library,
// no canvas) so it stays server-renderable. Renders the last N bars
// normalized to a 0–100 vertical range; bull bars use SERIES_BULL_HEX,
// bear bars SERIES_BEAR_HEX (canvas-safe hex that mirror the design tokens).
export function CandleSparkline({
  candles,
  lastClose,
}: {
  candles: GetCandlesOutput['candles'];
  lastClose: number;
}) {
  if (candles.length < 2) return null;

  const W = 100;
  const H = 40;
  const pad = 1;
  const colW = (W - pad * 2) / candles.length;

  const lows = candles.map((c) => c.l);
  const highs = candles.map((c) => c.h);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;

  // Map a price to a 0–H vertical coordinate (inverted: higher price → lower y).
  const y = (price: number) => pad + (1 - (price - min) / range) * (H - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-2 h-15 w-full"
      role="img"
      aria-label={`Candle sparkline: last ${candles.length} bars, closing at ${lastClose}`}
    >
      {candles.map((c, i) => {
        const x = pad + i * colW + colW / 2;
        const isBull = c.c >= c.o;
        const color = isBull ? SERIES_BULL_HEX : SERIES_BEAR_HEX;
        const wickTop = y(c.h);
        const wickBot = y(c.l);
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyBot = y(Math.min(c.o, c.c));
        const bodyH = Math.max(1, bodyBot - bodyTop);
        const bodyW = Math.max(0.8, colW * 0.6);
        return (
          <g key={c.t}>
            <line x1={x} y1={wickTop} x2={x} y2={wickBot} stroke={color} strokeWidth={0.5} />
            <rect
              x={x - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={color}
              stroke={color}
              strokeWidth={0.3}
            />
          </g>
        );
      })}
    </svg>
  );
}
