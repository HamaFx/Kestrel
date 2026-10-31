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

// POST /api/plugins/<pluginId>/tools/<toolId>/confirm
//
// One-click confirmation for plugin write tools whose chat adapter returned a
// `plugin-tool-confirm` envelope (P0-6). Authenticated + tenant-scoped by
// `withAuth`; the tool is only executable when the calling user has the owning
// plugin installed and enabled.

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import { rateLimited, withRateLimit } from '@/lib/services/api-boundary';
import { confirmPluginToolExecution } from '@/lib/services/plugin-tool-confirm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 30 confirmations per minute per user — a double-click ceiling, not a quota. */
const PLUGIN_TOOL_CONFIRM_RATE_LIMIT = 30;

const ConfirmBodySchema = z.object({ input: z.unknown() });

interface ConfirmRouteParams {
  pluginId: string;
  toolId: string;
}

export const POST = withAuth<ConfirmRouteParams>(async (req, { params, user }) => {
  const { pluginId, toolId } = await params;

  const rateLimit = await withRateLimit(
    user.userId,
    'plugin_tool_confirm',
    PLUGIN_TOOL_CONFIRM_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return errorResponse(
      rateLimited('Too many tool confirmations — please retry in a moment.'),
      req,
    );
  }

  try {
    const body = await parseJsonBody(req, ConfirmBodySchema);
    const data = await confirmPluginToolExecution({
      userId: user.userId,
      pluginId,
      toolId,
      input: body.input,
      signal: req.signal,
    });
    return Response.json({ data });
  } catch (error) {
    return errorResponse(error, req);
  }
});
