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

// margin and position-limit guards are re-verified
// under the account row lock, immediately before the write.
//
// The first half of each check still runs against a snapshot (fast failure
// with the historical message); these tests prove that the authoritative
// re-check reads fresh locked state and that a rejection never reaches the
// insert.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as queries from '../src/db/queries';
import type {
  PaperAccountRow,
  PaperFillRow,
  PaperOrderRow,
  PaperPositionRow,
} from '../src/db/tables';
import { PlaceOrderInputSchema } from '../src/schemas';
import { processQuotesForUser } from '../src/services/fill-engine';
import { placeOrderForUser } from '../src/services/trading';
import { normaliseSettings } from '../src/settings';

const mocks = vi.hoisted(() => ({
  claimPendingOrder: vi.fn(),
  countOpenPositions: vi.fn(),
  findAccountByMode: vi.fn(),
  getAccount: vi.fn(),
  insertFill: vi.fn(),
  insertOrder: vi.fn(),
  insertPosition: vi.fn(),
  listOrders: vi.fn(),
  listPositions: vi.fn(),
  lockAccountForWrite: vi.fn(),
  updateOpenPosition: vi.fn(),
  updateOrder: vi.fn(),
  loadTick: vi.fn(),
}));

vi.mock('../src/db/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof queries>();
  return {
    ...actual,
    claimPendingOrder: mocks.claimPendingOrder,
    countOpenPositions: mocks.countOpenPositions,
    findAccountByMode: mocks.findAccountByMode,
    getAccount: mocks.getAccount,
    insertFill: mocks.insertFill,
    insertOrder: mocks.insertOrder,
    insertPosition: mocks.insertPosition,
    listOrders: mocks.listOrders,
    listPositions: mocks.listPositions,
    lockAccountForWrite: mocks.lockAccountForWrite,
    updateOpenPosition: mocks.updateOpenPosition,
    updateOrder: mocks.updateOrder,
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
const NOW = new Date('2026-10-31T10:00:00.000Z');
const TICK = { symbol: 'XAUUSD', bid: 1999.5, ask: 2000, mid: 1999.75, ts: NOW.getTime() };

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

function positionRow(overrides: Partial<PaperPositionRow> = {}): PaperPositionRow {
  return {
    id: 'pos-existing',
    tenantId: 'tenant-1',
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    createdAt: NOW,
    updatedAt: NOW,
    symbol: 'XAUUSD',
    side: 'long',
    status: 'open',
    quantity: 1,
    initialQuantity: 1,
    entryPrice: 2000,
    entryTime: NOW,
    stopLoss: null,
    takeProfit: null,
    trailingStopDistance: null,
    trailingStopPrice: null,
    breakEvenAtR: null,
    initialRiskAmount: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    entryFee: 0,
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

function orderRow(overrides: Partial<PaperOrderRow> = {}): PaperOrderRow {
  return {
    id: 'order-1',
    tenantId: 'tenant-1',
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    createdAt: NOW,
    updatedAt: NOW,
    symbol: 'XAUUSD',
    side: 'buy',
    type: 'limit',
    status: 'pending',
    quantity: 0.1,
    riskPct: null,
    limitPrice: 2000,
    stopPrice: null,
    stopLoss: null,
    takeProfit: null,
    trailingStopDistance: null,
    breakEvenAtR: null,
    timeInForce: 'gtc',
    filledPrice: null,
    filledAt: null,
    positionId: null,
    reason: null,
    notes: null,
    expiresAt: null,
    ...overrides,
  };
}

function fillRow(overrides: Partial<PaperFillRow> = {}): PaperFillRow {
  return {
    id: 'fill-1',
    tenantId: 'tenant-1',
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    positionId: 'pos-new',
    orderId: 'order-1',
    kind: 'open',
    price: 2000,
    quantity: 0.1,
    pnl: 0,
    fees: 0,
    meta: {},
    ts: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function marketInput(overrides: Record<string, unknown> = {}) {
  return PlaceOrderInputSchema.parse({
    account: 'personal',
    symbol: 'XAUUSD',
    side: 'buy',
    type: 'market',
    quantity: 0.01,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAccountByMode.mockResolvedValue(accountRow());
  mocks.getAccount.mockResolvedValue(accountRow());
  mocks.lockAccountForWrite.mockResolvedValue(accountRow());
  mocks.countOpenPositions.mockResolvedValue(0);
  mocks.listOrders.mockResolvedValue([]);
  mocks.listPositions.mockResolvedValue([]);
  mocks.loadTick.mockResolvedValue(TICK);
});

describe('placeOrderForUser re-verifies limits under the account lock', () => {
  it('rejects a market order when a concurrent placement filled the last slot', async () => {
    // First (pre-check) read sees an empty account; the locked re-read sees
    // the position a concurrent placement committed while we waited.
    mocks.listPositions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([positionRow({ id: 'pos-race' })]);

    const settings = normaliseSettings({ maxOpenPositions: 1, requireStopLoss: false });
    await expect(
      placeOrderForUser({ userId: USER_ID, input: marketInput(), settings }),
    ).rejects.toThrow(/cap is 1/);

    expect(mocks.lockAccountForWrite).toHaveBeenCalledWith(USER_ID, ACCOUNT_ID);
    expect(mocks.insertPosition).not.toHaveBeenCalled();
  });

  it('rejects a market order when a concurrent position consumed the free margin', async () => {
    mocks.listPositions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([positionRow({ quantity: 100, entryPrice: 2000 })]);

    const settings = normaliseSettings({
      maxOpenPositions: 10,
      maxMarginUtilisationPct: 50,
      requireStopLoss: false,
    });
    await expect(
      placeOrderForUser({
        userId: USER_ID,
        input: marketInput(),
        settings,
      }),
    ).rejects.toThrow(/utilisation cap/);

    expect(mocks.insertPosition).not.toHaveBeenCalled();
  });

  it('locks the account before inserting on the successful path', async () => {
    mocks.insertPosition.mockResolvedValue(positionRow({ id: 'pos-new', quantity: 0.01 }));
    mocks.insertFill.mockResolvedValue(fillRow());

    const settings = normaliseSettings({ requireStopLoss: false });
    const result = await placeOrderForUser({ userId: USER_ID, input: marketInput(), settings });

    expect(result.position).not.toBeNull();
    expect(mocks.lockAccountForWrite.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insertPosition.mock.invocationCallOrder[0]!,
    );
  });
});

describe('processQuotesForUser re-verifies fill margin under the account lock', () => {
  it('rejects a triggered order instead of opening a second over-margin position', async () => {
    const order = orderRow();
    mocks.listOrders.mockResolvedValue([order]);
    // Position list read at the top of the pass is empty; the locked re-read
    // sees the position a concurrent fill committed first.
    mocks.listPositions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([positionRow({ id: 'pos-race', quantity: 100, entryPrice: 2000 })]);

    const result = await processQuotesForUser({
      userId: USER_ID,
      ticksBySymbol: new Map([['XAUUSD', TICK]]),
      settings: normaliseSettings({ maxMarginUtilisationPct: 50, requireStopLoss: false }),
      now: NOW,
      source: 'test',
    });

    expect(result.filled).toBe(0);
    expect(mocks.claimPendingOrder).toHaveBeenCalledWith(
      USER_ID,
      'order-1',
      expect.objectContaining({ status: 'rejected', reason: expect.stringContaining('margin') }),
    );
    expect(mocks.insertPosition).not.toHaveBeenCalled();
  });

  it('claims the order only after the account lock, then inserts the position', async () => {
    const order = orderRow();
    mocks.listOrders.mockResolvedValue([order]);
    mocks.claimPendingOrder.mockResolvedValue(orderRow({ status: 'filled' }));
    mocks.insertPosition.mockResolvedValue(positionRow({ id: 'pos-new', quantity: 0.1 }));
    mocks.insertFill.mockResolvedValue(fillRow());

    const result = await processQuotesForUser({
      userId: USER_ID,
      ticksBySymbol: new Map([['XAUUSD', TICK]]),
      settings: normaliseSettings({ requireStopLoss: false }),
      now: NOW,
      source: 'test',
    });

    expect(result.filled).toBe(1);
    expect(mocks.lockAccountForWrite.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.claimPendingOrder.mock.invocationCallOrder[0]!,
    );
    expect(mocks.claimPendingOrder.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insertPosition.mock.invocationCallOrder[0]!,
    );
  });
});
