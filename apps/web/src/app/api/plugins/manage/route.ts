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

// /api/plugins/manage — 1-click install / uninstall / settings / enable.
//
// Every action is authenticated, tenant-scoped and rate-limited. Lifecycle
// hooks and cache invalidation live in `lib/services/plugin-manage.ts` so this
// route stays a thin controller.

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import { PluginManageRequestSchema } from '@/lib/plugins/manage-schema';
import {
  buildPluginStoreSnapshot,
  enforcePluginManageRateLimit,
  installPluginForUser,
  setPluginEnabledForUser,
  uninstallPluginForUser,
  updatePluginSettingsForUser,
} from '@/lib/services/plugin-manage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const snapshot = await buildPluginStoreSnapshot(user.userId);
    return Response.json(snapshot);
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    await enforcePluginManageRateLimit(user.userId);

    const request = await parseJsonBody(req, PluginManageRequestSchema);

    switch (request.action) {
      case 'install':
        return Response.json(await installPluginForUser(user.userId, request));
      case 'uninstall':
        return Response.json(await uninstallPluginForUser(user.userId, request));
      case 'update-settings':
        return Response.json(await updatePluginSettingsForUser(user.userId, request));
      case 'set-enabled':
        return Response.json(await setPluginEnabledForUser(user.userId, request));
      default: {
        // Exhaustive guard: a new action added to the schema must be handled here.
        const exhaustive: never = request;
        return errorResponse(new Error(`Unsupported plugin action: ${String(exhaustive)}`), req);
      }
    }
  } catch (err) {
    return errorResponse(err, req);
  }
});
