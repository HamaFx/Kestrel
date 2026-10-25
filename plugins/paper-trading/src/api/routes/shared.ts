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

import type { PluginApiRouteContext, PluginApiRouteHandler } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'PAPER_TRADING_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export function errorResponse(err: unknown, ctx: PluginApiRouteContext, status = 500): Response {
  if (err instanceof ApiError) {
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

export function byMethod(
  handlers: Partial<Record<string, PluginApiRouteHandler>>,
): PluginApiRouteHandler {
  return async (ctx) => {
    const handler = handlers[ctx.request.method.toUpperCase()];
    if (!handler) {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405);
    }
    return handler(ctx);
  };
}

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.', 'INVALID_JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, message, 'INVALID_INPUT');
  }
  return parsed.data;
}

export function queryObject(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) result[key] = value;
  return result;
}
