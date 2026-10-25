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

// Paper broker application service.
//
// Translates validated tool/API intent into persisted positions/orders/fills.
// All price decisions live in `src/domain.ts`; this module owns database
// orchestration, account balances, and journal sync.

import { createJournalEntry } from '@kestrel/db';
import { pipSize } from '@kestrel/shared';

import {
  countOpenPositions,
  getAccount,
  getOrder,
  getPosition,
  insertFill,
  insertOrder,
  insertPosition,
  listFills,
  listOrders,
  listPositions,
  setAccountBalance,
  updateOrder,
  updatePosition,
} from '../db/queries';
import type { PaperAccountRow, PaperOrderRow, PaperPositionRow } from '../db/tables';
import {
  accountSnapshot,
  contractSizeFor,
  entryFeeFor,
  evaluatePosition,
  exitQuote,
  grossPnl,
  marketFillPrice,
  matchOrder,
  outcomeFor,
  quotesFromTick,
  sizePosition,
  validateBracket,
  type MarketTick,
  type OrderSide,
  type PaperPositionState,
  type PositionCloseReason,
  type Quotes,
} from '../domain';
import type {
  AccountView,
  FillView,
  OrderView,
  PlaceOrderInput,
  PlaceOrderOutput,
  PositionView,
  SummaryOutput,
} from '../schemas';
import type { PaperSettings } from '../settings';
import { accountViewById, listAccountViews, resolvePaperAccount } from './accounts';
import { loadTick, slippageFor, spreadFor } from './pricing';
import { fillView, orderView, positionView } from './views';

function positionState(row: PaperPositionRow): PaperPositionState {
  return {
    side: row.side === 'short' ? 'short' : 'long',
    symbol: row.symbol,
    quantity: row.quantity,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    trailingStopDistance: row.trailingStopDistance,
    trailingStopPrice: row.trailingStopPrice,
    breakEvenAtR: row.breakEvenAtR,
    initialRiskAmount: row.initialRiskAmount,
    entryFee: row.entryFee,
  };
}

