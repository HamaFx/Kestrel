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

import type { PortfolioPosition } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computePnL } from '../src/portfolio/risk-service';
import { computeRiskTool } from '../src/tools/compute-risk';
import { verifyCallTool } from '../src/tools/verify-call';

const mockGetCandles = vi.fn();
const mockGetPrice = vi.fn();
const mockComputeStructure = vi.fn();

vi.mock('@kestrel/data', () => ({
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
  getPrice: (...args: unknown[]) => mockGetPrice(...args),
}));

vi.mock('@kestrel/indicators', () => ({
  computeStructure: (...args: unknown[]) => mockComputeStructure(...args),
}));

const execRisk = computeRiskTool.execute as unknown as (input: unknown) => Promise<{
  symbol: string;
  side: string;
  riskUsd: number;
  rewardUsd: number | null;
  rrRatio: number | null;
  pipsToStop: number;
  pipsToTarget: number | null;
  positionSizeLots: number;
  positionSizeUnits: number;
}>;

const execVerify = verifyCallTool.execute as unknown as (input: unknown) => Promise<{
  symbol: string;
  side: string;
  agree: boolean;
  caveats: Array<{ code: string; message: string }>;
  rationale: string;
  marketTolerance: number | null;
}>;

describe('cross-asset risk sizing and P&L (F-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes realistic P&L for crypto positions without 100,000x multiplier', () => {
    const btcPosition: PortfolioPosition = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      symbol: 'BTCUSDT',
      direction: 'long',
      entryPrice: 65_000,
      lotSize: 1.0,
      stopLoss: 64_000,
      takeProfit: 67_000,
      status: 'open',
      openedAt: Date.now(),
      closedAt: null,
      closePrice: null,
      notes: null,
      linkedSignalId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = computePnL(btcPosition, 65_100);
    // 1 BTC moving $100 = $100 P&L (not $10,000,000)
    expect(result.unrealizedPnlUsd).toBeCloseTo(100, 2);
    expect(result.riskUsd).toBeCloseTo(1000, 2);
    expect(result.rewardUsd).toBeCloseTo(2000, 2);
    expect(result.riskRewardRatio).toBeCloseTo(2.0, 2);
  });

  it('computes converted USD P&L for USD-base pairs like USDJPY', () => {
    const usdjpyPosition: PortfolioPosition = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'user-1',
      symbol: 'USDJPY',
      direction: 'long',
      entryPrice: 150.0,
      lotSize: 1.0,
      stopLoss: 149.0,
      takeProfit: 152.0,
      status: 'open',
      openedAt: Date.now(),
      closedAt: null,
      closePrice: null,
      notes: null,
      linkedSignalId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 100 pips move (1.00 JPY) at 151.00 current price
    // P&L in JPY = 1.00 * 100,000 * 1 = 100,000 JPY
    // In USD = 100,000 / 151.00 = $662.25 USD
    const result = computePnL(usdjpyPosition, 151.0);
    expect(result.unrealizedPnlUsd).toBeCloseTo(100_000 / 151.0, 2);

    // Stop loss risk: 100 pips (1.00 JPY) at entry price 150.00 = 100,000 / 150.00 = $666.67 USD
    expect(result.riskUsd).toBeCloseTo(100_000 / 150.0, 2);
  });

  it('allows compute_risk on USD-base pairs (USDJPY, USDCAD, USDCHF)', async () => {
    const res = await execRisk({
      symbol: 'USDJPY',
      side: 'long',
      entry: 150.0,
      stop: 149.5,
      target: 151.5,
      accountUsd: 10_000,
      riskPct: 1, // $100 risk
    });

    // 50 pips distance = 0.50 JPY
    expect(res.pipsToStop).toBeCloseTo(50, 4);
    expect(res.riskUsd).toBeCloseTo(100, 2);
    // Value per pip = (100,000 * 0.01) / 150.00 = $6.6667
    // 50 pips * 6.6667 = $333.33 per lot
    // 100 / 333.33 ≈ 0.30 lots
    expect(res.positionSizeLots).toBeCloseTo(0.3, 2);
    expect(res.rrRatio).toBeCloseTo(3.0, 2);
  });

  it('verify_call supports canonical BTCUSDT volatility and decimals', async () => {
    mockGetPrice.mockResolvedValueOnce({
      symbol: 'BTCUSDT',
      bid: 65_040,
      ask: 65_060,
      mid: 65_050,
      timestamp: Date.now(),
      stale: false,
    });
    mockGetCandles.mockResolvedValueOnce([
      { o: 65_000, h: 65_100, l: 64_900, c: 65_050, v: 10, ts: Date.now() },
    ]);
    mockComputeStructure.mockReturnValueOnce({
      swings: [
        { type: 'low', price: 63_500, index: 0 },
        { type: 'high', price: 67_500, index: 0 },
      ],
    });

    const res = await execVerify({
      symbol: 'BTCUSDT',
      side: 'long',
      entry: 65_000,
      stop: 64_000,
      target: 66_000,
      tf: '1h',
    });

    expect(res.agree).toBe(true);
    expect(res.caveats).toHaveLength(0);
    // Tolerance should use BTCUSDT volatility (0.04 * 1.0 * 65050 = 2602)
    expect(res.marketTolerance).toBeCloseTo(65_050 * 0.04, 1);
  });
});
