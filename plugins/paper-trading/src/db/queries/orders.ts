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

// Paper Trading order queries.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, desc, eq } from 'drizzle-orm';

import type { OrderStatus } from '../../domain';
import { paperOrders, type PaperOrderRow } from '../tables';

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
