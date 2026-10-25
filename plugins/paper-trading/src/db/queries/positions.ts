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

// Paper Trading position queries.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, count, desc, eq } from 'drizzle-orm';

import type { PositionStatus } from '../../domain';
import { paperPositions, type PaperPositionRow } from '../tables';
import { getAccount } from './accounts';

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
