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

import 'server-only';

// Dispatch for plugin-owned HTTP endpoints.
//
// The web route is a thin authenticated shell; this service resolves the
// caller's installed plugins, matches the plugin's declared route pattern,
// and builds the same execution context (decrypted settings + storage) that
// plugin tools and jobs receive.

import {
  createPluginExecutionContext,
  getInstalledPluginRuntime,
  syncPluginCoreTools,
} from '@kestrel/ai/plugins';
import {
  listInstalledPlugins,
  requireTenantIdForUser,
  withAdminDb,
  withTenantDb,
  type InstalledPluginRow,
} from '@kestrel/db';
import {
  pluginHost,
  type PluginApiRouteHandler,
  type PluginPublicApiRouteHandler,
  type PluginPublicInstall,
} from '@kestrel/plugin-sdk';
import { decryptPluginSettings } from '@kestrel/plugin-sdk/settings';
import { ensureBundledPluginsRegistered } from '@kestrel/plugins';
import { createCategorizedLogger } from '@kestrel/shared/logger';

try {
  ensureBundledPluginsRegistered();
} catch (err) {
  console.error('[plugin-api] bundled plugin registration failed', err);
}

export interface DispatchPluginApiRequestInput {
  request: Request;
  userId: string;
  pluginId: string;
  segments: readonly string[];
}

interface RouteMatch<T> {
  handler: T;
  params: Record<string, string>;
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Match a declared route against the request path.
 *
 * Static routes are checked before parameterised ones. `:name` segments
 * capture a single decoded path component; a trailing `*` captures the rest.
 */
export function matchPluginApiRoute<T>(
  routes: Readonly<Record<string, T>> | undefined,
  segments: readonly string[],
): RouteMatch<T> | null {
  if (!routes) return null;

  const candidates = Object.entries(routes)
    .map(([pattern, handler]) => ({
      pattern,
      handler,
      parts: pattern.replace(/^\/+/, '').split('/').filter(Boolean),
    }))
    .filter(({ parts }) => {
      const hasWildcard = parts.at(-1) === '*';
      if (hasWildcard) return segments.length >= parts.length - 1;
      return parts.length === segments.length;
    })
    .sort((a, b) => {
      const aDynamic = a.parts.some((part) => part.startsWith(':') || part === '*');
      const bDynamic = b.parts.some((part) => part.startsWith(':') || part === '*');
      return Number(aDynamic) - Number(bDynamic);
    });

  for (const candidate of candidates) {
    const params: Record<string, string> = {};
    let matched = true;

    for (let index = 0; index < candidate.parts.length; index += 1) {
      const part = candidate.parts[index]!;
      if (part === '*') {
        params['*'] = segments.slice(index).join('/');
        break;
      }
      const segment = segments[index];
      if (segment === undefined) {
        matched = false;
        break;
      }
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segment);
        continue;
      }
      if (part !== segment) {
        matched = false;
        break;
      }
    }

    if (matched) return { handler: candidate.handler, params };
  }

  return null;
}

