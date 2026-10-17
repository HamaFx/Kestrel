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

// F2 — Portfolio P&L Engine Tests
//
// Tests the pure P&L computation logic without DB or price fetches.

import type { PortfolioPosition } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import { computePnL } from './risk-service';

function makePosition(overrides: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    userId: 'test-user',
    symbol: 'XAUUSD',
    direction: 'long',
    lotSize: 1.0,
    entryPrice: 2650,
    stopLoss: 2600,
    takeProfit: 2750,
    openedAt: Date.now() - 86400000,
    closedAt: null,
    closePrice: null,
    status: 'open',
    notes: null,
    linkedSignalId: null,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    ...overrides,
  };
}

interface ExpectedPnL {
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct?: number;
  riskUsd?: number | null;
  rewardUsd?: number | null;
  riskRewardRatio?: number | null;
  distanceToStopPct?: number | null;
}

function expectNullableClose(actual: number | null, expected: number | null): void {
  if (expected === null) {
    expect(actual).toBeNull();
  } else {
    expect(actual).toBeCloseTo(expected);
  }
}

const CASES: Array<{
  label: string;
  position: Partial<PortfolioPosition>;
  currentPrice: number;
  expected: ExpectedPnL;
}> = [
  {
    label: 'positive P&L for a winning long position',
    // XAUUSD: contract size = 100 oz, lot = 1.0 → (2700 - 2650) * 100 = 5000
    position: { direction: 'long', entryPrice: 2650, lotSize: 1.0 },
    currentPrice: 2700,
    expected: {
      unrealizedPnlUsd: 5000,
      unrealizedPnlPct: (50 / 2650) * 100,
      riskUsd: 5000,
      rewardUsd: 10000,
      riskRewardRatio: 2.0,
    },
  },
  {
    label: 'negative P&L for a losing long position',
    position: { direction: 'long', entryPrice: 2650, lotSize: 1.0 },
    currentPrice: 2600,
    expected: {
      unrealizedPnlUsd: -5000,
      unrealizedPnlPct: (-50 / 2650) * 100,
    },
  },
  {
    label: 'P&L for a winning short position (profit when price drops)',
    position: {
      direction: 'short',
      entryPrice: 2650,
      lotSize: 1.0,
      stopLoss: 2700,
      takeProfit: 2550,
    },
    currentPrice: 2600,
    expected: {
      unrealizedPnlUsd: 5000,
      riskUsd: 5000,
      rewardUsd: 10000,
      riskRewardRatio: 2.0,
    },
  },
  {
    label: 'P&L for EURUSD with the 100,000 contract size',
    // (1.1100 - 1.1000) * 100000 * 1.0 = 1000
    position: {
      symbol: 'EURUSD',
      direction: 'long',
      entryPrice: 1.1,
      lotSize: 1.0,
      stopLoss: 1.09,
      takeProfit: 1.12,
    },
    currentPrice: 1.11,
    expected: { unrealizedPnlUsd: 1000 },
  },
  {
    label: 'risk and reward scaled by lot size',
    position: {
      direction: 'long',
      entryPrice: 2650,
      stopLoss: 2600,
      takeProfit: 2750,
      lotSize: 2.0,
    },
    currentPrice: 2680,
    expected: {
      unrealizedPnlUsd: 6000,
      riskUsd: 10000,
      rewardUsd: 20000,
      riskRewardRatio: 2.0,
    },
  },
  {
    label: 'null risk/reward fields when stop loss and take profit are absent',
    position: { stopLoss: null, takeProfit: null },
    currentPrice: 2700,
    expected: {
      unrealizedPnlUsd: 5000,
      riskUsd: null,
      rewardUsd: null,
      riskRewardRatio: null,
      distanceToStopPct: null,
    },
  },
  {
    label: 'distance to stop for a long position',
    position: { direction: 'long', entryPrice: 2650, stopLoss: 2600, lotSize: 1.0 },
    currentPrice: 2620,
    expected: { unrealizedPnlUsd: -3000, distanceToStopPct: (20 / 2650) * 100 },
  },
  {
    label: 'distance to stop for a short position',
    position: { direction: 'short', entryPrice: 2650, stopLoss: 2700, lotSize: 1.0 },
    currentPrice: 2680,
    expected: { unrealizedPnlUsd: -3000, distanceToStopPct: (20 / 2650) * 100 },
  },
];

describe('computePnL', () => {
  it.each(CASES)('computes $label', ({ position, currentPrice, expected }) => {
    const result = computePnL(makePosition(position), currentPrice);

    expect(result.stale).toBe(false);
    expect(result.currentPrice).toBe(currentPrice);
    expectNullableClose(result.unrealizedPnlUsd, expected.unrealizedPnlUsd);
    if (expected.unrealizedPnlPct !== undefined) {
      expect(result.unrealizedPnlPct).toBeCloseTo(expected.unrealizedPnlPct, 2);
    }
    if ('riskUsd' in expected) expectNullableClose(result.riskUsd, expected.riskUsd ?? null);
    if ('rewardUsd' in expected) expectNullableClose(result.rewardUsd, expected.rewardUsd ?? null);
    if ('riskRewardRatio' in expected) {
      expectNullableClose(result.riskRewardRatio, expected.riskRewardRatio ?? null);
    }
    if ('distanceToStopPct' in expected) {
      expectNullableClose(result.distanceToStopPct, expected.distanceToStopPct ?? null);
    }
  });
});
