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

// Adapts framework-free plugin tool registrations into Mastra tools.
//
// The adapter is the only place that knows about Mastra's `createTool`
// contract, so plugin authors never import @mastra/core and the plugin-sdk
// stays usable from the worker and tests.

import type { RegisteredPluginTool } from '@kestrel/plugin-sdk';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { createTool } from '@mastra/core/tools';

import { createReadOnlyToolExecute } from '../mastra-v2/agents/xauusd/legacy-tool-adapter';
import { pluginExecutionContextFor, type InstalledPluginRuntime } from './runtime';

const plog = createCategorizedLogger('ai', { component: 'plugin-tools' });

export interface BuildPluginMastraToolsArgs {
  runtime: InstalledPluginRuntime;
  tools: readonly RegisteredPluginTool[];
  signal?: AbortSignal;
  requestContext?: unknown;
}

/** Build a Mastra tool record keyed by plugin tool id. */
export function buildPluginMastraTools({
  runtime,
  tools,
  signal,
  requestContext,
}: BuildPluginMastraToolsArgs): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const tool of tools) {
    try {
      const ctx = pluginExecutionContextFor(runtime, tool, {
        ...(signal ? { signal } : {}),
        ...(requestContext !== undefined ? { requestContext } : {}),
      });

      const approval = tool.requiresConfirmation;
      const requireApproval =
        typeof approval === 'function'
          ? (input: unknown) => approval(input, ctx)
          : approval === true
            ? true
            : undefined;

      result[tool.name] = createTool({
        id: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        ...(tool.toModelOutput ? { toModelOutput: tool.toModelOutput } : {}),
        ...(requireApproval !== undefined ? { requireApproval } : {}),
        execute: createReadOnlyToolExecute<unknown, unknown>(
          `plugin-${tool.pluginId}-${tool.name}`,
          tool.name,
          async (input) => tool.execute(input, ctx),
          { agentId: `kestrel-plugin:${tool.pluginId}` },
        ),
      });
    } catch (err) {
      // Fail open for the turn: a malformed plugin tool must never take the
      // core agent offline.
      plog.warn('plugin tool could not be registered with Mastra; skipping', {
        pluginId: tool.pluginId,
        tool: tool.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

/** Merge plugin tools into a core tool record without overwriting core ids. */
export function mergePluginTools(
  coreTools: Record<string, unknown>,
  pluginTools: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...coreTools };
  for (const [name, tool] of Object.entries(pluginTools)) {
    if (merged[name] !== undefined) continue;
    merged[name] = tool;
  }
  return merged;
}
