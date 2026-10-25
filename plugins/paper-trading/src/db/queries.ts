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

// Paper Trading persistence helpers.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, count, desc, eq } from 'drizzle-orm';

import type { AccountMode, OrderStatus, PositionStatus } from '../domain';
import {
  paperAccounts,
  paperFills,
  paperOrders,
  paperPositions,
  paperStrategyRuns,
  type PaperAccountRow,
  type PaperFillRow,
  type PaperOrderRow,
  type PaperPositionRow,
  type PaperStrategyRunInsert,
  type PaperStrategyRunRow,
} from './tables';

// ── Accounts ─────────────────────────────────────────────────────────────

export async function listAccounts(userId: string): Promise<PaperAccountRow[]> {
  const db = getDb();
  return db
    .select()
    .from(paperAccounts)
    .where(eq(paperAccounts.userId, userId))
    .orderBy(desc(paperAccounts.createdAt));
}

export async function getAccount(
  userId: string,
  accountId: string,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperAccounts)
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.id, accountId)))
    .limit(1);
  return rows[0];
}

export async function findAccountByMode(
  userId: string,
  mode: AccountMode,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperAccounts)
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.mode, mode)))
    .limit(1);
  return rows[0];
}

export interface SeedAccountInput {
  userId: string;
  name: string;
  mode: AccountMode;
  initialBalance: number;
  leverage: number;
  riskPerTradePct: number;
}

/** Idempotent seed: an existing account for the mode is never overwritten. */
export async function seedAccount(input: SeedAccountInput): Promise<PaperAccountRow> {
  const existing = await findAccountByMode(input.userId, input.mode);
  if (existing) return existing;

  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperAccounts)
    .values({
      tenantId,
      userId: input.userId,
      name: input.name,
      mode: input.mode,
      currency: 'USD',
      initialBalance: input.initialBalance,
      balance: input.initialBalance,
      leverage: input.leverage,
      riskPerTradePct: input.riskPerTradePct,
      status: 'active',
      seeded: true,
    })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];

  const raced = await findAccountByMode(input.userId, input.mode);
  if (!raced) throw new Error('[paper-trading] account seed conflicted without a row');
  return raced;
}

export interface AccountSettingsPatch {
  riskPerTradePct?: number;
  leverage?: number;
}

export async function updateAccountSettings(
  userId: string,
  accountId: string,
  patch: AccountSettingsPatch,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const values: Partial<typeof paperAccounts.$inferInsert> = {};
  if (patch.riskPerTradePct !== undefined) values.riskPerTradePct = patch.riskPerTradePct;
  if (patch.leverage !== undefined) values.leverage = patch.leverage;
  if (Object.keys(values).length === 0) return getAccount(userId, accountId);
  values.updatedAt = new Date();
  const rows = await db
    .update(paperAccounts)
    .set(values)
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.id, accountId)))
    .returning();
  return rows[0];
}

/** Set the realised cash balance (after a close/reset). */
export async function setAccountBalance(
  userId: string,
  accountId: string,
  balance: number,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(paperAccounts)
    .set({ balance, updatedAt: new Date() })
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.id, accountId)))
    .returning();
  return rows[0];
}

/** Wipe the account ledger and restore the initial balance. */
export async function resetAccount(
  userId: string,
  accountId: string,
): Promise<PaperAccountRow | undefined> {
  const account = await getAccount(userId, accountId);
  if (!account) return undefined;
  const db = getDb();
  await db
    .delete(paperFills)
    .where(and(eq(paperFills.userId, userId), eq(paperFills.accountId, accountId)));
  await db
    .delete(paperOrders)
    .where(and(eq(paperOrders.userId, userId), eq(paperOrders.accountId, accountId)));
  await db
    .delete(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.accountId, accountId)));
  return setAccountBalance(userId, accountId, account.initialBalance);
}

/** Uninstall + wipe: remove every row owned by this user. */
export async function deleteAllPaperData(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(paperStrategyRuns).where(eq(paperStrategyRuns.userId, userId));
  await db.delete(paperFills).where(eq(paperFills.userId, userId));
  await db.delete(paperOrders).where(eq(paperOrders.userId, userId));
  await db.delete(paperPositions).where(eq(paperPositions.userId, userId));
  await db.delete(paperAccounts).where(eq(paperAccounts.userId, userId));
}

// ── Deployed strategy runs ───────────────────────────────────────────────

export async function listStrategyRuns(
  userId: string,
  status?: 'active' | 'paused' | 'stopped' | 'error',
): Promise<PaperStrategyRunRow[]> {
  const db = getDb();
  const filters = [eq(paperStrategyRuns.userId, userId)];
  if (status) filters.push(eq(paperStrategyRuns.status, status));
  return db
    .select()
    .from(paperStrategyRuns)
    .where(and(...filters))
    .orderBy(desc(paperStrategyRuns.updatedAt));
}

export async function getStrategyRun(
  userId: string,
  strategyRunId: string,
): Promise<PaperStrategyRunRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperStrategyRuns)
    .where(and(eq(paperStrategyRuns.userId, userId), eq(paperStrategyRuns.id, strategyRunId)))
    .limit(1);
  return rows[0];
}

