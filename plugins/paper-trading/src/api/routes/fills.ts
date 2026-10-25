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

// Authenticated Paper Trading HTTP routes — fill handlers.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.

import { ListFillsQuerySchema } from '../../schemas';
import { resolvePaperAccount } from '../../services/accounts';
import { listFillViews } from '../../services/trading';
import { normaliseSettings } from '../../settings';
import { ApiError, json, queryObject, wrap } from './shared';

export const fills = wrap(async (ctx) => {
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
