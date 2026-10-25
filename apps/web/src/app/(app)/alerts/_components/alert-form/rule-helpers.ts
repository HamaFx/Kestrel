// SPDX-License-Identifier: Apache-2.0

// Rule construction + formatting helpers for the alert form.

import type { Symbol, Timeframe } from '@kestrel/shared';

export type RuleType = 'priceCross' | 'candleClose' | 'indicatorCross';

export const parsedSnoozeHours = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(168, Math.floor(n))) : 0;
};

export const INDICATOR_PRESETS = [
  { value: 'rsi:14', label: 'RSI (14)' },
  { value: 'rsi:7', label: 'RSI (7)' },
  { value: 'ema:20', label: 'EMA (20)' },
  { value: 'ema:50', label: 'EMA (50)' },
  { value: 'ema:200', label: 'EMA (200)' },
  { value: 'sma:50', label: 'SMA (50)' },
  { value: 'sma:200', label: 'SMA (200)' },
  { value: 'atr:14', label: 'ATR (14)' },
  { value: 'macd:12,26,9', label: 'MACD (12, 26, 9)' },
] as const;

export function formatIndicatorLabel(raw: string): string {
  const found = INDICATOR_PRESETS.find((p) => p.value === raw.trim().toLowerCase());
  return found ? found.label : raw.toUpperCase();
}

export function buildRuleObject(
  type: RuleType,
  symbol: Symbol,
  tf: Timeframe,
  indicator: string,
  level: string,
  direction: 'above' | 'below',
):
  | { type: 'priceCross'; symbol: Symbol; level: number; direction: 'above' | 'below' }
  | {
      type: 'candleClose';
      symbol: Symbol;
      tf: Timeframe;
      level: number;
      direction: 'above' | 'below';
    }
  | {
      type: 'indicatorCross';
      symbol: Symbol;
      tf: Timeframe;
      indicator: string;
      level: number;
      direction: 'above' | 'below';
    }
  | null {
  const numericLevel = level ? Number(level) : NaN;
  if (!Number.isFinite(numericLevel)) return null;
  switch (type) {
    case 'priceCross':
      return { type: 'priceCross', symbol, level: numericLevel, direction };
    case 'candleClose':
      return { type: 'candleClose', symbol, tf, level: numericLevel, direction };
    case 'indicatorCross':
      return { type: 'indicatorCross', symbol, tf, indicator, level: numericLevel, direction };
  }
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}
