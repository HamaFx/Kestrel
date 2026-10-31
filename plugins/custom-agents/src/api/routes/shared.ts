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

// Authenticated Custom Agents HTTP routes — shared helpers.
//
// Mounted at /api/plugins/custom-agents/<path> by the core dispatcher. The
// generic primitives live in `@kestrel/plugin-sdk`; only the plugin's error
// mapping and installed-plugin helper stay here.

import { getInstalledPluginIdsForUser } from '@kestrel/db';
import {
  parsePluginBody,
  pluginByMethod,
  pluginJson,
  pluginQuery,
  PluginRouteApiError,
  type PluginApiRouteContext,
  type PluginApiRouteHandler,
} from '@kestrel/plugin-sdk';

import { AgentSlugTakenError } from '../../db/queries';
import { AgentConfigError } from '../../services/agents';
import { McpConfigError } from '../../services/mcp';

export { PluginRouteApiError as ApiError };
export const json = pluginJson;
export const byMethod = pluginByMethod;
export const parseBody = parsePluginBody;
export const query = pluginQuery;

export function errorResponse(err: unknown, ctx: PluginApiRouteContext): Response {
  if (err instanceof PluginRouteApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof AgentSlugTakenError) {
    return json({ error: { code: err.code, message: err.message } }, 409);
  }
  if (err instanceof AgentConfigError || err instanceof McpConfigError) {
    return json({ error: { code: err.code, message: err.message } }, 400);
  }
  ctx.log.error('custom agents api route failed', {
    err: err instanceof Error ? err.message : String(err),
  });
  return json(
    {
      error: {
        code: 'CUSTOM_AGENTS_FAILED',
        message: 'The Agent Studio could not complete this request.',
      },
    },
    500,
  );
}

export function wrap(
  handler: (ctx: PluginApiRouteContext) => Promise<Response>,
): PluginApiRouteHandler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      return errorResponse(err, ctx);
    }
  };
}

export async function installedIds(userId: string): Promise<string[]> {
  return getInstalledPluginIdsForUser(userId, { enabledOnly: true });
}
