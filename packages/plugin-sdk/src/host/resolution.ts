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

// Per-user capability resolution over the host's registries.
//
// These are free functions over the live maps so the `PluginHost` class can
// keep its state private: every resolver is fail-closed — nothing is returned
// for a plugin the caller did not pass in `installedPluginIds`.

import type {
  PluginId,
  RegisteredPluginAgent,
  RegisteredPluginJob,
  RegisteredPluginSkill,
  RegisteredPluginTool,
  RegisteredPluginUserAgentCatalog,
} from '../types';
import type { RegisteredPlugin, ResolveToolsOptions } from './plugin-host';

/** Installed manifests in the order supplied, ignoring unknown ids. */
export function installedPlugins(
  plugins: ReadonlyMap<PluginId, RegisteredPlugin>,
  installedPluginIds: readonly string[],
): readonly RegisteredPlugin[] {
  const seen = new Set<string>();
  const result: RegisteredPlugin[] = [];
  for (const id of installedPluginIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const plugin = plugins.get(id);
    if (plugin) result.push(plugin);
  }
  return result;
}

/**
 * Resolve the plugin tools a user may see.
 *
 * The result is fail-closed: tools from plugins not in `installedPluginIds`
 * are never returned, even if every plugin is registered in the process.
 */
export function resolveTools(
  tools: ReadonlyMap<string, RegisteredPluginTool>,
  installedPluginIds: readonly string[],
  options: ResolveToolsOptions = {},
): readonly RegisteredPluginTool[] {
  const installed = new Set(installedPluginIds);
  if (installed.size === 0) return [];
  const disabled = new Set(options.disabledTools ?? []);
  const target = options.target;
  return [...tools.values()].filter((tool) => {
    if (!installed.has(tool.pluginId)) return false;
    if (disabled.has(tool.name)) return false;
    if (target && !tool.attachTo.includes(target)) return false;
    return true;
  });
}

export function resolveSkills(
  plugins: ReadonlyMap<PluginId, RegisteredPlugin>,
  installedPluginIds: readonly string[],
): readonly RegisteredPluginSkill[] {
  const result: RegisteredPluginSkill[] = [];
  for (const plugin of installedPlugins(plugins, installedPluginIds)) {
    for (const skill of plugin.skills) {
      result.push({ pluginId: plugin.manifest.id, skill });
    }
  }
  return result;
}

export function resolveAgents(
  agents: ReadonlyMap<string, RegisteredPluginAgent>,
  installedPluginIds: readonly string[],
): readonly RegisteredPluginAgent[] {
  const installed = new Set(installedPluginIds);
  if (installed.size === 0) return [];
  return [...agents.values()].filter((agent) => installed.has(agent.pluginId));
}

/**
 * Per-user agent catalogs belonging to installed plugins.
 *
 * The core asks each catalog for its user's agents; a catalog from an
 * uninstalled plugin is never returned.
 */
export function resolveAgentCatalogs(
  agentCatalogs: ReadonlyMap<string, RegisteredPluginUserAgentCatalog>,
  installedPluginIds: readonly string[],
): readonly RegisteredPluginUserAgentCatalog[] {
  const installed = new Set(installedPluginIds);
  if (installed.size === 0) return [];
  return [...agentCatalogs.values()].filter((catalog) => installed.has(catalog.pluginId));
}

export function resolveJobs(
  jobs: ReadonlyMap<string, RegisteredPluginJob>,
  installedPluginIds: readonly string[],
): readonly RegisteredPluginJob[] {
  const installed = new Set(installedPluginIds);
  if (installed.size === 0) return [];
  return [...jobs.values()].filter((job) => installed.has(job.pluginId));
}
