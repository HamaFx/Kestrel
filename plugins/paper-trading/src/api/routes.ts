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

// Authenticated Paper Trading HTTP routes.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.

import type { PluginApiRouteContext, PluginApiRouteHandler } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  CancelOrderInputSchema,
  ClosePositionInputSchema,
  ListFillsQuerySchema,
  ListOrdersInputSchema,
  ListPositionsInputSchema,
  ModifyPositionInputSchema,
  PlaceOrderInputSchema,
  ResetAccountInputSchema,
  UpdateAccountInputSchema,
} from '../schemas';
import {
  listAccountViews,
  resetAccountForUser,
  resolvePaperAccount,
  updateAccountForUser,
} from '../services/accounts';
import {
  cancelOrderForUser,
  closePositionForUser,
  getPositionView,
  listFillViews,
  listOrderViews,
  listPositionViews,
  modifyPositionForUser,
  placeOrderForUser,
  summaryForUser,
} from '../services/trading';
import { normaliseSettings } from '../settings';

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'PAPER_TRADING_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function errorResponse(err: unknown, ctx: PluginApiRouteContext, status = 500): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  ctx.log.error('paper trading api route failed', {
    err: err instanceof Error ? err.message : String(err),
  });
  return json(
    {
      error: {
        code: 'PAPER_TRADING_FAILED',
        message:
          status >= 500
            ? 'The Paper Trading broker could not complete this request.'
            : err instanceof Error
              ? err.message
              : String(err),
      },
    },
    status,
  );
}

function wrap(
  handler: (ctx: PluginApiRouteContext) => Promise<Response>,
  userErrorStatus?: number,
): PluginApiRouteHandler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      return errorResponse(err, ctx, userErrorStatus ?? 500);
    }
  };
}

function byMethod(handlers: Partial<Record<string, PluginApiRouteHandler>>): PluginApiRouteHandler {
  return async (ctx) => {
    const handler = handlers[ctx.request.method.toUpperCase()];
    if (!handler) {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405);
    }
    return handler(ctx);
  };
}

async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.', 'INVALID_JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, message, 'INVALID_INPUT');
  }
  return parsed.data;
}

function queryObject(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) result[key] = value;
  return result;
}

// ── Reads ────────────────────────────────────────────────────────────────

const summary = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  return json(await summaryForUser(ctx.userId, settings));
});

const accounts = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const list = await listAccountViews(ctx.userId, settings);
  return json({
    accounts: list,
    totalEquity: Math.round(list.reduce((sum, account) => sum + account.equity, 0) * 100) / 100,
    totalUnrealizedPnl:
      Math.round(list.reduce((sum, account) => sum + account.unrealizedPnl, 0) * 100) / 100,
  });
});

const positions = wrap(async (ctx) => {
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

const orders = wrap(async (ctx) => {
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

const fills = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const parsed = ListFillsQuerySchema.safeParse(queryObject(ctx.request));
  if (!parsed.success) throw new ApiError(400, 'Invalid fills query.', 'INVALID_QUERY');
  const account = parsed.data.account
    ? await resolvePaperAccount(ctx.userId, parsed.data.account, settings)
    : undefined;
  const list = await listFillViews(ctx.userId, {
    ...(account ? { accountId: account.id } : {}),
    limit: parsed.data.limit,
  });
  return json({ fills: list });
});

const getPosition = wrap(async (ctx) => {
  const positionId = ctx.params['positionId'];
  if (!positionId) throw new ApiError(400, 'A position id is required.', 'MISSING_POSITION_ID');
  return json({ position: await getPositionView(ctx.userId, positionId) });
});

// ── Mutations ────────────────────────────────────────────────────────────

const createOrder = wrap(async (ctx) => {
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

const cancelOrder = wrap(async (ctx) => {
  const orderId = ctx.params['orderId'];
  if (!orderId) throw new ApiError(400, 'An order id is required.', 'MISSING_ORDER_ID');
  const parsed = CancelOrderInputSchema.parse({ orderId });
  const result = await cancelOrderForUser({ userId: ctx.userId, orderId: parsed.orderId });
  return json({ ok: true, message: result.message, order: result.order });
}, 400);

const closePosition = wrap(async (ctx) => {
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

const modifyPosition = wrap(async (ctx) => {
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

const updateAccount = wrap(async (ctx) => {
  const accountId = ctx.params['accountId'];
  if (!accountId) throw new ApiError(400, 'An account id is required.', 'MISSING_ACCOUNT_ID');
  const settings = normaliseSettings(ctx.settings);
  const body = await parseBody(ctx.request, UpdateAccountInputSchema.omit({ account: true }));
  const result = await updateAccountForUser(ctx.userId, accountId, settings, {
    ...(body.riskPerTradePct !== undefined ? { riskPerTradePct: body.riskPerTradePct } : {}),
    ...(body.leverage !== undefined ? { leverage: body.leverage } : {}),
  });
  return json({ ok: true, message: `Updated ${result.account.name}.`, account: result.view });
}, 400);

const resetAccount = wrap(async (ctx) => {
  const accountId = ctx.params['accountId'];
  if (!accountId) throw new ApiError(400, 'An account id is required.', 'MISSING_ACCOUNT_ID');
  const settings = normaliseSettings(ctx.settings);
  await parseBody(ctx.request, ResetAccountInputSchema.omit({ account: true }));
  const account = await resetAccountForUser(ctx.userId, accountId, settings);
  return json({ ok: true, message: `Reset ${account.name}.`, account });
}, 400);

export const paperTradingApiRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/summary': byMethod({ GET: summary }),
  '/accounts': byMethod({ GET: accounts }),
  '/accounts/:accountId': byMethod({ PATCH: updateAccount }),
  '/accounts/:accountId/reset': byMethod({ POST: resetAccount }),
  '/positions': byMethod({ GET: positions }),
  '/positions/:positionId': byMethod({ GET: getPosition, PATCH: modifyPosition }),
  '/positions/:positionId/close': byMethod({ POST: closePosition }),
  '/orders': byMethod({ GET: orders, POST: createOrder }),
  '/orders/:orderId': byMethod({ DELETE: cancelOrder }),
  '/fills': byMethod({ GET: fills }),
};