function nextUtcMidnight(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function minStopDistance(symbol: string, settings: PaperSettings): number {
  return Math.max(spreadFor(symbol, settings) * 1.5, pipSize(symbol) * 2);
}

function quotesFor(symbol: string, tick: MarketTick, settings: PaperSettings): Quotes {
  return quotesFromTick(tick, spreadFor(symbol, settings));
}

/** Exits pay the adverse side of the spread plus slippage. */
function exitWithSlippage(
  position: Pick<PaperPositionRow, 'side' | 'symbol'>,
  price: number,
  settings: PaperSettings,
): number {
  const slip = slippageFor(position.symbol, settings);
  return position.side === 'long' ? price - slip : price + slip;
}

function allocateEntryFee(position: PaperPositionRow, closeQuantity: number): number {
  if (!(position.quantity > 0)) return 0;
  const share = Math.min(1, closeQuantity / position.quantity);
  return position.entryFee * share;
}

async function insertOpenFill(args: {
  userId: string;
  accountId: string;
  positionId: string;
  orderId: string | null;
  price: number;
  quantity: number;
  fees: number;
  ts: Date;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await insertFill({
    userId: args.userId,
    accountId: args.accountId,
    positionId: args.positionId,
    orderId: args.orderId,
    kind: 'open',
    price: args.price,
    quantity: args.quantity,
    pnl: 0,
    fees: args.fees,
    ts: args.ts,
    ...(args.meta ? { meta: args.meta } : {}),
  });
}

async function createPosition(args: {
  userId: string;
  account: PaperAccountRow;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopDistance: number | null;
  breakEvenAtR: number | null;
  orderId: string | null;
  source: string;
  notes: string | null;
  ts: Date;
  settings: PaperSettings;
}): Promise<PaperPositionRow> {
  const contractSize = contractSizeFor(args.symbol);
  const initialRiskAmount =
    args.stopLoss !== null
      ? Math.abs(args.price - args.stopLoss) * args.quantity * contractSize
      : 0;
  const entryFee = entryFeeFor(args.quantity, args.settings.commissionPerUnit);

  const position = await insertPosition({
    userId: args.userId,
    accountId: args.account.id,
    symbol: args.symbol,
    side: args.side === 'buy' ? 'long' : 'short',
    quantity: args.quantity,
    initialQuantity: args.quantity,
    entryPrice: args.price,
    entryTime: args.ts,
    stopLoss: args.stopLoss,
    takeProfit: args.takeProfit,
    trailingStopDistance: args.trailingStopDistance,
    breakEvenAtR: args.breakEvenAtR,
    initialRiskAmount,
    entryFee,
    source: args.source,
    notes: args.notes,
  });

  await insertOpenFill({
    userId: args.userId,
    accountId: args.account.id,
    positionId: position.id,
    orderId: args.orderId,
    price: args.price,
    quantity: args.quantity,
    fees: entryFee,
    ts: args.ts,
    meta: {
      symbol: args.symbol,
      side: position.side,
      stopLoss: args.stopLoss,
      takeProfit: args.takeProfit,
    },
  });

  return position;
}

async function syncJournal(args: {
  position: PaperPositionRow;
  account: PaperAccountRow;
  exitPrice: number;
  pnl: number;
  recordedQuantity: number;
  reason: PositionCloseReason;
  settings: PaperSettings;
  closedAt: Date;
  onError?: (err: unknown) => void;
}): Promise<string | null> {
  if (!args.settings.autoJournal || args.position.journalEntryId) return null;
  try {
    const rMultiple =
      args.position.initialRiskAmount > 0 ? args.pnl / args.position.initialRiskAmount : 0;
    const entry = await createJournalEntry({
      userId: args.position.userId,
      symbol: args.position.symbol,
      side: args.position.side === 'short' ? 'short' : 'long',
      openedAt: args.position.entryTime,
      closedAt: args.closedAt,
      entry: args.position.entryPrice,
      stop: args.position.stopLoss,
      target: args.position.takeProfit,
      exit: args.exitPrice,
      size: args.recordedQuantity,
      outcome: outcomeFor(args.pnl),
      rMultiple: Math.round(rMultiple * 10_000) / 10_000,
      notes: [
        `Paper trade · ${args.account.name} (${args.account.mode})`,
        `Closed: ${args.reason}`,
        args.position.notes,
      ]
        .filter(Boolean)
        .join(' · '),
      tags: ['paper', `paper-${args.account.mode}`, args.position.symbol],
    });
    await updatePosition(args.position.userId, args.position.id, {
      journalEntryId: entry.id,
    });
    return entry.id;
  } catch (err) {
    args.onError?.(err);
    return null;
  }
}

async function applyClose(args: {
  userId: string;
  position: PaperPositionRow;
  account: PaperAccountRow;
  exitPrice: number;
  quantity: number;
  reason: PositionCloseReason;
  settings: PaperSettings;
  source: string;
  now: Date;
  onJournalError?: (err: unknown) => void;
}): Promise<{ position: PaperPositionRow; fill: FillView; closed: boolean }> {
  const closeQuantity = Math.min(args.quantity, args.position.quantity);
  if (!(closeQuantity > 0)) {
    throw new Error('Close quantity must be positive.');
  }
  const full = closeQuantity >= args.position.quantity - 1e-9;
  const contractSize = contractSizeFor(args.position.symbol);
  const side = args.position.side === 'short' ? 'short' : 'long';
  const entryFeeShare = allocateEntryFee(args.position, closeQuantity);
  const exitFee = entryFeeFor(closeQuantity, args.settings.commissionPerUnit);
  const gross = grossPnl(
    side,
    args.position.entryPrice,
    args.exitPrice,
    closeQuantity,
    contractSize,
  );
  const pnl = gross - entryFeeShare - exitFee;
  const fillKind =
    args.reason === 'stop_loss'
      ? 'stop_loss'
      : args.reason === 'take_profit'
        ? 'take_profit'
        : args.reason === 'trailing_stop'
          ? 'trailing_stop'
          : full
            ? 'close'
            : 'partial_close';

  const fill = await insertFill({
    userId: args.userId,
    accountId: args.account.id,
    positionId: args.position.id,
    orderId: null,
    kind: fillKind,
    price: args.exitPrice,
    quantity: closeQuantity,
    pnl,
    fees: exitFee + entryFeeShare,
    ts: args.now,
    meta: {
      reason: args.reason,
      source: args.source,
      remaining: full ? 0 : args.position.quantity - closeQuantity,
    },
  });

  let updated: PaperPositionRow | undefined;
  if (full) {
    // Prior partials are already in realizedPnl; the journal must reflect the
    // whole trade, not just the final slice.
    const totalPnl = args.position.realizedPnl + pnl;
    updated = await updatePosition(args.userId, args.position.id, {
      status: 'closed',
      quantity: 0,
      closePrice: args.exitPrice,
      closeTime: args.now,
      closeReason: args.reason,
      realizedPnl: args.position.realizedPnl + pnl,
      unrealizedPnl: 0,
      exitFee: args.position.exitFee + exitFee,
    });
    const freshAccount = (await getAccount(args.userId, args.account.id)) ?? args.account;
    await setAccountBalance(args.userId, args.account.id, freshAccount.balance + pnl);
    await syncJournal({
      position: args.position,
      account: args.account,
      exitPrice: args.exitPrice,
      pnl: totalPnl,
      recordedQuantity: args.position.initialQuantity,
      reason: args.reason,
      settings: args.settings,
      closedAt: args.now,
      ...(args.onJournalError ? { onError: args.onJournalError } : {}),
    });
  } else {
    const remaining = args.position.quantity - closeQuantity;
    const share = remaining / args.position.quantity;
    updated = await updatePosition(args.userId, args.position.id, {
      quantity: remaining,
      realizedPnl: args.position.realizedPnl + pnl,
      unrealizedPnl: args.position.unrealizedPnl * share,
      // Keep the original risk so R and the Journal reflect the whole trade
      // across partial closes, not just the remaining slice.
      entryFee: args.position.entryFee * share,
      exitFee: args.position.exitFee + exitFee,
    });
    const freshAccount = (await getAccount(args.userId, args.account.id)) ?? args.account;
    await setAccountBalance(args.userId, args.account.id, freshAccount.balance + pnl);
  }

  if (!updated) throw new Error('Position disappeared while closing.');
  return { position: updated, fill: fillView(fill), closed: full };
}

// ── Place order ──────────────────────────────────────────────────────────

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

async function fillOrder(args: {
  userId: string;
  order: PaperOrderRow;
  account: PaperAccountRow;
  quotes: Quotes;
  settings: PaperSettings;
  now: Date;
  source: string;
}): Promise<PaperPositionRow | null> {
  const match = matchOrder(
    {
      side: args.order.side === 'sell' ? 'sell' : 'buy',
      type: args.order.type === 'limit' || args.order.type === 'stop' ? args.order.type : 'market',
      quantity: args.order.quantity,
      limitPrice: args.order.limitPrice,
      stopPrice: args.order.stopPrice,
    },
    args.quotes,
    slippageFor(args.order.symbol, args.settings),
  );
  if (!match.triggered || match.price === null) return null;

  const bracketError = validateBracket({
    side: args.order.side === 'sell' ? 'sell' : 'buy',
    entryPrice: match.price,
    stopLoss: args.order.stopLoss,
    takeProfit: args.order.takeProfit,
    minStopDistance: minStopDistance(args.order.symbol, args.settings),
  });
  if (bracketError) {
    await updateOrder(args.userId, args.order.id, {
      status: 'rejected',
      reason: bracketError,
    });
    return null;
  }

  const contractSize = contractSizeFor(args.order.symbol);
  const open = await listPositions(args.userId, {
    accountId: args.account.id,
    status: 'open',
    limit: 100,
  });
  const snapshot = accountSnapshot(
    { balance: args.account.balance },
    open.map((position) => ({
      side: position.side === 'short' ? ('short' as const) : ('long' as const),
      symbol: position.symbol,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      unrealizedPnl: position.unrealizedPnl,
      status: 'open' as const,
    })),
    args.account.leverage,
  );

  const notional = match.price * args.order.quantity * contractSize;
  const margin = notional / Math.max(1, args.account.leverage);
  const marginCap =
    Math.max(0, snapshot.freeMargin) * (args.settings.maxMarginUtilisationPct / 100);
  if (margin > marginCap + 0.01) {
    await updateOrder(args.userId, args.order.id, {
      status: 'rejected',
      reason: `Gap moved the entry; margin ${margin.toFixed(2)} exceeds the available cap.`,
    });
    return null;
  }

  if (args.order.stopLoss !== null) {
    const risk = Math.abs(match.price - args.order.stopLoss) * args.order.quantity * contractSize;
    const maxRisk = (snapshot.equity * args.settings.maxRiskPct) / 100;
    if (risk > maxRisk + 0.01) {
      await updateOrder(args.userId, args.order.id, {
        status: 'rejected',
        reason: `Gap moved the entry; risk ${risk.toFixed(2)} exceeds the ${args.settings.maxRiskPct}% cap.`,
      });
      return null;
    }
  }

  const position = await createPosition({
    userId: args.userId,
    account: args.account,
    symbol: args.order.symbol,
    side: args.order.side === 'sell' ? 'sell' : 'buy',
    quantity: args.order.quantity,
    price: match.price,
    stopLoss: args.order.stopLoss,
    takeProfit: args.order.takeProfit,
    trailingStopDistance: args.order.trailingStopDistance,
    breakEvenAtR: args.order.breakEvenAtR,
    orderId: args.order.id,
    source: args.source,
    notes: args.order.notes,
    ts: args.now,
    settings: args.settings,
  });

  await updateOrder(args.userId, args.order.id, {
    status: 'filled',
    filledPrice: match.price,
    filledAt: args.now,
    positionId: position.id,
  });

  return position;
}

export interface ProcessQuotesResult {
  filled: number;
  closed: number;
  marked: number;
}

/**
 * Process a quote snapshot for one user. Used by the tick subscriber and the
 * minute fallback job. Closes stops/targets, moves trailing stops, fills
 * resting orders and refreshes unrealised P&L.
 */
export async function processQuotesForUser(args: {
  userId: string;
  quotesBySymbol: ReadonlyMap<string, Quotes>;
  settings: PaperSettings;
  now?: Date;
  source?: string;
  onJournalError?: (err: unknown) => void;
}): Promise<ProcessQuotesResult> {
  const now = args.now ?? new Date();
  const [positions, orders] = await Promise.all([
    listPositions(args.userId, { status: 'open', limit: 100 }),
    listOrders(args.userId, { status: 'pending', limit: 100 }),
  ]);
  const accounts = new Map<string, PaperAccountRow>();
  for (const row of [...positions, ...orders]) {
    if (accounts.has(row.accountId)) continue;
    const account = await getAccount(args.userId, row.accountId);
    if (account) accounts.set(row.accountId, account);
  }

  let closed = 0;
  let marked = 0;
  let filled = 0;

  for (const position of positions) {
    const quotes = args.quotesBySymbol.get(position.symbol);
    if (!quotes) continue;
    const account = accounts.get(position.accountId);
    if (!account) continue;
    const evaluation = evaluatePosition(positionState(position), quotes);

    if (evaluation.close) {
      await applyClose({
        userId: args.userId,
        position,
        account,
        exitPrice: exitWithSlippage(position, evaluation.close.price, args.settings),
        quantity: position.quantity,
        reason: evaluation.close.reason,
        settings: args.settings,
        source: args.source ?? 'tick',
        now,
        ...(args.onJournalError ? { onJournalError: args.onJournalError } : {}),
      });
      closed += 1;
      continue;
    }

    const trailingChanged =
      evaluation.trailingStopPrice !== null &&
      evaluation.trailingStopPrice !== position.trailingStopPrice;
    const pnlChanged = Math.abs(evaluation.unrealizedPnl - position.unrealizedPnl) >= 0.01;
    if (trailingChanged || pnlChanged) {
      await updatePosition(args.userId, position.id, {
        unrealizedPnl: evaluation.unrealizedPnl,
        ...(trailingChanged ? { trailingStopPrice: evaluation.trailingStopPrice } : {}),
      });
      marked += 1;
    }
  }

  for (const order of orders) {
    const quotes = args.quotesBySymbol.get(order.symbol);
    if (!quotes) continue;
    const account = accounts.get(order.accountId);
    if (!account) continue;
    if (order.expiresAt && now > order.expiresAt) {
      await updateOrder(args.userId, order.id, {
        status: 'expired',
        reason: 'Day order expired.',
      });
      continue;
    }
    const position = await fillOrder({
      userId: args.userId,
      order,
      account,
      quotes,
      settings: args.settings,
      now,
      source: args.source ?? 'tick',
    });
    if (position) filled += 1;
  }

  return { filled, closed, marked };
}

// ── Position management ──────────────────────────────────────────────────

export async function closePositionForUser(args: {
  userId: string;
  positionId: string;
  quantity?: number;
  reason?: string;
  settings: PaperSettings;
  source?: string;
  now?: Date;
  signal?: AbortSignal;
  onJournalError?: (err: unknown) => void;
}): Promise<{ position: PositionView; account: AccountView; fill: FillView }> {
  const position = await getPosition(args.userId, args.positionId);
  if (!position) throw new Error('Position not found.');
  if (position.status !== 'open') throw new Error('This position is already closed.');
  const account = await getAccount(args.userId, position.accountId);
  if (!account) throw new Error('Account not found.');

  const tick = await loadTick(position.symbol, args.signal);
  const quotes = quotesFor(position.symbol, tick, args.settings);
  const exitPrice = exitWithSlippage(
    position,
    exitQuote(positionState(position), quotes),
    args.settings,
  );
  const now = args.now ?? new Date();
  const reason: PositionCloseReason = 'manual';

  const result = await applyClose({
    userId: args.userId,
    position,
    account,
    exitPrice,
    quantity: args.quantity ?? position.quantity,
    reason,
    settings: args.settings,
    source: args.source ?? 'manual',
    now,
    ...(args.onJournalError ? { onJournalError: args.onJournalError } : {}),
  });
  const refreshedAccount = (await getAccount(args.userId, account.id)) ?? account;
  return {
    position: positionView(result.position, refreshedAccount),
    account: await accountViewById(args.userId, refreshedAccount),
    fill: result.fill,
  };
}

export async function modifyPositionForUser(args: {
  userId: string;
  positionId: string;
  patch: {
    stopLoss?: number | null;
    takeProfit?: number | null;
    trailingStop?: number | null;
    breakEvenAtR?: number | null;
  };
  settings: PaperSettings;
  signal?: AbortSignal;
}): Promise<{ position: PositionView; account: AccountView }> {
  const position = await getPosition(args.userId, args.positionId);
  if (!position) throw new Error('Position not found.');
  if (position.status !== 'open') throw new Error('This position is already closed.');
  const account = await getAccount(args.userId, position.accountId);
  if (!account) throw new Error('Account not found.');

  const tick = await loadTick(position.symbol, args.signal);
  const quotes = quotesFor(position.symbol, tick, args.settings);
  const reference = quotes.mid;
  const nextStop = args.patch.stopLoss !== undefined ? args.patch.stopLoss : position.stopLoss;
  const nextTarget =
    args.patch.takeProfit !== undefined ? args.patch.takeProfit : position.takeProfit;

  if (args.settings.requireStopLoss && nextStop === null) {
    throw new Error(
      'A stop loss is required on this deployment. Set a new stopLoss instead of clearing it.',
    );
  }

  const geometry =
    position.side === 'short'
      ? { side: 'sell' as const, entryPrice: reference }
      : { side: 'buy' as const, entryPrice: reference };
  const error = validateBracket({
    ...geometry,
    stopLoss: nextStop,
    takeProfit: nextTarget,
    minStopDistance: minStopDistance(position.symbol, args.settings),
  });
  if (error) throw new Error(error);

  const patch: Parameters<typeof updatePosition>[2] = {};
  if (args.patch.stopLoss !== undefined) patch.stopLoss = args.patch.stopLoss;
  if (args.patch.takeProfit !== undefined) patch.takeProfit = args.patch.takeProfit;
  if (args.patch.breakEvenAtR !== undefined) patch.breakEvenAtR = args.patch.breakEvenAtR;
  if (args.patch.trailingStop !== undefined) {
    patch.trailingStopDistance = args.patch.trailingStop;
    if (args.patch.trailingStop === null) patch.trailingStopPrice = null;
  }

  const updated = await updatePosition(args.userId, position.id, patch);
  if (!updated) throw new Error('Position disappeared while updating.');
  const refreshedAccount = (await getAccount(args.userId, account.id)) ?? account;
  return {
    position: positionView(updated, refreshedAccount),
    account: await accountViewById(args.userId, refreshedAccount),
  };
}

export async function cancelOrderForUser(args: {
  userId: string;
  orderId: string;
}): Promise<{ order: OrderView | null; message: string }> {
  const order = await getOrder(args.userId, args.orderId);
  if (!order) throw new Error('Order not found.');
  if (order.status !== 'pending') {
    return { order: orderView(order), message: 'Order is no longer pending.' };
  }
  const updated = await updateOrder(args.userId, order.id, {
    status: 'cancelled',
    reason: 'Cancelled by user.',
  });
  return {
    order: updated ? orderView(updated) : null,
    message: 'Order cancelled.',
  };
}

// ── Reads ────────────────────────────────────────────────────────────────

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
