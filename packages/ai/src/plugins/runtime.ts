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

// Per-request plugin runtime.
//
// Resolves which plugins a user has installed (60s cache), decrypts their
// secret settings, and builds execution contexts backed by `plugin_storage`.
// AI turn code never talks to the plugin tables directly.

import {
  listInstalledPlugins,
  pluginStorageClear,
  pluginStorageDelete,
  pluginStorageGet,
  pluginStorageList,
  pluginStorageSet,
} from '@kestrel/db';
import {
  pluginHost,
  type PluginAgentTarget,
  type PluginExecutionContext,
  type PluginStorage,
  type PluginStorageEntry,
  type RegisteredPluginTool,
} from '@kestrel/plugin-sdk';
import { decryptPluginSettings } from '@kestrel/plugin-sdk/settings';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { createSkill, type SkillInput } from '@mastra/core/skills';

const plog = createCategorizedLogger('ai', { component: 'plugin-runtime' });

const CACHE_TTL_MS = 60_000;

export interface InstalledPluginRecord {
  pluginId: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface InstalledPluginRuntime {
  userId: string;
  tenantId: string | null;
  /** Enabled plugin ids, ready to pass into a RequestContext. */
  installedPluginIds: readonly string[];
  plugins: readonly InstalledPluginRecord[];
}

interface CacheEntry {
  expiresAt: number;
  value: InstalledPluginRuntime;
}

// Anchored on globalThis: Next.js can evaluate this module in more than one
// server bundle (instrumentation, route handlers, server components). A
// per-bundle Map would let Install/Uninstall invalidate only one copy, so
// chat would keep the stale install list for up to 60s.
const globalForPluginRuntime = globalThis as unknown as {
  __kestrelPluginRuntimeCache?: Map<string, CacheEntry>;
};

const runtimeCache = (globalForPluginRuntime.__kestrelPluginRuntimeCache ??= new Map<
  string,
  CacheEntry
>());

/**
 * Resolve installed plugins for a user.
 *
 * Fail-open by design: a plugin-table outage must not break core chat. The
 * empty runtime simply exposes no plugin capabilities for that turn.
 */
export async function getInstalledPluginRuntime(userId: string): Promise<InstalledPluginRuntime> {
  const now = Date.now();
  const cached = runtimeCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const rows = await listInstalledPlugins(userId);
    const plugins: InstalledPluginRecord[] = rows.map((row) => {
      const manifest = pluginHost.getPlugin(row.pluginId)?.manifest;
      return {
        pluginId: row.pluginId,
        enabled: row.enabled,
        settings: decryptPluginSettings(
          manifest?.settingsSchema,
          row.settings && typeof row.settings === 'object' ? row.settings : {},
        ),
      };
    });
    const value: InstalledPluginRuntime = {
      userId,
      tenantId: rows[0]?.tenantId ?? null,
      installedPluginIds: plugins.filter((plugin) => plugin.enabled).map((p) => p.pluginId),
      plugins,
    };
    runtimeCache.set(userId, { expiresAt: now + CACHE_TTL_MS, value });
    return value;
  } catch (err) {
    // Cache the empty result too: a plugin-table outage must not turn every
    // specialist step into another failing query. Retries happen after TTL.
    const value: InstalledPluginRuntime = {
      userId,
      tenantId: null,
      installedPluginIds: [],
      plugins: [],
    };
    runtimeCache.set(userId, { expiresAt: now + CACHE_TTL_MS, value });
    if (process.env.NODE_ENV !== 'test') {
      plog.warn('installed-plugin lookup failed; continuing without plugin capabilities', {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return value;
  }
}

/** Drop the cached install list after install / uninstall / settings changes. */
export function invalidateInstalledPluginCache(userId?: string): void {
  if (userId) {
    runtimeCache.delete(userId);
    return;
  }
  runtimeCache.clear();
}

/** Test helper. */
export function clearInstalledPluginCache(): void {
  runtimeCache.clear();
}

export function pluginSettingsFor(
  runtime: InstalledPluginRuntime,
  pluginId: string,
): Record<string, unknown> {
  return runtime.plugins.find((plugin) => plugin.pluginId === pluginId)?.settings ?? {};
}

function createPluginStorage(scope: {
  userId: string;
  tenantId: string;
  pluginId: string;
}): PluginStorage {
  return {
    get: <T = unknown>(collection: string, key: string) =>
      pluginStorageGet(scope, collection, key) as Promise<T | null>,
    set: (collection, key, value) => pluginStorageSet(scope, collection, key, value),
    list: <T = unknown>(collection: string) =>
      pluginStorageList(scope, collection) as Promise<PluginStorageEntry<T>[]>,
    delete: (collection, key) => pluginStorageDelete(scope, collection, key),
    clear: (collection) => pluginStorageClear(scope, collection),
  };
}

export function createPluginExecutionContext(args: {
  userId: string;
  tenantId: string;
  pluginId: string;
  settings: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  requestContext?: unknown;
}): PluginExecutionContext {
  const log = createCategorizedLogger('ai', { component: 'plugin', pluginId: args.pluginId });
  return {
    pluginId: args.pluginId,
    userId: args.userId,
    tenantId: args.tenantId,
    settings: args.settings,
    storage: createPluginStorage({
      userId: args.userId,
      tenantId: args.tenantId,
      pluginId: args.pluginId,
    }),
    log: {
      debug: (message, fields) => log.debug(message, fields),
      info: (message, fields) => log.info(message, fields),
      warn: (message, fields) => log.warn(message, fields),
      error: (message, fields) => log.error(message, fields),
    },
    ...(args.signal ? { signal: args.signal } : {}),
    ...(args.requestContext !== undefined ? { requestContext: args.requestContext } : {}),
  };
}

/** Plugin tools for one core agent target, filtered by user-disabled tools. */
export function resolvePluginToolsForAgent(
  runtime: InstalledPluginRuntime,
  target: PluginAgentTarget,
  disabledTools?: readonly string[],
): readonly RegisteredPluginTool[] {
  if (runtime.tenantId === null || runtime.installedPluginIds.length === 0) return [];
  return pluginHost.resolveToolsForUser(runtime.installedPluginIds, {
    target,
    disabledTools: disabledTools ?? [],
  });
}

/** Mastra `skills` input for this user (inline objects or SKILL.md paths). */
/**
 * Mastra `skills` input for this user.
 *
 * Inline plugin skills are converted through `createSkill()` so Mastra
 * receives fully resolved `Skill` objects (paths are passed through and
 * resolved by Mastra at agent construction time).
 */
export function resolvePluginSkills(runtime: InstalledPluginRuntime): readonly SkillInput[] {
  const result: SkillInput[] = [];
  for (const entry of pluginHost.resolveSkillsForUser(runtime.installedPluginIds)) {
    if (typeof entry.skill === 'string') {
      result.push(entry.skill);
      continue;
    }
    try {
      result.push(
        createSkill({
          name: entry.skill.name,
          description: entry.skill.description,
          instructions: entry.skill.instructions,
          ...(entry.skill.references ? { references: entry.skill.references } : {}),
          ...(entry.skill.metadata ? { metadata: entry.skill.metadata } : {}),
        }),
      );
    } catch (err) {
      plog.warn('plugin skill rejected by Mastra validator', {
        pluginId: entry.pluginId,
        skill: entry.skill.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

/** Build a Mastra execution context for one plugin registration. */
export function pluginExecutionContextFor(
  runtime: InstalledPluginRuntime,
  tool: RegisteredPluginTool,
  options?: { signal?: AbortSignal; requestContext?: unknown },
): PluginExecutionContext {
  return createPluginExecutionContext({
    userId: runtime.userId,
    tenantId: runtime.tenantId ?? '',
    pluginId: tool.pluginId,
    settings: pluginSettingsFor(runtime, tool.pluginId),
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.requestContext !== undefined ? { requestContext: options.requestContext } : {}),
  });
}
