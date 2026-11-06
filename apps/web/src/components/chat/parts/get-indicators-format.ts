// SPDX-License-Identifier: Apache-2.0

// Formatting + defensive narrowing for the `get_indicators` tool part.
//
// `IndicatorResult.values` is `(number | null | Record<string, number | null>)[]`.
// Each render branch knows the expected shape, but we still narrow at runtime
// so a malformed payload renders an em-dash instead of crashing.

import type { IndicatorResult } from '@kestrel/shared';

export function labelFor(r: IndicatorResult): string {
  const params = r.params;
  switch (r.kind) {
    case 'sma':
    case 'ema':
    case 'rsi':
    case 'atr': {
      const period = readNumberParam(params['period']);
      return period === null ? r.kind.toUpperCase() : `${r.kind.toUpperCase()}(${period})`;
    }
    case 'macd': {
      const fast = readNumberParam(params['fast']);
      const slow = readNumberParam(params['slow']);
      const signal = readNumberParam(params['signal']);
      if (fast === null || slow === null || signal === null) return 'MACD';
      return `MACD(${fast}/${slow}/${signal})`;
    }
    case 'bollinger': {
      const period = readNumberParam(params['period']);
      const mult = readNumberParam(params['multiplier']);
      if (period === null || mult === null) return 'BB';
      return `BB(${period}, ${mult})`;
    }
    case 'pivots':
      return 'Pivots';
    default:
      // Plugin-registered kinds are open-ended; label them from the id.
      return r.kind.toUpperCase();
  }
}

export function lastValue(r: IndicatorResult): IndicatorResult['values'][number] | undefined {
  if (r.values.length === 0) return undefined;
  return r.values[r.values.length - 1];
}

export function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function readNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return readNumber(v);
}

export function readRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return null;
  // Arrays are objects; reject them so callers can rely on key access.
  if (Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readNumberParam(v: unknown): number | null {
  return readNumber(v);
}
