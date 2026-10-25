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

// Agent-facing tools for the Custom Agent Studio.
//
// The canonical chat agent can list, inspect, create, update and delete a
// user's standalone agents. Mutations are write tools, so Kestrel's approval
// card is always shown before the change is applied.

import { getInstalledPluginIdsForUser } from '@kestrel/db';
import type { PluginExecutionContext, PluginToolRegistration } from '@kestrel/plugin-sdk';
import { z } from 'zod';

import {
  AgentSlugSchema,
  CreateAgentInputSchema,
  CreateAgentOutputSchema,
  DeleteAgentOutputSchema,
  DeleteAgentToolInputSchema,
  GetAgentInputSchema,
  GetAgentOutputSchema,
  ListAgentsInputSchema,
  ListAgentsOutputSchema,
  UpdateAgentToolInputSchema,
} from './schemas';
import {
  createAgentForUser,
  deleteAgentForUser,
  getAgentView,
  listAgentViews,
  updateAgentForUser,
} from './services/agents';
import { AGENT_TEMPLATES } from './templates';

async function installedIds(userId: string): Promise<string[]> {
  return getInstalledPluginIdsForUser(userId, { enabledOnly: true });
}

async function requireAgent(ctx: PluginExecutionContext, ref: string) {
  const agent = await getAgentView(ctx.userId, ref);
  if (!agent) throw new Error(`No custom agent @${ref} exists.`);
  return agent;
}

const listTool: PluginToolRegistration<
  z.infer<typeof ListAgentsInputSchema>,
  z.infer<typeof ListAgentsOutputSchema>
> = {
  name: 'custom_agent_list',
  description:
    'List the user’s standalone custom agents with their @handle, model, tools, skills and whether the main chat may delegate to them. Use before creating or editing an agent, or when the user asks which agents they have.',
  inputSchema: ListAgentsInputSchema,
  outputSchema: ListAgentsOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  // Keep instructions out of the model prompt for list calls; the UI card
  // still receives the full payload for the Studio.
  toModelOutput: (output) => ({
    count: output.count,
    agents: output.agents.map((agent) => ({
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      model: agent.model,
      tools: agent.tools,
      delegatable: agent.delegatable,
      runCount: agent.runCount,
    })),
  }),
  execute: async (input, ctx) => {
    const agents = await listAgentViews(ctx.userId, {
      ...(input.query ? { query: input.query } : {}),
      delegatableOnly: input.delegatableOnly,
    });
    return { agents, count: agents.length };
  },
};

const getTool: PluginToolRegistration<
  z.infer<typeof GetAgentInputSchema>,
  z.infer<typeof GetAgentOutputSchema>
> = {
  name: 'custom_agent_get',
  description:
    'Read one custom agent by @handle, including its full instructions, tools, skills, MCP servers and recent run count.',
  inputSchema: GetAgentInputSchema,
  outputSchema: GetAgentOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (input, ctx) => {
    const agent = await requireAgent(ctx, input.slug);
    return { agent };
  },
};

const createTool: PluginToolRegistration<
  z.infer<typeof CreateAgentInputSchema>,
  z.infer<typeof CreateAgentOutputSchema>
> = {
  name: 'custom_agent_create',
  description: [
    'Create a standalone custom agent (not a committee desk).',
    'Provide a name, an optional @handle (slug), and real system instructions (at least 20 characters).',
    'tools accepts core tool ids (e.g. get_price, get_news, compute_risk) and installed-plugin tool ids (e.g. backtest_run_strategy, paper_list_positions). Write tools are rejected unless the user enabled them in Custom Agents settings.',
    'skills accepts inline Markdown skills: {name, description, instructions, references?}.',
    'skillRefs accepts installed plugin skills: {pluginId, skill}.',
    'mcpServers accepts remote MCP endpoints: {id, url, authorization?}; https is required for non-local hosts.',
    'The user must approve this write before it is applied.',
  ].join(' '),
  inputSchema: CreateAgentInputSchema,
  outputSchema: CreateAgentOutputSchema,
  access: 'write',
  requiresConfirmation: true,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const agent = await createAgentForUser({
      userId: ctx.userId,
      installedPluginIds: await installedIds(ctx.userId),
      settings: ctx.settings,
      input,
    });
    return { ok: true, message: `Created @${agent.slug}.`, agent };
  },
};

const updateTool: PluginToolRegistration<
  z.infer<typeof UpdateAgentToolInputSchema>,
  z.infer<typeof CreateAgentOutputSchema>
> = {
  name: 'custom_agent_update',
  description:
    'Update a custom agent by @handle. Only the fields you send are changed. Send a new slug to rename the handle, or set delegatable=true to let the main chat delegate to it. The user must approve this write.',
  inputSchema: UpdateAgentToolInputSchema,
  outputSchema: CreateAgentOutputSchema,
  access: 'write',
  requiresConfirmation: true,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const existing = await requireAgent(ctx, input.agent);
    const agent = await updateAgentForUser({
      userId: ctx.userId,
      agentId: existing.id,
      installedPluginIds: await installedIds(ctx.userId),
      settings: ctx.settings,
      input: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.tools !== undefined ? { tools: input.tools } : {}),
        ...(input.skills !== undefined ? { skills: input.skills } : {}),
        ...(input.skillRefs !== undefined ? { skillRefs: input.skillRefs } : {}),
        ...(input.mcpServers !== undefined ? { mcpServers: input.mcpServers } : {}),
        ...(input.delegatable !== undefined ? { delegatable: input.delegatable } : {}),
      },
    });
    if (!agent) throw new Error(`No custom agent @${input.agent} exists.`);
    return { ok: true, message: `Updated @${agent.slug}.`, agent };
  },
};

const deleteTool: PluginToolRegistration<
  z.infer<typeof DeleteAgentToolInputSchema>,
  z.infer<typeof DeleteAgentOutputSchema>
> = {
  name: 'custom_agent_delete',
  description:
    'Delete a custom agent by @handle. This removes its instructions, skills and MCP configuration. The user must approve this write.',
  inputSchema: DeleteAgentToolInputSchema,
  outputSchema: DeleteAgentOutputSchema,
  access: 'write',
  requiresConfirmation: true,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const existing = await requireAgent(ctx, input.agent);
    await deleteAgentForUser(ctx.userId, existing.id);
    return { ok: true, message: `Deleted @${existing.slug}.` };
  },
};

const TemplateListInputSchema = z.object({});
const TemplateListOutputSchema = z.object({
  templates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: AgentSlugSchema,
      description: z.string(),
      tools: z.array(z.string()),
      delegatable: z.boolean(),
    }),
  ),
});

const templatesTool: PluginToolRegistration<
  z.infer<typeof TemplateListInputSchema>,
  z.infer<typeof TemplateListOutputSchema>
> = {
  name: 'custom_agent_templates',
  description:
    'List the four optional starter agent blueprints (ICT mentor, quant coder, macro analyst, risk coach) with their handles and tools. Use custom_agent_create to instantiate one, or tell the user to add it in the Agent Studio.',
  inputSchema: TemplateListInputSchema,
  outputSchema: TemplateListOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat'],
  execute: async () => ({
    templates: AGENT_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      slug: template.slug,
      description: template.description,
      tools: [...template.tools],
      delegatable: template.delegatable,
    })),
  }),
};

export const customAgentTools: readonly PluginToolRegistration[] = [
  listTool,
  getTool,
  createTool,
  updateTool,
  deleteTool,
  templatesTool,
];
