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

import { describe, expect, it } from 'vitest';

import {
  accountSnapshot,
  evaluatePosition,
  matchOrder,
  quotesFromTick,
  sizePosition,
  validateBracket,
  type PaperPositionState,
} from '../src/domain';

function position(overrides: Partial<PaperPositionState> = {}): PaperPositionState {
  return {
    side: 'long',
    symbol: 'XAUUSD',
    quantity: 1,
    entryPrice: 2000,
    stopLoss: 1990,
    takeProfit: null,
    trailingStopDistance: null,
    trailingStopPrice: null,
    breakEvenAtR: null,
    initialRiskAmount: 1000,
    entryFee: 0,
    ...overrides,
  };
}

describe('paper trading domain', () => {
  it('synthesises a symmetric spread when the provider returns mid-only quotes', () => {
    const result = quotesFromTick(
      { symbol: 'XAUUSD', bid: 2000, ask: 2000, mid: 2000, ts: 1 },
      0.2,
    );
    expect(result.bid).toBeCloseTo(1999.9, 6);
    expect(result.ask).toBeCloseTo(2000.1, 6);
    expect(result.mid).toBeCloseTo(2000, 6);
  });

  it('keeps a real provider spread', () => {
    const result = quotesFromTick(
      { symbol: 'XAUUSD', bid: 1999.5, ask: 2000.5, mid: 2000, ts: 1 },
      0.2,
    );
    expect(result.bid).toBe(1999.5);
    expect(result.ask).toBe(2000.5);
    expect(result.mid).toBe(2000);
  });

  it('sizes from risk when a stop is supplied', () => {
    const result = sizePosition({
      equity: 100_000,
      freeMargin: 100_000,
      leverage: 30,
      contractSize: 100,
      entryPrice: 2000,
      stopLoss: 1990,
      riskPct: 1,
      requestedQuantity: null,
      maxRiskPct: 2,
      maxMarginUtilisationPct: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // $1,000 risk / ($10 stop * 100 oz) = 1 lot.
    expect(result.quantity).toBeCloseTo(1, 6);
    expect(result.riskAmount).toBeCloseTo(1000, 2);
    expect(result.margin).toBeCloseTo((1 * 2000 * 100) / 30, 2);
  });

  it('rejects quantity that exceeds the margin cap', () => {
    const result = sizePosition({
      equity: 10_000,
      freeMargin: 10_000,
      leverage: 10,
      contractSize: 100,
      entryPrice: 2000,
      stopLoss: 1990,
      riskPct: null,
      requestedQuantity: 10,
      maxRiskPct: 2,
      maxMarginUtilisationPct: 50,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/margin/i);
  });

  it('rejects requested risk above the max risk cap', () => {
    const result = sizePosition({
      equity: 10_000,
      freeMargin: 10_000,
      leverage: 100,
      contractSize: 100,
      entryPrice: 2000,
      stopLoss: 1990,
      riskPct: null,
      requestedQuantity: 1,
      maxRiskPct: 2,
      maxMarginUtilisationPct: 50,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/risk/i);
  });

  it('closes a long on the stop and reports the reason', () => {
    const evaluation = evaluatePosition(position(), {
      bid: 1989.5,
      ask: 1989.7,
      mid: 1989.6,
    });
    expect(evaluation.close?.reason).toBe('stop_loss');
    expect(evaluation.close?.price).toBe(1989.5);
  });

  it('closes a short on the stop using the ask', () => {
    const evaluation = evaluatePosition(
      position({ side: 'short', entryPrice: 2000, stopLoss: 2010 }),
      { bid: 2010.1, ask: 2010.3, mid: 2010.2 },
    );
    expect(evaluation.close?.reason).toBe('stop_loss');
    expect(evaluation.close?.price).toBe(2010.3);
  });

  it('closes on the target before trailing logic', () => {
    const evaluation = evaluatePosition(position({ takeProfit: 2020 }), {
      bid: 2021,
      ask: 2021.2,
      mid: 2021.1,
    });
    expect(evaluation.close?.reason).toBe('take_profit');
    expect(evaluation.close?.price).toBe(2021);
  });

  it('moves a trailing stop up but never down', () => {
    const first = evaluatePosition(position({ trailingStopDistance: 10 }), {
      bid: 2010,
      ask: 2010.2,
      mid: 2010.1,
    });
    expect(first.close).toBeNull();
    expect(first.trailingStopPrice).toBe(2000);

    const second = evaluatePosition(
      position({ trailingStopDistance: 10, trailingStopPrice: 2005 }),
      { bid: 2012, ask: 2012.2, mid: 2012.1 },
    );
    // 2012 - 10 = 2002 is worse than the existing 2005, so it must not move.
    expect(second.trailingStopPrice).toBeNull();

    const higher = evaluatePosition(
      position({ trailingStopDistance: 10, trailingStopPrice: 2005 }),
      { bid: 2020, ask: 2020.2, mid: 2020.1 },
    );
    expect(higher.trailingStopPrice).toBe(2010);

    const third = evaluatePosition(
      position({ trailingStopDistance: 10, trailingStopPrice: 2005 }),
      { bid: 2003, ask: 2003.2, mid: 2003.1 },
    );
    expect(third.trailingStopPrice).toBeNull();
  });

  it('moves the stop to breakeven at the configured R', () => {
    const evaluation = evaluatePosition(position({ breakEvenAtR: 1 }), {
      bid: 2011,
      ask: 2011.2,
      mid: 2011.1,
    });
    expect(evaluation.close).toBeNull();
    expect(evaluation.trailingStopPrice).toBe(2000);
  });

  it('matches limit and stop orders', () => {
    expect(
      matchOrder(
        { side: 'buy', type: 'limit', quantity: 1, limitPrice: 2000, stopPrice: null },
        { bid: 1999, ask: 1999.8, mid: 1999.4 },
        0,
      ),
    ).toEqual({ triggered: true, price: 1999.8 });

    expect(
      matchOrder(
        { side: 'sell', type: 'stop', quantity: 1, limitPrice: null, stopPrice: 1990 },
        { bid: 1989.5, ask: 1990.3, mid: 1989.9 },
        0.2,
      ),
    ).toEqual({ triggered: true, price: 1989.3 });

    expect(
      matchOrder(
        { side: 'buy', type: 'limit', quantity: 1, limitPrice: 1990, stopPrice: null },
        { bid: 1999, ask: 2000, mid: 1999.5 },
        0,
      ),
    ).toEqual({ triggered: false, price: null });
  });

  it('validates bracket geometry', () => {
    expect(
      validateBracket({
        side: 'buy',
        entryPrice: 2000,
        stopLoss: 1995,
        takeProfit: 2010,
        minStopDistance: 0.2,
      }),
    ).toBeNull();
    expect(
      validateBracket({
        side: 'buy',
        entryPrice: 2000,
        stopLoss: 2005,
        takeProfit: null,
        minStopDistance: 0.2,
      }),
    ).toMatch(/below/);
  });

  it('computes account equity, margin and free margin', () => {
    const snapshot = accountSnapshot(
      { balance: 100_000 },
      [
        {
          side: 'long',
          symbol: 'XAUUSD',
          quantity: 1,
          entryPrice: 2000,
          unrealizedPnl: 500,
          status: 'open',
        },
        {
          side: 'short',
          symbol: 'EURUSD',
          quantity: 0.5,
          entryPrice: 1.1,
          unrealizedPnl: -100,
          status: 'open',
        },
      ],
      30,
    );
    expect(snapshot.equity).toBe(100_400);
    expect(snapshot.unrealizedPnl).toBe(400);
    expect(snapshot.marginUsed).toBeCloseTo((1 * 2000 * 100 + 0.5 * 1.1 * 100_000) / 30, 2);
    expect(snapshot.freeMargin).toBeCloseTo(100_400 - snapshot.marginUsed, 2);
  });
});
