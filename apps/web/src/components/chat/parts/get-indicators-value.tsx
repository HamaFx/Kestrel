// SPDX-License-Identifier: Apache-2.0

// Per-kind value rendering for the `get_indicators` tool part.
import type { IndicatorResult } from '@kestrel/shared';

import { cn } from '@/lib/formatters/cn';

import { lastValue, readNullableNumber, readNumber, readRecord } from './get-indicators-format';

export function IndicatorValue({
  result,
  decimals,
}: {
  result: IndicatorResult;
  decimals: number;
}) {
  const last = lastValue(result);

  switch (result.kind) {
    case 'rsi': {
      const v = readNumber(last);
      if (v === null) return <Empty />;
      const tone = v > 70 ? 'text-bear' : v < 30 ? 'text-bull' : 'text-fg-muted';
      // Phase 1.2b — RSI gauge arc next to the numeric value.
      return (
        <span className="inline-flex items-center gap-1.5">
          <RsiGauge value={v} />
          <span className={cn('text-fg text-sm font-semibold sm:text-base', tone)}>
            {v.toFixed(1)}
          </span>
        </span>
      );
    }
    case 'macd': {
      const rec = readRecord(last);
      const hist = rec ? readNullableNumber(rec.hist) : null;
      if (hist === null) return <Empty />;
      const tone = hist > 0 ? 'text-bull' : hist < 0 ? 'text-bear' : 'text-fg-muted';
      const sign = hist > 0 ? '+' : '';
      return (
        <>
          <span className={cn('text-sm font-semibold sm:text-base', tone)}>
            {sign}
            {hist.toFixed(decimals)}
          </span>
          <span className="text-fg-subtle text-xs">hist</span>
        </>
      );
    }
    case 'bollinger': {
      const rec = readRecord(last);
      if (!rec) return <Empty />;
      const upper = readNullableNumber(rec.upper);
      const middle = readNullableNumber(rec.middle);
      const lower = readNullableNumber(rec.lower);
      if (upper === null || middle === null || lower === null) return <Empty />;
      return (
        <span className="text-fg text-xs sm:text-sm">
          {upper.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {middle.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {lower.toFixed(decimals)}
        </span>
      );
    }
    case 'pivots': {
      const rec = readRecord(last);
      if (!rec) return <Empty />;
      const pp = readNullableNumber(rec.pp);
      const r1 = readNullableNumber(rec.r1);
      const s1 = readNullableNumber(rec.s1);
      if (pp === null || r1 === null || s1 === null) return <Empty />;
      return (
        <span className="text-fg text-xs sm:text-sm">
          {pp.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {r1.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {s1.toFixed(decimals)}
        </span>
      );
    }
    case 'sma':
    case 'ema':
    case 'atr': {
      const v = readNumber(last);
      if (v === null) return <Empty />;
      // No sign colouring for level / volatility indicators.
      return (
        <span className="text-fg text-sm font-semibold sm:text-base">{v.toFixed(decimals)}</span>
      );
    }
  }
}

function Empty() {
  return <span className="text-fg-subtle text-sm">—</span>;
}

// Phase 1.2b — RSI gauge arc. Pure inline SVG semicircle (180°). Background
// arc uses bg-elev-3; the value arc is coloured by zone (<30 oversold → bull,
// >70 overbought → bear, else fg-muted). Server-renderable (no motion).
function RsiGauge({ value }: { value: number }) {
  const r = 20;
  const cx = 24;
  const cy = 28;
  const circumference = Math.PI * r; // semicircle arc length
  const frac = Math.max(0, Math.min(1, value / 100));
  const offset = circumference * (1 - frac);
  const color =
    value < 30 ? 'var(--color-bull)' : value > 70 ? 'var(--color-bear)' : 'var(--color-fg-muted)';
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg
      width="48"
      height="32"
      viewBox="0 0 48 32"
      role="img"
      aria-label={`RSI gauge: ${value.toFixed(1)}`}
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-bg-elev-3)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      <text
        x={cx}
        y={cy - 5}
        textAnchor="middle"
        fill="var(--color-fg)"
        style={{ fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
      >
        {value.toFixed(0)}
      </text>
    </svg>
  );
}
