'use client';

// SPDX-License-Identifier: Apache-2.0

// Phase 1.2a — inline candlestick chart for the `get_candles` tool part,
// powered by `bklit-tanstack-charts` CandlestickChart.
import { priceDecimals, type GetCandlesOutput } from '@kestrel/shared';
import {
  Candlestick,
  CandlestickChart,
  ChartTooltip,
  Grid,
  TooltipContent,
  type OHLCDataPoint,
} from 'bklit-tanstack-charts';
import { useMemo } from 'react';

import { SERIES_BEAR_HEX, SERIES_BULL_HEX } from '@/components/chart/chart-colors';

interface CandleRow extends OHLCDataPoint, Record<string, unknown> {
  rawTime: number;
}

export function CandleSparkline({
  candles,
  lastClose,
}: {
  candles: GetCandlesOutput['candles'];
  lastClose: number;
}) {
  const symbol = candles[0]?.symbol;
  const decimals = symbol ? priceDecimals(symbol) : lastClose >= 100 ? 2 : 4;

  const data = useMemo<CandleRow[]>(() => {
    let prevTime = 0;
    return candles.map((c) => {
      const nextTime = c.t <= prevTime ? prevTime + 60_000 : c.t;
      prevTime = nextTime;
      return {
        date: new Date(nextTime),
        rawTime: c.t,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      };
    });
  }, [candles]);

  if (data.length < 2) return null;

  return (
    <div className="mt-2.5 h-32 w-full overflow-hidden rounded-lg border border-white/[0.05] bg-black/25">
      <CandlestickChart
        data={data}
        aspectRatio="unset"
        style={{ height: '100%', aspectRatio: 'unset' }}
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        candleGap={0.24}
        ariaLabel={`Candle chart: last ${candles.length} bars, closing at ${lastClose}`}
      >
        <Grid horizontal numTicksRows={3} />
        <Candlestick positiveFill={SERIES_BULL_HEX} negativeFill={SERIES_BEAR_HEX} />
        <ChartTooltip
          showDatePill={false}
          content={({ point }) => {
            const row = point as CandleRow;
            const isBull = row.close >= row.open;
            const color = isBull ? SERIES_BULL_HEX : SERIES_BEAR_HEX;
            const label = new Date(row.rawTime).toISOString().slice(5, 16).replace('T', ' ');
            return (
              <TooltipContent
                title={`${label} UTC`}
                rows={[
                  { color, label: 'Open', value: row.open.toFixed(decimals) },
                  { color, label: 'High', value: row.high.toFixed(decimals) },
                  { color, label: 'Low', value: row.low.toFixed(decimals) },
                  { color, label: 'Close', value: row.close.toFixed(decimals) },
                ]}
              />
            );
          }}
        />
      </CandlestickChart>
    </div>
  );
}
