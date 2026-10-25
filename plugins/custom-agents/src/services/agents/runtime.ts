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

// Runtime definition + MCP tool resolution for custom agents.

import type { CustomAgentRow } from '../../db/tables';
import { normaliseSettings } from '../../settings';
import { decryptMcpServers, resolveMcpTools } from '../mcp';
import { resolveSkillRefs } from '../skills';
import { pluginToolMap } from './sanitizers';

/**
 * Convert a stored row into the runtime definition the AI package consumes.
 * Missing plugin skills/MCP are dropped rather than failing the whole agent.
 */
export function runtimeDefinition(
  row: CustomAgentRow,
  installedPluginIds: readonly string[],
  rawSettings: Readonly<Record<string, unknown>>,
) {
  const settings = normaliseSettings(rawSettings);
  const pluginTools = pluginToolMap(installedPluginIds);
  const tools = (Array.isArray(row.tools) ? row.tools : []).filter((name) => {
    const plugin = pluginTools.get(name);
    if (!plugin) return true; // core tool (validated by the AI builder)
    if (plugin.access === 'write' && !settings.allowWriteTools) return false;
    return true;
  });
  const mcpServers = settings.allowMcp
    ? decryptMcpServers(row.mcpServers).slice(0, settings.maxMcpServers)
    : [];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    tools,
    skills: [
      ...(Array.isArray(row.skills) ? row.skills : []).map((skill) => ({
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        ...(skill.references ? { references: skill.references } : {}),
      })),
      ...resolveSkillRefs(row.skillRefs, installedPluginIds),
    ],
    model: row.model,
    mcpServers,
    delegatable: row.delegatable && settings.maxDelegatedAgents > 0,
    metadata: {
      starterTemplate: row.starterTemplate,
      runCount: row.runCount,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

/** Resolve MCP tools for a runtime definition. */
export async function resolveRuntimeMcpTools(
  definition: { mcpServers?: readonly { id: string; url: string; authorization?: string }[] },
  signal?: AbortSignal,
  logger?: { warn(message: string, fields?: Record<string, unknown>): void },
): Promise<Record<string, unknown>> {
  return resolveMcpTools({
    servers: definition.mcpServers ?? [],
    ...(signal ? { signal } : {}),
    ...(logger ? { logger } : {}),
  });
}
