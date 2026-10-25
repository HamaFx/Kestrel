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

// Skills, MCP connections, and allowlisted core-tool composition.

import type { PluginInlineSkill } from '@kestrel/plugin-sdk';
import { createSkill, type SkillInput } from '@mastra/core/skills';

import { adaptLegacyReadOnlyTool } from '../mastra-v2/agents/xauusd/legacy-tool-adapter';
import { NATIVE_CANONICAL_TOOLS, resolveNativeCanonicalTool } from '../mastra-v2/tools/canonical';
import {
  buildCatalogContext,
  customAgentCoreTools,
  MAX_SKILL_CHARS,
  MCP_TIMEOUT_MS,
  type CustomAgentDescriptor,
} from './agent-catalog';
import { alog } from './agent-log';
import type { InstalledPluginRuntime } from './runtime';

export function toMastraSkills(inputs: readonly (PluginInlineSkill | string)[]): SkillInput[] {
  const out: SkillInput[] = [];
  for (const input of inputs) {
    if (typeof input === 'string') {
      out.push(input);
      continue;
    }
    if (input.instructions.length > MAX_SKILL_CHARS) {
      alog.warn('custom agent skill too long; truncating', { skill: input.name });
    }
    try {
      out.push(
        createSkill({
          name: input.name,
          description: input.description,
          instructions: input.instructions.slice(0, MAX_SKILL_CHARS),
          ...(input.references ? { references: input.references } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        }),
      );
    } catch (err) {
      alog.warn('custom agent skill rejected by Mastra validator', {
        skill: input.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

export async function resolveMcpTools(args: {
  descriptor: CustomAgentDescriptor;
  runtime: InstalledPluginRuntime;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const { descriptor, runtime, signal } = args;
  if (!descriptor.catalog.resolveMcpTools) return {};
  if (!descriptor.agent.mcpServers || descriptor.agent.mcpServers.length === 0) return {};

  const ctx = buildCatalogContext(runtime, descriptor.pluginId);
  const timeout = AbortSignal.timeout(MCP_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const tools = await descriptor.catalog.resolveMcpTools({
      ctx,
      agent: descriptor.agent,
      signal: combined,
    });
    if (!tools || typeof tools !== 'object') return {};
    return tools;
  } catch (err) {
    alog.warn('MCP tools could not be resolved; continuing without them', {
      pluginId: descriptor.pluginId,
      agent: descriptor.agent.slug,
      err: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

export async function coreToolsFor(selected: readonly string[]): Promise<Record<string, unknown>> {
  // Lazy: loading the registry pulls every tool module, and `@ai/plugins` is
  // itself imported by agent code during module initialization.
  const { registerAllTools, toolRegistry } = await import('@ai/tools');
  registerAllTools(toolRegistry);
  const allowed = customAgentCoreTools();
  const result: Record<string, unknown> = {};
  for (const name of selected) {
    if (!allowed.has(name)) continue;
    if (result[name] !== undefined) continue;
    const native = resolveNativeCanonicalTool(name) ?? NATIVE_CANONICAL_TOOLS[name] ?? null;
    if (native) {
      result[name] = native;
      continue;
    }
    const legacy = toolRegistry.getPlugin(name)?.tool;
    if (legacy) result[name] = adaptLegacyReadOnlyTool(name, legacy);
  }
  return result;
}
