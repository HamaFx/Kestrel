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

// Shared HTTP plumbing for the Backtesting Lab route groups: error mapping,
// JSON responses, body validation and method dispatch. The generic primitives
// live in `@kestrel/plugin-sdk`; only the plugin-specific error mapping and
// query helpers stay here.

import {
  parsePluginBody,
  pluginByMethod,
  pluginJson,
  pluginQuery,
  PluginRouteApiError,
  type PluginApiRouteContext,
  type PluginApiRouteHandler,
  type PluginExecutionContext,
} from '@kestrel/plugin-sdk';

export { PluginRouteApiError as ApiError };
export const json = pluginJson;
export const byMethod = pluginByMethod;
export const parseBody = parsePluginBody;

function errorResponse(err: unknown, ctx: PluginApiRouteContext, defaultStatus = 500): Response {
  if (err instanceof PluginRouteApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  ctx.log.error('backtesting api route failed', {
    err: err instanceof Error ? err.message : String(err),
  });
  return json(
    {
      error: {
        code: 'BACKTESTING_FAILED',
        message:
          defaultStatus >= 500
            ? 'The Backtesting Lab could not complete this request.'
            : err instanceof Error
              ? err.message
              : String(err),
      },
    },
    defaultStatus,
  );
}

export function wrap(
  handler: (ctx: PluginApiRouteContext) => Promise<Response>,
  options: { userErrorStatus?: number } = {},
): PluginApiRouteHandler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      return errorResponse(err, ctx, options.userErrorStatus ?? 500);
    }
  };
}

export function execCtx(ctx: PluginApiRouteContext): PluginExecutionContext {
  return {
    pluginId: ctx.pluginId,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    settings: ctx.settings,
    storage: ctx.storage,
    log: ctx.log,
  };
}

export function queryNumber(request: Request, key: string, fallback: number): number {
  const raw = pluginQuery(request).get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
