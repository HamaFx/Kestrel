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

// Audit 2026-10-31 (R6) — close claims must be atomic.
//
// `applyClose` may only insert a fill and credit the balance when its guarded
// `claimPositionClose` returned a row. These tests pin the payload the claim
// carries (so the SQL does the arithmetic, not a stale JS read) and the
// no-side-effect behaviour of a lost claim.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as queries from '../src/db/queries';
import type { PaperAccountRow, PaperFillRow, PaperPositionRow } from '../src/db/tables';
import { applyClose, closePositionForUser } from '../src/services/position-lifecycle';
import { DEFAULT_SETTINGS } from '../src/settings';

const mocks = vi.hoisted(() => ({
  claimPositionClose: vi.fn(),
  getAccount: vi.fn(),
  getPosition: vi.fn(),
  incrementAccountBalance: vi.fn(),
  insertFill: vi.fn(),
  listPositions: vi.fn(),
  updateOrder: vi.fn(),
  updatePosition: vi.fn(),
  loadTick: vi.fn(),
}));

vi.mock('../src/db/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof queries>();
  return {
    ...actual,
    claimPositionClose: mocks.claimPositionClose,
    getAccount: mocks.getAccount,
    getPosition: mocks.getPosition,
    incrementAccountBalance: mocks.incrementAccountBalance,
    insertFill: mocks.insertFill,
    listPositions: mocks.listPositions,
    updateOrder: mocks.updateOrder,
    updatePosition: mocks.updatePosition,
  };
});

vi.mock('../src/services/pricing', () => ({
  spreadFor: () => 0,
  slippageFor: () => 0,
  isTickTradable: () => ({ ok: true }),
  loadTick: mocks.loadTick,
  loadTicks: vi.fn(),
}));

const USER_ID = 'user-1';
const ACCOUNT_ID = 'acct-1';
const POSITION_ID = 'pos-1';
const NOW = new Date('2026-10-31T10:00:00.000Z');

function positionRow(overrides: Partial<PaperPositionRow> = {}): PaperPositionRow {
  return {
    id: POSITION_ID,
    tenantId: 'tenant-1',
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    createdAt: NOW,
    updatedAt: NOW,
    symbol: 'XAUUSD',
    side: 'long',
    status: 'open',
    quantity: 12,
    initialQuantity: 12,
    entryPrice: 2000,
    entryTime: NOW,
    stopLoss: 1990,
    takeProfit: 2050,
    trailingStopDistance: null,
    trailingStopPrice: null,
    breakEvenAtR: null,
    initialRiskAmount: 12_000,
    unrealizedPnl: 60,
    realizedPnl: 0,
    entryFee: 12,
    exitFee: 0,
    closePrice: null,
    closeTime: null,
    closeReason: null,
    source: 'agent',
    notes: null,
    journalEntryId: null,
    ...overrides,
  };
}

function accountRow(overrides: Partial<PaperAccountRow> = {}): PaperAccountRow {
  return {
    id: ACCOUNT_ID,
    tenantId: 'tenant-1',
    userId: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Personal Demo',
    mode: 'confirm',
    currency: 'USD',
    initialBalance: 100_000,
    balance: 100_000,
    leverage: 30,
    riskPerTradePct: 1,
    status: 'active',
    seeded: true,
    ...overrides,
  };
}