export async function insertStrategyRun(
  input: Omit<PaperStrategyRunInsert, 'tenantId'>,
): Promise<PaperStrategyRunRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperStrategyRuns)
    .values({ ...input, tenantId })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[paper-trading] strategy run insert returned no row');
  return row;
}

export interface StrategyRunPatch {
  status?: 'active' | 'paused' | 'stopped' | 'error';
  lastBarTime?: Date | null;
  lastSignal?: string | null;
  lastSignalAt?: Date | null;
  positionId?: string | null;
  signalCount?: number;
  orderCount?: number;
  lastError?: string | null;
}

export async function updateStrategyRun(
  userId: string,
  strategyRunId: string,
  patch: StrategyRunPatch,
): Promise<PaperStrategyRunRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(paperStrategyRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(paperStrategyRuns.userId, userId), eq(paperStrategyRuns.id, strategyRunId)))
    .returning();
  return rows[0];
}

export async function deleteStrategyRun(userId: string, strategyRunId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(paperStrategyRuns)
    .where(and(eq(paperStrategyRuns.userId, userId), eq(paperStrategyRuns.id, strategyRunId)))
    .returning({ id: paperStrategyRuns.id });
  return rows.length > 0;
}

// ── Positions ────────────────────────────────────────────────────────────

export interface InsertPositionInput {
  userId: string;
  accountId: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  initialQuantity: number;
  entryPrice: number;
  entryTime: Date;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopDistance: number | null;
  breakEvenAtR: number | null;
  initialRiskAmount: number;
  entryFee: number;
  source: string;
  notes: string | null;
}

export async function insertPosition(input: InsertPositionInput): Promise<PaperPositionRow> {
  const account = await getAccount(input.userId, input.accountId);
  if (!account) throw new Error('[paper-trading] account not found');
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperPositions)
    .values({
      tenantId,
      userId: input.userId,
      accountId: input.accountId,
      symbol: input.symbol,
      side: input.side,
      status: 'open',
      quantity: input.quantity,
      initialQuantity: input.initialQuantity,
      entryPrice: input.entryPrice,
      entryTime: input.entryTime,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      trailingStopDistance: input.trailingStopDistance,
      trailingStopPrice: null,
      breakEvenAtR: input.breakEvenAtR,
      initialRiskAmount: input.initialRiskAmount,
      unrealizedPnl: 0,
      realizedPnl: 0,
      entryFee: input.entryFee,
      exitFee: 0,
      closePrice: null,
      closeTime: null,
      closeReason: null,
      source: input.source,
      notes: input.notes,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[paper-trading] position insert returned no row');
  return row;
}

export async function getPosition(
  userId: string,
  positionId: string,
): Promise<PaperPositionRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.id, positionId)))
    .limit(1);
  return rows[0];
}

export async function listPositions(
  userId: string,
  opts: {
    accountId?: string;
    symbol?: string;
    status?: PositionStatus | 'all';
    limit?: number;
  } = {},
): Promise<PaperPositionRow[]> {
  const db = getDb();
  const filters = [eq(paperPositions.userId, userId)];
  if (opts.accountId) filters.push(eq(paperPositions.accountId, opts.accountId));
  if (opts.symbol) filters.push(eq(paperPositions.symbol, opts.symbol));
  if (opts.status && opts.status !== 'all') filters.push(eq(paperPositions.status, opts.status));
  return db
    .select()
    .from(paperPositions)
    .where(and(...filters))
    .orderBy(desc(paperPositions.entryTime))
    .limit(Math.max(1, Math.min(opts.limit ?? 50, 100)));
}

export async function listOpenPositionsForSymbol(
  userId: string,
  symbol: string,
): Promise<PaperPositionRow[]> {
  const db = getDb();
  return db
    .select()
    .from(paperPositions)
    .where(
      and(
        eq(paperPositions.userId, userId),
        eq(paperPositions.status, 'open'),
        eq(paperPositions.symbol, symbol),
      ),
    )
    .limit(200);
}

export async function listOpenPositions(userId: string): Promise<PaperPositionRow[]> {
  return listPositions(userId, { status: 'open', limit: 100 });
}

export interface PositionPatch {
  quantity?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  trailingStopDistance?: number | null;
  trailingStopPrice?: number | null;
  breakEvenAtR?: number | null;
  unrealizedPnl?: number;
  realizedPnl?: number;
  initialRiskAmount?: number;
  entryFee?: number;
  status?: 'open' | 'closed';
  closePrice?: number | null;
  closeTime?: Date | null;
  closeReason?: string | null;
  exitFee?: number;
  journalEntryId?: string | null;
}

export async function updatePosition(
  userId: string,
  positionId: string,
  patch: PositionPatch,
): Promise<PaperPositionRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(paperPositions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.id, positionId)))
    .returning();
  return rows[0];
}

// ── Orders ───────────────────────────────────────────────────────────────

export interface InsertOrderInput {
  userId: string;
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  quantity: number;
  riskPct: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopDistance: number | null;
  breakEvenAtR: number | null;
  timeInForce: 'gtc' | 'day';
  notes: string | null;
  expiresAt: Date | null;
}

