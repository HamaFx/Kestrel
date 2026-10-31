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

import type { PluginApiRouteContext, PluginApiRouteHandler } from './types';

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
