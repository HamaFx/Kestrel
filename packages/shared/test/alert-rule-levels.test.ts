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

// R13 (audit 2026-10-31): the alert rule schema refuses a price level that is
// not a price, and deliberately leaves indicator levels alone.
//
// These tests pin the split:
//   - price rules (priceCross / candleClose) require a finite, positive level;
//   - indicator rules (indicatorCross) accept any finite number, because the
//     level is in the indicator's units (RSI 30, a MACD below zero) and their
//     scale belongs to the indicator registry, not to this leaf package;
//   - `isPriceLevelRule` is the single classifier the write boundaries use to
//     decide where the contextual market check applies.

import { describe, expect, it } from 'vitest';

import { AlertRuleSchema, AlertSchema, isPriceLevelRule } from '../src/schemas/alerts';

const priceCross = (level: number) => ({
  type: 'priceCross' as const,
  symbol: 'XAUUSD',
  level,
  direction: 'above' as const,
});

const candleClose = (level: number) => ({
  type: 'candleClose' as const,
  symbol: 'XAUUSD',
  tf: '1h' as const,
  level,
  direction: 'below' as const,
});

const indicatorCross = (level: number, indicator = 'rsi:14') => ({
  type: 'indicatorCross' as const,
  symbol: 'XAUUSD',
  tf: '1h' as const,
  indicator,
  level,
  direction: 'above' as const,
});

describe('AlertRuleSchema — price levels (R13)', () => {
  it('accepts a positive price level', () => {
    expect(AlertRuleSchema.parse(priceCross(2400)).level).toBe(2400);
  });

  it('refuses zero and negative price levels', () => {
    expect(() => AlertRuleSchema.parse(priceCross(0))).toThrow();
    expect(() => AlertRuleSchema.parse(priceCross(-2400))).toThrow();
  });

  it('refuses non-finite price levels', () => {
    expect(() => AlertRuleSchema.parse(priceCross(Number.NaN))).toThrow();
    expect(() => AlertRuleSchema.parse(priceCross(Number.POSITIVE_INFINITY))).toThrow();
  });

  it('applies the same bound to candleClose levels', () => {
    expect(AlertRuleSchema.parse(candleClose(1.15)).level).toBe(1.15);
    expect(() => AlertRuleSchema.parse(candleClose(0))).toThrow();
  });

  it('skips a legacy non-positive price rule instead of evaluating it', () => {
    // A row persisted before this bound existed cannot be mapped to an Alert:
    // `rowToAlert` throws and the list/evaluator skip it with a warning rather
    // than firing on a price no market could print.
    expect(() =>
      AlertSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440002',
        userId: 'user-1',
        rule: priceCross(0),
        channels: ['email'],
        note: null,
        active: true,
        firedAt: null,
        createdAt: 1_748_378_101_000,
      }),
    ).toThrow();
  });
});

describe('AlertRuleSchema — indicator levels stay in indicator units (R13)', () => {
  it('keeps an RSI threshold of 30', () => {
    expect(AlertRuleSchema.parse(indicatorCross(30)).level).toBe(30);
  });

  it('keeps a MACD threshold at or below zero, so existing alerts still parse', () => {
    expect(AlertRuleSchema.parse(indicatorCross(0, 'macd')).level).toBe(0);
    expect(AlertRuleSchema.parse(indicatorCross(-0.5, 'macd')).level).toBe(-0.5);
  });

  it('does not price-band an indicator level', () => {
    // 999999 is a price a market could never print, but as an indicator level
    // it is merely inert: nothing clamps or rejects it here, and the write
    // boundary must not run the price check for it.
    expect(AlertRuleSchema.parse(indicatorCross(999_999, 'rsi:14')).level).toBe(999_999);
  });
});

describe('isPriceLevelRule', () => {
  it('classifies price rules as price-bearing and indicator rules as not', () => {
    expect(isPriceLevelRule(AlertRuleSchema.parse(priceCross(2400)))).toBe(true);
    expect(isPriceLevelRule(AlertRuleSchema.parse(candleClose(1.15)))).toBe(true);
    expect(isPriceLevelRule(AlertRuleSchema.parse(indicatorCross(30)))).toBe(false);
  });

  it('narrows the type so callers can read `level` as a price', () => {
    const rule = AlertRuleSchema.parse(priceCross(2400));
    expect(isPriceLevelRule(rule)).toBe(true);
    if (isPriceLevelRule(rule)) {
      expect(rule.symbol).toBe('XAUUSD');
      expect(rule.level).toBeGreaterThan(0);
    }
  });
});
