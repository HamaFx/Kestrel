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

// Authenticated Paper Trading HTTP routes — order handlers.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.

import {
  CancelOrderInputSchema,
  ListOrdersInputSchema,
  PlaceOrderInputSchema,
} from '../../schemas';
import { resolvePaperAccount } from '../../services/accounts';
import { cancelOrderForUser, listOrderViews, placeOrderForUser } from '../../services/trading';
import { normaliseSettings } from '../../settings';
import { ApiError, json, parseBody, queryObject, wrap } from './shared';

export const orders = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const parsed = ListOrdersInputSchema.safeParse(queryObject(ctx.request));
  if (!parsed.success) throw new ApiError(400, 'Invalid order query.', 'INVALID_QUERY');
  const account = parsed.data.account
    ? await resolvePaperAccount(ctx.userId, parsed.data.account, settings)
    : undefined;
  const list = await listOrderViews(ctx.userId, {
    ...(account ? { accountId: account.id } : {}),
    status: parsed.data.status,
    limit: parsed.data.limit,
  });
  return json({ orders: list, count: list.length });
});

export const createOrder = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const input = await parseBody(ctx.request, PlaceOrderInputSchema);
  const result = await placeOrderForUser({
    userId: ctx.userId,
    input,
    settings,
    source: 'manual',
    signal: ctx.request.signal,
  });
  return json(result);
}, 400);

export const cancelOrder = wrap(async (ctx) => {
  const orderId = ctx.params['orderId'];
  if (!orderId) throw new ApiError(400, 'An order id is required.', 'MISSING_ORDER_ID');
  const parsed = CancelOrderInputSchema.parse({ orderId });
  const result = await cancelOrderForUser({ userId: ctx.userId, orderId: parsed.orderId });
  return json({ ok: true, message: result.message, order: result.order });
}, 400);
