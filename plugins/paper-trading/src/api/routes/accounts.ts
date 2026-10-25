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

// Authenticated Paper Trading HTTP routes — account + summary handlers.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.

import { ResetAccountInputSchema, UpdateAccountInputSchema } from '../../schemas';
import {
  listAccountViews,
  resetAccountForUser,
  updateAccountForUser,
} from '../../services/accounts';
import { summaryForUser } from '../../services/trading';
import { normaliseSettings } from '../../settings';
import { ApiError, json, parseBody, wrap } from './shared';

export const summary = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  return json(await summaryForUser(ctx.userId, settings));
});

export const accounts = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const list = await listAccountViews(ctx.userId, settings);
  return json({
    accounts: list,
    totalEquity: Math.round(list.reduce((sum, account) => sum + account.equity, 0) * 100) / 100,
    totalUnrealizedPnl:
      Math.round(list.reduce((sum, account) => sum + account.unrealizedPnl, 0) * 100) / 100,
  });
});

export const updateAccount = wrap(async (ctx) => {
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

export const resetAccount = wrap(async (ctx) => {
  const accountId = ctx.params['accountId'];
  if (!accountId) throw new ApiError(400, 'An account id is required.', 'MISSING_ACCOUNT_ID');
  const settings = normaliseSettings(ctx.settings);
  await parseBody(ctx.request, ResetAccountInputSchema.omit({ account: true }));
  const account = await resetAccountForUser(ctx.userId, accountId, settings);
  return json({ ok: true, message: `Reset ${account.name}.`, account });
}, 400);
