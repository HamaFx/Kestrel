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

// Input sanitisation for custom agents: models, tools, skills, skill refs
// and remote MCP servers.

import { pluginHost } from '@kestrel/plugin-sdk';

import type { StoredMcpServer } from '../../db/tables';
import type { CustomSkill, McpServerInput, SkillRef } from '../../schemas';
import type { CustomAgentSettings } from '../../settings';
import { prepareMcpServers, validateMcpUrl } from '../mcp';
import { AgentConfigError } from './errors';

const MODEL_RE = /^[a-z0-9][a-z0-9._-]*:[^\s:]+$/i;

export function normaliseModel(
  value: string | null,
  settings: CustomAgentSettings,
  useDefault: boolean,
): string | null {
  const raw = value === undefined && useDefault ? settings.defaultModel : value;
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  if (!MODEL_RE.test(trimmed)) {
    throw new AgentConfigError(
      'Model must use the provider:model format, e.g. deepseek:deepseek-chat.',
    );
  }
  return trimmed;
}

export function pluginToolMap(installedPluginIds: readonly string[]) {
  const map = new Map<string, { pluginId: string; access: string }>();
  for (const tool of pluginHost.resolveToolsForUser(installedPluginIds)) {
    map.set(tool.name, { pluginId: tool.pluginId, access: tool.access });
  }
  return map;
}

function coreToolNames(): Set<string> {
  return new Set(pluginHost.getCoreTools().map((tool) => tool.name));
}

export function sanitizeTools(
  tools: readonly string[],
  settings: CustomAgentSettings,
  installedPluginIds: readonly string[],
): string[] {
  const core = coreToolNames();
  const plugins = pluginToolMap(installedPluginIds);
  const out: string[] = [];
  for (const name of [...new Set(tools)]) {
    if (core.has(name)) {
      out.push(name);
      continue;
    }
    const plugin = plugins.get(name);
    if (!plugin) {
      throw new AgentConfigError(
        `Tool "${name}" is not available. Install the owning plugin first.`,
      );
    }
    if (plugin.access === 'write' && !settings.allowWriteTools) {
      throw new AgentConfigError(
        `Tool "${name}" can change data. Enable "Allow write tools" in Custom Agents settings first.`,
      );
    }
    out.push(name);
  }
  return out.slice(0, 40);
}

export function sanitizeSkills(skills: readonly CustomSkill[]): CustomSkill[] {
  const seen = new Set<string>();
  const out: CustomSkill[] = [];
  for (const skill of skills) {
    if (seen.has(skill.name)) {
      throw new AgentConfigError(`Skill "${skill.name}" is duplicated.`);
    }
    seen.add(skill.name);
    out.push({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      ...(skill.references ? { references: skill.references } : {}),
    });
  }
  return out.slice(0, 12);
}

export function sanitizeSkillRefs(
  refs: readonly SkillRef[],
  installedPluginIds: readonly string[],
): SkillRef[] {
  const installed = new Set(installedPluginIds);
  const seen = new Set<string>();
  const out: SkillRef[] = [];
  for (const ref of refs) {
    if (!installed.has(ref.pluginId)) continue;
    const key = `${ref.pluginId}:${ref.skill}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pluginId: ref.pluginId, skill: ref.skill });
  }
  return out.slice(0, 24);
}

export function sanitizeMcpServers(
  servers: readonly McpServerInput[],
  settings: CustomAgentSettings,
  existing: readonly StoredMcpServer[] = [],
): StoredMcpServer[] {
  if (servers.length === 0) return [];
  if (!settings.allowMcp) {
    throw new AgentConfigError('Remote MCP servers are disabled in Custom Agents settings.');
  }
  if (servers.length > settings.maxMcpServers) {
    throw new AgentConfigError(
      `At most ${settings.maxMcpServers} MCP servers are allowed per agent.`,
    );
  }
  for (const server of servers) validateMcpUrl(server.url);
  return prepareMcpServers(servers, existing);
}