export async function insertOrder(input: InsertOrderInput): Promise<PaperOrderRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperOrders)
    .values({
      tenantId,
      userId: input.userId,
      accountId: input.accountId,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      status: 'pending',
      quantity: input.quantity,
      riskPct: input.riskPct,
      limitPrice: input.limitPrice,
      stopPrice: input.stopPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      trailingStopDistance: input.trailingStopDistance,
      breakEvenAtR: input.breakEvenAtR,
      timeInForce: input.timeInForce,
      filledPrice: null,
      filledAt: null,
      positionId: null,
      reason: null,
      notes: input.notes,
      expiresAt: input.expiresAt,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[paper-trading] order insert returned no row');
  return row;
}

export async function getOrder(
  userId: string,
  orderId: string,
): Promise<PaperOrderRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperOrders)
    .where(and(eq(paperOrders.userId, userId), eq(paperOrders.id, orderId)))
    .limit(1);
  return rows[0];
}

export async function listOrders(
  userId: string,
  opts: {
    accountId?: string;
    symbol?: string;
    status?: OrderStatus | 'all';
    limit?: number;
  } = {},
): Promise<PaperOrderRow[]> {
  const db = getDb();
  const filters = [eq(paperOrders.userId, userId)];
  if (opts.accountId) filters.push(eq(paperOrders.accountId, opts.accountId));
  if (opts.symbol) filters.push(eq(paperOrders.symbol, opts.symbol));
  if (opts.status && opts.status !== 'all') filters.push(eq(paperOrders.status, opts.status));
  return db
    .select()
    .from(paperOrders)
    .where(and(...filters))
    .orderBy(desc(paperOrders.createdAt))
    .limit(Math.max(1, Math.min(opts.limit ?? 50, 100)));
}

export async function listPendingOrdersForSymbol(
  userId: string,
  symbol: string,
): Promise<PaperOrderRow[]> {
  const db = getDb();
  return db
    .select()
    .from(paperOrders)
    .where(
      and(
        eq(paperOrders.userId, userId),
        eq(paperOrders.status, 'pending'),
        eq(paperOrders.symbol, symbol),
      ),
    )
    .limit(200);
}

export interface OrderPatch {
  status?: OrderStatus;
  filledPrice?: number | null;
  filledAt?: Date | null;
  positionId?: string | null;
  reason?: string | null;
}

export async function updateOrder(
  userId: string,
  orderId: string,
  patch: OrderPatch,
): Promise<PaperOrderRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(paperOrders)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(paperOrders.userId, userId), eq(paperOrders.id, orderId)))
    .returning();
  return rows[0];
}

// ── Fills ────────────────────────────────────────────────────────────────

export interface InsertFillInput {
  userId: string;
  accountId: string;
  positionId: string | null;
  orderId: string | null;
  kind: string;
  price: number;
  quantity: number;
  pnl: number;
  fees: number;
  ts: Date;
  meta?: Record<string, unknown>;
}

export async function insertFill(input: InsertFillInput): Promise<PaperFillRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperFills)
    .values({
      tenantId,
      userId: input.userId,
      accountId: input.accountId,
      positionId: input.positionId,
      orderId: input.orderId,
      kind: input.kind,
      price: input.price,
      quantity: input.quantity,
      pnl: input.pnl,
      fees: input.fees,
      ts: input.ts,
      meta: input.meta ?? {},
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[paper-trading] fill insert returned no row');
  return row;
}

export async function listFills(
  userId: string,
  opts: { accountId?: string; limit?: number } = {},
): Promise<PaperFillRow[]> {
  const db = getDb();
  const filters = [eq(paperFills.userId, userId)];
  if (opts.accountId) filters.push(eq(paperFills.accountId, opts.accountId));
  return db
    .select()
    .from(paperFills)
    .where(and(...filters))
    .orderBy(desc(paperFills.ts))
    .limit(Math.max(1, Math.min(opts.limit ?? 50, 200)));
}

// ── Interest / counts ────────────────────────────────────────────────────

/** Distinct symbols with an open position or pending order for this user. */
export async function listWatchedSymbols(userId: string): Promise<string[]> {
  const db = getDb();
  const [positionSymbols, orderSymbols] = await Promise.all([
    db
      .selectDistinct({ symbol: paperPositions.symbol })
      .from(paperPositions)
      .where(and(eq(paperPositions.userId, userId), eq(paperPositions.status, 'open'))),
    db
      .selectDistinct({ symbol: paperOrders.symbol })
      .from(paperOrders)
      .where(and(eq(paperOrders.userId, userId), eq(paperOrders.status, 'pending'))),
  ]);
  return [...new Set([...positionSymbols, ...orderSymbols].map((row) => row.symbol))];
}

export async function countOpenPositions(userId: string, accountId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ value: count() })
    .from(paperPositions)
    .where(
      and(
        eq(paperPositions.userId, userId),
        eq(paperPositions.accountId, accountId),
        eq(paperPositions.status, 'open'),
      ),
    );
  return Number(rows[0]?.value ?? 0);
}