export async function dispatchPluginApiRequest({
  request,
  userId,
  pluginId,
  segments,
}: DispatchPluginApiRequestInput): Promise<Response> {
  const plugin = pluginHost.getPlugin(pluginId);
  if (!plugin) {
    return jsonError('PLUGIN_NOT_FOUND', `Unknown plugin "${pluginId}"`, 404);
  }

  const runtime = await getInstalledPluginRuntime(userId);
  if (!runtime.installedPluginIds.includes(pluginId) || !runtime.tenantId) {
    return jsonError('PLUGIN_NOT_INSTALLED', `Plugin "${pluginId}" is not installed`, 404);
  }

  let match: RouteMatch<PluginApiRouteHandler> | null;
  try {
    match = matchPluginApiRoute(pluginHost.getApiRoutes(pluginId), segments);
  } catch {
    return jsonError('PLUGIN_ROUTE_INVALID', 'Malformed plugin route path', 400);
  }
  if (!match) {
    return jsonError('PLUGIN_ROUTE_NOT_FOUND', 'Plugin route not found', 404);
  }

  // The custom-agent studio reads the reviewed core tool catalog from the
  // host. Populate it lazily when a route chunk is evaluated without the
  // Next instrumentation boot path (dev, tests, isolated workers).
  if (pluginHost.getCoreTools().length === 0) {
    try {
      await syncPluginCoreTools();
    } catch (err) {
      console.error('[plugin-api] core tool catalog registration failed', err);
    }
  }

  const ctx = createPluginExecutionContext({
    userId: runtime.userId,
    tenantId: runtime.tenantId,
    pluginId,
    settings: runtime.plugins.find((entry) => entry.pluginId === pluginId)?.settings ?? {},
    signal: request.signal,
  });

  try {
    const response = await match.handler({
      request,
      params: match.params,
      pluginId,
      userId: runtime.userId,
      tenantId: runtime.tenantId,
      settings: ctx.settings,
      storage: ctx.storage,
      log: ctx.log,
    });
    if (!(response instanceof Response)) {
      return jsonError('PLUGIN_INVALID_RESPONSE', 'Plugin returned a non-Response value', 500);
    }
    return response;
  } catch (err) {
    ctx.log.error('plugin api route failed', {
      pluginId,
      path: segments.join('/'),
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonError('PLUGIN_ROUTE_FAILED', 'Plugin request failed', 500);
  }
}

// ── Public plugin transport routes ────────────────────────────────────────
//
// Mounted at /api/plugins/public/<pluginId>/<...path>. These are intentionally
// unauthenticated: they exist for provider webhooks (Telegram, etc.). The
// plugin handler is responsible for authenticating the transport and for
// resolving the owning user. `getInstall` never returns an install for a user
// who has not installed + enabled the plugin.

const publicApiLog = createCategorizedLogger('api', { component: 'plugin-public-api' });

export interface DispatchPluginPublicApiRequestInput {
  request: Request;
  pluginId: string;
  segments: readonly string[];
}

export async function dispatchPluginPublicApiRequest({
  request,
  pluginId,
  segments,
}: DispatchPluginPublicApiRequestInput): Promise<Response> {
  const plugin = pluginHost.getPlugin(pluginId);
  if (!plugin) {
    return jsonError('PLUGIN_NOT_FOUND', `Unknown plugin "${pluginId}"`, 404);
  }

  let match: RouteMatch<PluginPublicApiRouteHandler> | null;
  try {
    match = matchPluginApiRoute(pluginHost.getPublicApiRoutes(pluginId), segments);
  } catch {
    return jsonError('PLUGIN_ROUTE_INVALID', 'Malformed plugin route path', 400);
  }
  if (!match) {
    return jsonError('PLUGIN_ROUTE_NOT_FOUND', 'Plugin route not found', 404);
  }

  const getInstall = async (userId: string): Promise<PluginPublicInstall | null> => {
    if (!userId) return null;

    // Public transport routes are not inside an authenticated tenant
    // transaction. Resolve only this user's install through the admin
    // connection, then run all plugin work inside the tenant-scoped storage
    // adapter. The caller MUST have authenticated the userId (HMAC token).
    let row: InstalledPluginRow | undefined;
    try {
      row = await withAdminDb(async (db) => {
        const rows = await listInstalledPlugins(userId, db);
        return rows.find((entry) => entry.pluginId === pluginId && entry.enabled);
      });
    } catch (err) {
      // Local/single-role deployments may not configure ADMIN_DATABASE_URL.
      // Fall back to the primary connection; RLS still protects the read in
      // any deployment that enforces it.
      publicApiLog.warn('admin DB unavailable for public plugin install lookup; using primary', {
        pluginId,
        err: err instanceof Error ? err.message : String(err),
      });
      const tenantId = await requireTenantIdForUser(userId);
      const rows = await withTenantDb(tenantId, () => listInstalledPlugins(userId), { userId });
      row = rows.find((entry) => entry.pluginId === pluginId && entry.enabled);
    }
    if (!row) return null;

    const manifest = pluginHost.getPlugin(pluginId)?.manifest;
    const settings = decryptPluginSettings(
      manifest?.settingsSchema,
      row.settings && typeof row.settings === 'object' ? row.settings : {},
    );
    const ctx = createPluginExecutionContext({
      userId,
      tenantId: row.tenantId,
      pluginId,
      settings,
    });
    return {
      userId,
      tenantId: row.tenantId,
      settings,
      storage: ctx.storage,
    };
  };

  try {
    const response = await match.handler({
      request,
      params: match.params,
      pluginId,
      log: {
        debug: (message, fields) => publicApiLog.debug(message, fields),
        info: (message, fields) => publicApiLog.info(message, fields),
        warn: (message, fields) => publicApiLog.warn(message, fields),
        error: (message, fields) => publicApiLog.error(message, fields),
      },
      getInstall,
    });
    if (!(response instanceof Response)) {
      return jsonError('PLUGIN_INVALID_RESPONSE', 'Plugin returned a non-Response value', 500);
    }
    return response;
  } catch (err) {
    publicApiLog.error('public plugin route failed', {
      pluginId,
      path: segments.join('/'),
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonError('PLUGIN_ROUTE_FAILED', 'Plugin request failed', 500);
  }
}
