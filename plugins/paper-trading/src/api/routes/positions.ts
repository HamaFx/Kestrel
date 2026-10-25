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

// Authenticated Paper Trading HTTP routes — position handlers.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.

import {
  ClosePositionInputSchema,
  ListPositionsInputSchema,
  ModifyPositionInputSchema,
} from '../../schemas';
import { resolvePaperAccount } from '../../services/accounts';
import {
  closePositionForUser,
  getPositionView,
  listPositionViews,
  modifyPositionForUser,
} from '../../services/trading';
import { normaliseSettings } from '../../settings';
import { ApiError, json, parseBody, queryObject, wrap } from './shared';

export const positions = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const parsed = ListPositionsInputSchema.safeParse(queryObject(ctx.request));
  if (!parsed.success) throw new ApiError(400, 'Invalid position query.', 'INVALID_QUERY');
  const account = parsed.data.account
    ? await resolvePaperAccount(ctx.userId, parsed.data.account, settings)
    : undefined;
  const list = await listPositionViews(ctx.userId, {
    ...(account ? { accountId: account.id } : {}),
    ...(parsed.data.symbol ? { symbol: parsed.data.symbol } : {}),
    status: parsed.data.status,
    limit: parsed.data.limit,
  });
  return json({ positions: list, count: list.length });
});

export const getPosition = wrap(async (ctx) => {
  const positionId = ctx.params['positionId'];
  if (!positionId) throw new ApiError(400, 'A position id is required.', 'MISSING_POSITION_ID');
  return json({ position: await getPositionView(ctx.userId, positionId) });
});

export const closePosition = wrap(async (ctx) => {
  const positionId = ctx.params['positionId'];
  if (!positionId) throw new ApiError(400, 'A position id is required.', 'MISSING_POSITION_ID');
  const settings = normaliseSettings(ctx.settings);
  const body = await parseBody(ctx.request, ClosePositionInputSchema.omit({ positionId: true }));
  const result = await closePositionForUser({
    userId: ctx.userId,
    positionId,
    ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
    ...(body.reason !== undefined ? { reason: body.reason } : {}),
    settings,
    source: 'manual',
    signal: ctx.request.signal,
    onJournalError: (err) =>
      ctx.log.warn('paper trade closed but journal sync failed', {
        err: err instanceof Error ? err.message : String(err),
      }),
  });
  return json({
    ok: true,
    message:
      result.position.status === 'closed'
        ? `Closed ${result.position.initialQuantity} ${result.position.symbol}.`
        : `Partially closed ${body.quantity ?? 0} ${result.position.symbol}.`,
    ...result,
  });
}, 400);

export const modifyPosition = wrap(async (ctx) => {
  const positionId = ctx.params['positionId'];
  if (!positionId) throw new ApiError(400, 'A position id is required.', 'MISSING_POSITION_ID');
  const settings = normaliseSettings(ctx.settings);
  const body = await parseBody(ctx.request, ModifyPositionInputSchema.omit({ positionId: true }));
  const result = await modifyPositionForUser({
    userId: ctx.userId,
    positionId,
    patch: {
      ...(body.stopLoss !== undefined ? { stopLoss: body.stopLoss } : {}),
      ...(body.takeProfit !== undefined ? { takeProfit: body.takeProfit } : {}),
      ...(body.trailingStop !== undefined ? { trailingStop: body.trailingStop } : {}),
      ...(body.breakEvenAtR !== undefined ? { breakEvenAtR: body.breakEvenAtR } : {}),
    },
    settings,
    signal: ctx.request.signal,
  });
  return json({ ok: true, message: 'Position protection updated.', position: result.position });
}, 400);
