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

// Paper broker application facade: order placement and read views.
// Price decisions live in `domain.ts`; persistence lives in `db/queries.ts`.

import {
  countOpenPositions,
  getAccount,
  getPosition,
  insertOrder,
  listFills,
  listOrders,
  listPositions,
} from '../db/queries';
import type { PaperAccountRow } from '../db/tables';
import {
  accountSnapshot,
  contractSizeFor,
  marketFillPrice,
  sizePosition,
  validateBracket,
} from '../domain';
import type {
  FillView,
  OrderView,
  PlaceOrderInput,
  PlaceOrderOutput,
  PositionView,
  SummaryOutput,
} from '../schemas';
import type { PaperSettings } from '../settings';
import { accountViewById, listAccountViews, resolvePaperAccount } from './accounts';
import { loadTick, slippageFor } from './pricing';
import { createPosition, minStopDistance, nextUtcMidnight, quotesFor } from './trading-shared';
import { fillView, orderView, positionView } from './views';

export {
  cancelOrderForUser,
  closePositionForUser,
  modifyPositionForUser,
} from './position-lifecycle';
export { processQuotesForUser, type ProcessQuotesResult } from './fill-engine';

export async function placeOrderForUser(args: {
  userId: string;
  input: PlaceOrderInput;
  settings: PaperSettings;
  source?: 'agent' | 'manual' | 'api' | 'strategy';
  signal?: AbortSignal;
  now?: Date;
}): Promise<PlaceOrderOutput> {
  const now = args.now ?? new Date();
  const source = args.source ?? 'agent';
  const account = await resolvePaperAccount(args.userId, args.input.account, args.settings);
  const symbol = args.input.symbol;
  const warnings: string[] = [];

  const [openCount, pendingOrders] = await Promise.all([
    countOpenPositions(args.userId, account.id),
    listOrders(args.userId, { accountId: account.id, status: 'pending', limit: 100 }),
  ]);
  if (openCount + pendingOrders.length >= args.settings.maxOpenPositions) {
    throw new Error(
      `This account already has ${openCount + pendingOrders.length} open/pending trades; the cap is ${
        args.settings.maxOpenPositions
      }.`,
    );
  }

  const tick = await loadTick(symbol, args.signal);
  const quotes = quotesFor(symbol, tick, args.settings);
  const slippage = slippageFor(symbol, args.settings);
  const contractSize = contractSizeFor(symbol);

  if (args.settings.requireStopLoss && args.input.stopLoss === undefined) {
    throw new Error(
      'A stop loss is required for paper orders. Pass stopLoss, or disable "require stop loss" in plugin settings.',
    );
  }

  const referencePrice =
    args.input.type === 'market'
      ? marketFillPrice(args.input.side, quotes, slippage)
      : (args.input.price ?? 0);

  const bracketError = validateBracket({
    side: args.input.side,
    entryPrice: referencePrice,
    stopLoss: args.input.stopLoss ?? null,
    takeProfit: args.input.takeProfit ?? null,
    minStopDistance: minStopDistance(symbol, args.settings),
  });
  if (bracketError) throw new Error(bracketError);

  const open = await listPositions(args.userId, {
    accountId: account.id,
    status: 'open',
    limit: 100,
  });
  const snapshot = accountSnapshot(
    { balance: account.balance },
    open.map((position) => ({
      side: position.side === 'short' ? ('short' as const) : ('long' as const),
      symbol: position.symbol,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      unrealizedPnl: position.unrealizedPnl,
      status: 'open' as const,
    })),
    account.leverage,
  );

  const sizing = sizePosition({
    equity: snapshot.equity,
    freeMargin: snapshot.freeMargin,
    leverage: account.leverage,
    contractSize,
    entryPrice: referencePrice,
    stopLoss: args.input.stopLoss ?? null,
    riskPct:
      args.input.quantity !== undefined ? null : (args.input.riskPct ?? account.riskPerTradePct),
    requestedQuantity: args.input.quantity ?? null,
    maxRiskPct: args.settings.maxRiskPct,
    maxMarginUtilisationPct: args.settings.maxMarginUtilisationPct,
  });
  if (!sizing.ok) throw new Error(sizing.reason);

  if (args.input.stopLoss === undefined) {
    warnings.push('No stop loss: this position has undefined risk.');
  }

  if (args.input.type === 'market') {
    const fillPrice = marketFillPrice(args.input.side, quotes, slippage);
    const fillBracketError = validateBracket({
      side: args.input.side,
      entryPrice: fillPrice,
      stopLoss: args.input.stopLoss ?? null,
      takeProfit: args.input.takeProfit ?? null,
      minStopDistance: minStopDistance(symbol, args.settings),
    });
    if (fillBracketError) throw new Error(fillBracketError);

    const position = await createPosition({
      userId: args.userId,
      account,
      symbol,
      side: args.input.side,
      quantity: sizing.quantity,
      price: fillPrice,
      stopLoss: args.input.stopLoss ?? null,
      takeProfit: args.input.takeProfit ?? null,
      trailingStopDistance: args.input.trailingStop ?? null,
      breakEvenAtR: args.input.breakEvenAtR ?? null,
      orderId: null,
      source,
      notes: args.input.notes ?? null,
      ts: now,
      settings: args.settings,
    });

    const refreshed = (await getAccount(args.userId, account.id)) ?? account;
    return {
      ok: true,
      message: `${args.input.side === 'buy' ? 'Bought' : 'Sold'} ${sizing.quantity} ${symbol} at ${fillPrice} in ${account.name}.`,
      account: await accountViewById(args.userId, refreshed),
      order: null,
      position: positionView(position, refreshed),
      warnings,
    };
  }

  const expiresAt = args.input.timeInForce === 'day' ? nextUtcMidnight(now) : null;
  const order = await insertOrder({
    userId: args.userId,
    accountId: account.id,
    symbol,
    side: args.input.side,
    type: args.input.type,
    quantity: sizing.quantity,
    riskPct: args.input.riskPct ?? null,
    limitPrice: args.input.type === 'limit' ? (args.input.price ?? null) : null,
    stopPrice: args.input.type === 'stop' ? (args.input.price ?? null) : null,
    stopLoss: args.input.stopLoss ?? null,
    takeProfit: args.input.takeProfit ?? null,
    trailingStopDistance: args.input.trailingStop ?? null,
    breakEvenAtR: args.input.breakEvenAtR ?? null,
    timeInForce: args.input.timeInForce,
    notes: args.input.notes ?? null,
    expiresAt,
  });

  return {
    ok: true,
    message: `${args.input.type === 'limit' ? 'Limit' : 'Stop'} ${args.input.side} ${sizing.quantity} ${symbol} @ ${args.input.price} is resting in ${account.name}.`,
    account: await accountViewById(args.userId, account),
    order: orderView(order),
    position: null,
    warnings,
  };
}

