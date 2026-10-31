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
//
// Confirmation (P0-6): `requiresConfirmation` tools are NOT passed to Mastra's
// `requireApproval`, whose `tool-call-approval` suspension Kestrel's stream
// adapters never resume (the tool hangs). Instead the execute wrapper evaluates
// the policy itself and returns a stateless confirmation envelope with a `_ui`
// payload; the chat UI renders a Confirm card that re-executes the tool via
// POST /api/plugins/<pluginId>/tools/<toolId>/confirm. The model sees a clean
// view without `_ui`.

import type { PluginExecutionContext, RegisteredPluginTool } from '@kestrel/plugin-sdk';
import {
  PLUGIN_TOOL_CONFIRM_KIND,
  PLUGIN_TOOL_CONFIRM_MESSAGE,
  pluginToolConfirmationModelOutput,
  PluginToolConfirmationResultSchema,
  type PluginToolConfirmationResult,
} from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { createReadOnlyToolExecute } from '../mastra-v2/agents/xauusd/legacy-tool-adapter';
import {
  pluginExecutionContextFor,
  runWithPluginTenantScope,
  type InstalledPluginRuntime,
} from './runtime';

const plog = createCategorizedLogger('ai', { component: 'plugin-tools' });

export interface BuildPluginMastraToolsArgs {
  runtime: InstalledPluginRuntime;
  tools: readonly RegisteredPluginTool[];
  signal?: AbortSignal;
  requestContext?: unknown;
}

/** Evaluate the tool's static/dynamic confirmation policy for one call. */
async function requiresToolConfirmation(
  tool: RegisteredPluginTool,
  ctx: PluginExecutionContext,
  input: unknown,
): Promise<boolean> {
  const approval = tool.requiresConfirmation;
  if (typeof approval === 'function') {
    return Boolean(await approval(input as never, ctx));
  }
  return approval === true;
}

function buildPluginToolConfirmation(
  tool: RegisteredPluginTool,
  input: unknown,
): PluginToolConfirmationResult {
  return {
    status: 'confirmation_required',
    requiresConfirmation: true,
    pluginId: tool.pluginId,
    toolId: tool.name,
    description: tool.description,
    proposedInput: input,
    message: PLUGIN_TOOL_CONFIRM_MESSAGE,
    _ui: {
      kind: PLUGIN_TOOL_CONFIRM_KIND,
      pluginId: tool.pluginId,
      toolId: tool.name,
      description: tool.description,
      proposedInput: input,
    },
  };
}

/** Model-facing view of a confirmation envelope, or null for real outputs. */
function confirmationModelOutput(
  output: unknown,
): ReturnType<typeof pluginToolConfirmationModelOutput> | null {
  const parsed = PluginToolConfirmationResultSchema.safeParse(output);
  return parsed.success ? pluginToolConfirmationModelOutput(parsed.data) : null;
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

      result[tool.name] = createTool({
        id: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        // The execute wrapper returns either the tool's own output or the
        // stateless confirmation envelope when the policy requires approval.
        outputSchema: z.union([tool.outputSchema, PluginToolConfirmationResultSchema]),
        toModelOutput: (output: unknown) =>
          confirmationModelOutput(output) ?? tool.toModelOutput?.(output as never),
        execute: createReadOnlyToolExecute<unknown, unknown>(
          `plugin-${tool.pluginId}-${tool.name}`,
          tool.name,
          async (input) => {
            if (await requiresToolConfirmation(tool, ctx, input)) {
              return buildPluginToolConfirmation(tool, input);
            }
            // Streaming turns run after the request transaction commits; the
            // tool's own queries need an active tenant scope.
            return runWithPluginTenantScope(ctx.userId, ctx.tenantId, () =>
              tool.execute(input, ctx),
            );
          },
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
