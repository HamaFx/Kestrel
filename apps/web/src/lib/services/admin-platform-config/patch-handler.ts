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

// PATCH dispatch for /api/admin/platform-config.

import type { AdminUser } from '@/lib/auth/admin-auth';
import { errorResponse, parseJsonBody } from '@/lib/http/api';

import { clearApiKeyAction, saveApiKeyAction } from './api-key-actions';
import { resolvePlatformConfigTarget } from './context';
import { PatchSchema } from './schema';
import {
  updateBudgetAction,
  updateDisabledToolsAction,
  updateMarketDataAction,
  updateRoutingAction,
} from './settings-actions';

export async function handlePatchPlatformConfig(req: Request, user: AdminUser): Promise<Response> {
  try {
    const body = await parseJsonBody(req, PatchSchema);
    const ctx = await resolvePlatformConfigTarget(user.userId);

    switch (body.action) {
      case 'save_api_key':
        return saveApiKeyAction(ctx, user, body);
      case 'clear_api_key':
        return clearApiKeyAction(ctx, user, body);
      case 'update_routing':
        return updateRoutingAction(ctx, user, body);
      case 'update_market_data':
        return updateMarketDataAction(ctx, user, body);
      case 'update_disabled_tools':
        return updateDisabledToolsAction(ctx, user, body);
      case 'update_budget':
        return updateBudgetAction(ctx, user, body);
    }

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