function fillRow(overrides: Partial<PaperFillRow> = {}): PaperFillRow {
  return {
    id: 'fill-1',
    tenantId: 'tenant-1',
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    positionId: POSITION_ID,
    orderId: null,
    kind: 'partial_close',
    price: 2005,
    quantity: 6,
    pnl: 0,
    fees: 0,
    meta: {},
    ts: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const settings = { ...DEFAULT_SETTINGS, commissionPerUnit: 1, autoJournal: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPositions.mockResolvedValue([]);
  mocks.loadTick.mockResolvedValue({
    symbol: 'XAUUSD',
    bid: 2005,
    ask: 2005.2,
    mid: 2005.1,
    ts: NOW.getTime(),
  });
});

describe('applyClose — atomic claim payloads', () => {
  it('sends a partial close to the guarded SQL with the slice P&L and fees', async () => {
    const stale = positionRow();
    const updated = positionRow({
      quantity: 6,
      realizedPnl: 2988,
      unrealizedPnl: 30,
      entryFee: 6,
      exitFee: 6,
    });
    mocks.claimPositionClose.mockResolvedValue(updated);
    mocks.insertFill.mockResolvedValue(fillRow({ pnl: 2988, fees: 12 }));

    const result = await applyClose({
      userId: USER_ID,
      position: stale,
      account: accountRow(),
      exitPrice: 2005,
      quantity: 6,
      reason: 'manual',
      settings,
      source: 'test',
      now: NOW,
    });

    // gross = (2005 - 2000) * 6 * 100 = 3000; entry share 12 * 6/12 = 6;
    // exit fee 1 * 6 = 6; pnl = 3000 - 6 - 6.
    expect(mocks.claimPositionClose).toHaveBeenCalledWith(USER_ID, POSITION_ID, {
      closeQuantity: 6,
      realizedPnl: 2988,
      exitFee: 6,
      full: null,
    });
    expect(mocks.insertFill).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'partial_close',
        quantity: 6,
        pnl: 2988,
        fees: 12,
        meta: { reason: 'manual', source: 'test', remaining: 6 },
      }),
    );
    expect(mocks.incrementAccountBalance).toHaveBeenCalledTimes(1);
    expect(mocks.incrementAccountBalance).toHaveBeenCalledWith(USER_ID, ACCOUNT_ID, 2988);
    expect(result.fill).not.toBeNull();
    expect(result.closed).toBe(false);
  });

  it('marks a full stop close in the claim and keeps prior partials in realized P&L', async () => {
    const stale = positionRow({ quantity: 6, entryFee: 6, realizedPnl: 1000 });
    const updated = positionRow({
      status: 'closed',
      quantity: 0,
      realizedPnl: 1000 - 6024,
      exitFee: 12,
      closePrice: 1990,
      closeTime: NOW,
      closeReason: 'stop_loss',
    });
    mocks.claimPositionClose.mockResolvedValue(updated);
    mocks.insertFill.mockResolvedValue(fillRow({ kind: 'stop_loss', quantity: 6, pnl: -6024 }));

    const result = await applyClose({
      userId: USER_ID,
      position: stale,
      account: accountRow(),
      exitPrice: 1990,
      quantity: 6,
      reason: 'stop_loss',
      settings,
      source: 'tick',
      now: NOW,
    });

    // gross = (1990 - 2000) * 6 * 100 = -6000; entry share 6; exit fee 6.
    expect(mocks.claimPositionClose).toHaveBeenCalledWith(USER_ID, POSITION_ID, {
      closeQuantity: 6,
      realizedPnl: -6012,
      exitFee: 6,
      full: { exitPrice: 1990, closeTime: NOW, closeReason: 'stop_loss' },
    });
    expect(mocks.insertFill).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'stop_loss',
        meta: expect.objectContaining({ remaining: 0 }),
      }),
    );
    expect(mocks.incrementAccountBalance).toHaveBeenCalledWith(USER_ID, ACCOUNT_ID, -6012);
    expect(result.closed).toBe(true);
  });

  it('takes no side effect when the guarded claim returns no row', async () => {
    mocks.claimPositionClose.mockResolvedValue(undefined);

    const result = await applyClose({
      userId: USER_ID,
      position: positionRow(),
      account: accountRow(),
      exitPrice: 2005,
      quantity: 6,
      reason: 'manual',
      settings,
      source: 'tick',
      now: NOW,
    });

    expect(result).toEqual({
      position: expect.objectContaining({ id: POSITION_ID }),
      fill: null,
      closed: false,
    });
    expect(mocks.insertFill).not.toHaveBeenCalled();
    expect(mocks.incrementAccountBalance).not.toHaveBeenCalled();
  });
});

describe('closePositionForUser — honest outcomes', () => {
  it('reports not_closed (and no fill) when a concurrent evaluation won the claim', async () => {
    mocks.getPosition
      .mockResolvedValueOnce(positionRow())
      .mockResolvedValueOnce(positionRow({ quantity: 4 }));
    mocks.getAccount.mockResolvedValue(accountRow());
    mocks.claimPositionClose.mockResolvedValue(undefined);

    const result = await closePositionForUser({
      userId: USER_ID,
      positionId: POSITION_ID,
      quantity: 6,
      settings,
      source: 'manual',
    });

    expect(result.outcome).toBe('not_closed');
    expect(result.fill).toBeNull();
    expect(result.position.quantity).toBe(4);
    expect(mocks.insertFill).not.toHaveBeenCalled();
    expect(mocks.incrementAccountBalance).not.toHaveBeenCalled();
  });

  it('reports partial and closed from the claim result', async () => {
    mocks.getPosition.mockResolvedValue(positionRow());
    mocks.getAccount.mockResolvedValue(accountRow());
    mocks.claimPositionClose.mockResolvedValue(positionRow({ quantity: 6, realizedPnl: 2988 }));
    mocks.insertFill.mockResolvedValue(fillRow({ quantity: 6, pnl: 2988 }));

    const partial = await closePositionForUser({
      userId: USER_ID,
      positionId: POSITION_ID,
      quantity: 6,
      settings,
      source: 'manual',
    });
    expect(partial.outcome).toBe('partial');
    expect(partial.fill).not.toBeNull();

    mocks.claimPositionClose.mockResolvedValue(
      positionRow({ status: 'closed', quantity: 0, closePrice: 2005, closeTime: NOW }),
    );
    mocks.insertFill.mockResolvedValue(fillRow({ kind: 'close', quantity: 6, pnl: 2988 }));

    const full = await closePositionForUser({
      userId: USER_ID,
      positionId: POSITION_ID,
      quantity: 6,
      settings,
      source: 'manual',
    });
    expect(full.outcome).toBe('closed');
  });
});
