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

// Authenticated Paper Trading HTTP routes — shared helpers.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.
// The generic primitives live in `@kestrel/plugin-sdk`; only the plugin's
// error mapping and query object helper stay here.

import {
  parsePluginBody,
  pluginByMethod,
  pluginJson,
  pluginQuery,
  PluginRouteApiError,
  type PluginApiRouteContext,
  type PluginApiRouteHandler,
} from '@kestrel/plugin-sdk';

export { PluginRouteApiError as ApiError };
export const json = pluginJson;
export const byMethod = pluginByMethod;
export const parseBody = parsePluginBody;

function errorResponse(err: unknown, ctx: PluginApiRouteContext, status = 500): Response {
  if (err instanceof PluginRouteApiError) {
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

export function wrap(
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

export function queryObject(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of pluginQuery(request).entries()) result[key] = value;
  return result;
}
