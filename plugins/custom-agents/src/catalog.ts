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

// Plugin-host catalog consumed by @kestrel/ai. This is the only bridge
// between the Studio's persistence and the Mastra runtime.

import type {
  PluginUserAgentCatalog,
  PluginUserAgentCatalogContext,
  PluginUserAgentDefinition,
} from '@kestrel/plugin-sdk';

import { getCustomAgentBySlug, listCustomAgents } from './db/queries';
import type { CustomAgentRow } from './db/tables';
import { recordAgentRun, resolveRuntimeMcpTools, runtimeDefinition } from './services/agents';
import { normaliseSettings } from './settings';

function toDefinition(
  row: CustomAgentRow,
  ctx: PluginUserAgentCatalogContext,
): PluginUserAgentDefinition {
  return runtimeDefinition(row, ctx.installedPluginIds, ctx.settings);
}

export const customAgentsCatalog: PluginUserAgentCatalog = {
  id: 'custom-agents',

  async listAgents(ctx) {
    const rows = await listCustomAgents(ctx.userId);
    const settings = normaliseSettings(ctx.settings);
    let delegationBudget = settings.maxDelegatedAgents;
    return rows.map((row) => {
      const definition = toDefinition(row, ctx);
      if (definition.delegatable) {
        if (delegationBudget <= 0) definition.delegatable = false;
        else delegationBudget -= 1;
      }
      return definition;
    });
  },

  async getAgent(ctx, slug) {
    const row = await getCustomAgentBySlug(ctx.userId, slug.trim().toLowerCase());
    return row ? toDefinition(row, ctx) : null;
  },

  async resolveMcpTools({ ctx, agent, signal }) {
    return resolveRuntimeMcpTools(agent, signal, ctx.log);
  },

  async recordRun(record) {
    await recordAgentRun(record.ctx.userId, record.agent.id, {
      runId: record.runId,
      threadId: record.threadId,
      status: record.status,
      model: record.model,
      latencyMs: record.latencyMs,
      costUsd: record.costUsd,
      toolCalls: record.toolCalls,
      inputChars: record.inputChars,
      outputChars: record.outputChars,
      ...(record.error !== undefined ? { error: record.error } : {}),
    });
  },
};
