'use server';

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

// SPDX-License-Identifier: Apache-2.0

// Watchlist symbol actions: add (catalog-validated) and remove.
import { getDb } from '@kestrel/ai';
import { requireTenantIdForUser, schema, withRateLimit } from '@kestrel/db';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { type ActionResult } from './_actions-shared';

/**
 * Server action to add a symbol to watchlist.
 */
export async function addSymbolAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_add_symbol', 30);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  let symbol = formData.get('symbol') as string;
  if (!symbol) {
    return { ok: false as const, error: 'Symbol is required' };
  }
  symbol = symbol.trim().toUpperCase();

  if (symbol.length < 2 || symbol.length > 20) {
    return { ok: false as const, error: 'Symbol must be between 2 and 20 characters' };
  }

  try {
    const db = getDb();
    const tenantId = await requireTenantIdForUser(session.user.id, db);

    const inCatalog = await db
      .select({ symbol: schema.symbolCatalog.symbol })
      .from(schema.symbolCatalog)
      .where(
        and(
          eq(schema.symbolCatalog.symbol, symbol),
          eq(schema.symbolCatalog.isActive, true),
          eq(schema.symbolCatalog.tenantId, '__system__'),
        ),
      )
      .limit(1);

    if (inCatalog.length === 0) {
      return { ok: false as const, error: `Symbol "${symbol}" is not supported or active.` };
    }

    const orderResult = await db
      .select({
        maxOrder: sql<number>`coalesce(max(${schema.userSymbols.displayOrder}), -1)`,
      })
      .from(schema.userSymbols)
      .where(
        and(
          eq(schema.userSymbols.userId, session.user.id),
          eq(schema.userSymbols.tenantId, tenantId),
        ),
      );

    const nextOrder = (orderResult[0]?.maxOrder ?? -1) + 1;

    await db
      .insert(schema.userSymbols)
      .values({
        userId: session.user.id,
        tenantId,
        symbol,
        displayOrder: nextOrder,
      })
      .onConflictDoNothing({
        target: [schema.userSymbols.userId, schema.userSymbols.symbol],
      });

    revalidatePath('/settings/symbols');
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to remove a symbol from watchlist.
 */
export async function removeSymbolAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_remove_symbol', 30);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  const symbol = formData.get('symbol') as string;
  if (!symbol) {
    return { ok: false as const, error: 'Symbol is required' };
  }

  try {
    const db = getDb();
    const tenantId = await requireTenantIdForUser(session.user.id, db);
    await db
      .delete(schema.userSymbols)
      .where(
        and(
          eq(schema.userSymbols.userId, session.user.id),
          eq(schema.userSymbols.tenantId, tenantId),
          eq(schema.userSymbols.symbol, symbol),
        ),
      );

    revalidatePath('/settings/symbols');
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
