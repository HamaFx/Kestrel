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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paperPositionEnricher } from '../src/packet-enricher';

const mocks = vi.hoisted(() => ({ listPositionViews: vi.fn() }));

vi.mock('../src/services/trading', () => ({
  listPositionViews: mocks.listPositionViews,
}));

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('paper packet enricher', () => {
  beforeEach(() => {
    mocks.listPositionViews.mockReset();
  });

  it('returns null when the user has no open exposure', async () => {
    mocks.listPositionViews.mockResolvedValue([]);
    const result = await paperPositionEnricher.enrich({
      userId: 'user-1',
      tenantId: 'tenant-1',
      symbol: 'XAUUSD',
      settings: {},
      log,
    });
    expect(result).toBeNull();
  });

  it('summarises open positions for the symbol', async () => {
    mocks.listPositionViews.mockResolvedValue([
      {
        id: 'p1',
        accountMode: 'autonomous_sandbox',
        accountName: 'AI Agent Sandbox',
        side: 'long',
        quantity: 0.5,
        entryPrice: 2400,
        stopLoss: 2390,
        takeProfit: 2420,
        unrealizedPnl: 12.5,
        rMultiple: 0.25,
      },
      {
        id: 'p2',
        accountMode: 'confirm',
        accountName: 'Personal Demo',
        side: 'short',
        quantity: 0.25,
        entryPrice: 2410,
        stopLoss: 2420,
        takeProfit: 2390,
        unrealizedPnl: -5,
        rMultiple: -0.2,
      },
    ]);

    const result = (await paperPositionEnricher.enrich({
      userId: 'user-1',
      tenantId: 'tenant-1',
      symbol: 'XAUUSD',
      settings: {},
      log,
    })) as { count: number; unrealizedPnl: number; positions: Array<{ id: string }> };

    expect(result.count).toBe(2);
    expect(result.unrealizedPnl).toBe(7.5);
    expect(result.positions.map((position) => position.id)).toEqual(['p1', 'p2']);
    expect(mocks.listPositionViews).toHaveBeenCalledWith('user-1', {
      symbol: 'XAUUSD',
      status: 'open',
      limit: 20,
    });
  });
});