// ── Fill resting orders ──────────────────────────────────────────────────

export async function listPositionViews(
  userId: string,
  opts: {
    accountId?: string;
    symbol?: string;
    status?: 'open' | 'closed' | 'all';
    limit?: number;
  } = {},
): Promise<PositionView[]> {
  const rows = await listPositions(userId, opts);
  const accounts = new Map<string, PaperAccountRow>();
  for (const row of rows) {
    if (accounts.has(row.accountId)) continue;
    const account = await getAccount(userId, row.accountId);
    if (account) accounts.set(row.accountId, account);
  }
  return rows.map((row) => positionView(row, accounts.get(row.accountId)));
}

export async function getPositionView(userId: string, positionId: string): Promise<PositionView> {
  const position = await getPosition(userId, positionId);
  if (!position) throw new Error('Position not found.');
  const account = await getAccount(userId, position.accountId);
  return positionView(position, account);
}

export async function listOrderViews(
  userId: string,
  opts: {
    accountId?: string;
    status?: 'pending' | 'filled' | 'cancelled' | 'all';
    limit?: number;
  } = {},
): Promise<OrderView[]> {
  const rows = await listOrders(userId, opts);
  return rows.map(orderView);
}

export async function listFillViews(
  userId: string,
  opts: { accountId?: string; limit?: number } = {},
): Promise<FillView[]> {
  const rows = await listFills(userId, opts);
  return rows.map(fillView);
}

export async function summaryForUser(
  userId: string,
  settings: PaperSettings,
): Promise<SummaryOutput> {
  const [accounts, openPositions, pendingOrders, recentFills, recentClosed] = await Promise.all([
    listAccountViews(userId, settings),
    listPositionViews(userId, { status: 'open', limit: 100 }),
    listOrderViews(userId, { status: 'pending', limit: 50 }),
    listFillViews(userId, { limit: 30 }),
    listPositionViews(userId, { status: 'closed', limit: 20 }),
  ]);
  const totalEquity = accounts.reduce((sum, account) => sum + account.equity, 0);
  const totalUnrealizedPnl = accounts.reduce((sum, account) => sum + account.unrealizedPnl, 0);
  return {
    accounts,
    openPositions,
    pendingOrders,
    recentFills,
    recentClosed,
    totalEquity: Math.round(totalEquity * 100) / 100,
    totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
  };
}

/** Dynamic approval check: resolve the account mode for a trade ref. */
export async function accountModeForPosition(
  userId: string,
  positionId: string,
): Promise<'confirm' | 'autonomous_sandbox'> {
  const position = await getPosition(userId, positionId);
  if (!position) return 'confirm';
  const account = await getAccount(userId, position.accountId);
  return account?.mode === 'autonomous_sandbox' ? 'autonomous_sandbox' : 'confirm';
}
