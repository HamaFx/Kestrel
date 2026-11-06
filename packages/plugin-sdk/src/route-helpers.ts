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

// Shared HTTP plumbing for plugin API route groups.
//
// The web dispatcher mounts plugin routes at `/api/plugins/<pluginId>/<path>`
// and hands each handler a `PluginApiRouteContext`. These helpers keep the
// JSON envelope, method dispatch, body validation, and query parsing identical
// across plugin packages; plugins keep their own `wrap()`/error mapping so
// plugin-specific error classes can map to their own codes.

import type { z } from 'zod';

import type { PluginApiRouteContext, PluginApiRouteHandler, PluginExecutionContext } from './types';

/**
 * Thrown by plugin route bodies. The plugin's `wrap()` maps it to
 * `{ error: { code, message } }` with the given status.
 */
export class PluginRouteApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PluginRouteApiError';
  }
}

/** JSON response with the plugin API's no-store cache policy. */
export function pluginJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/** Dispatch one route by HTTP method. */
export function pluginByMethod(
  handlers: Partial<Record<string, PluginApiRouteHandler>>,
): PluginApiRouteHandler {
  return async (ctx: PluginApiRouteContext) => {
    const handler = handlers[ctx.request.method.toUpperCase()];
    if (handler) return handler(ctx);
    return pluginJson(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
      405,
    );
  };
}

/** Parse and validate a JSON body, throwing `PluginRouteApiError` on failure. */
export async function parsePluginBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new PluginRouteApiError(400, 'Request body must be valid JSON.', 'INVALID_JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new PluginRouteApiError(400, message, 'INVALID_INPUT');
  }
  return parsed.data;
}

/** The request's query string as `URLSearchParams`. */
export function pluginQuery(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

/** Project a route context onto the plugin execution context. */
export function pluginExecCtx(ctx: PluginApiRouteContext): PluginExecutionContext {
  return {
    pluginId: ctx.pluginId,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    settings: ctx.settings,
    storage: ctx.storage,
    log: ctx.log,
  };
}

export interface PluginRouteHelperOptions {
  /** Log message used for unexpected failures. */
  logLabel: string;
  /** Stable error code for unexpected failures. */
  failureCode: string;
  /** User-safe message for 5xx failures. */
  failureMessage: string;
}

/**
 * Build the per-plugin route surface: JSON helpers, method dispatch, body
 * parsing, and one error mapping. Plugins supply only their error code and
 * user-safe message.
 */
export function createPluginRouteHelpers(options: PluginRouteHelperOptions) {
  function errorResponse(err: unknown, ctx: PluginApiRouteContext, status = 500): Response {
    if (err instanceof PluginRouteApiError) {
      return pluginJson({ error: { code: err.code, message: err.message } }, err.status);
    }
    ctx.log.error(options.logLabel, {
      err: err instanceof Error ? err.message : String(err),
    });
    return pluginJson(
      {
        error: {
          code: options.failureCode,
          message:
            status >= 500
              ? options.failureMessage
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
    wrapOptions: number | { userErrorStatus?: number } = {},
  ): PluginApiRouteHandler {
    const status =
      typeof wrapOptions === 'number' ? wrapOptions : (wrapOptions.userErrorStatus ?? 500);
    return async (ctx) => {
      try {
        return await handler(ctx);
      } catch (err) {
        return errorResponse(err, ctx, status);
      }
    };
  }

  return {
    ApiError: PluginRouteApiError,
    json: pluginJson,
    byMethod: pluginByMethod,
    parseBody: parsePluginBody,
    errorResponse,
    wrap,
  };
}
