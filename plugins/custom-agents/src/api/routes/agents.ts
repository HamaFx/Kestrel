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

// Authenticated Custom Agents HTTP routes — agent CRUD handlers.
//
// Mounted at /api/plugins/custom-agents/<path> by the core dispatcher.

import {
  CreateAgentInputSchema,
  ListAgentsOutputSchema,
  UpdateAgentInputSchema,
} from '../../schemas';
import {
  createAgentForUser,
  deleteAgentForUser,
  getAgentView,
  listAgentViews,
  updateAgentForUser,
} from '../../services/agents';
import { normaliseSettings } from '../../settings';
import { ApiError, installedIds, json, parseBody, query, wrap } from './shared';

export const listAgents = wrap(async (ctx) => {
  const params = query(ctx.request);
  const agents = await listAgentViews(ctx.userId, {
    ...(params.get('q') ? { query: params.get('q')! } : {}),
    delegatableOnly: params.get('delegatable') === '1',
  });
  return json(ListAgentsOutputSchema.parse({ agents, count: agents.length }));
});

export const createAgent = wrap(async (ctx) => {
  const input = await parseBody(ctx.request, CreateAgentInputSchema);
  const settings = normaliseSettings(ctx.settings);
  const agent = await createAgentForUser({
    userId: ctx.userId,
    installedPluginIds: await installedIds(ctx.userId),
    settings: ctx.settings,
    input,
  });
  return json(
    {
      ok: true,
      message: `Created @${agent.slug}.`,
      agent,
      limits: { maxAgents: settings.maxAgents },
    },
    201,
  );
});

export const getAgent = wrap(async (ctx) => {
  const ref = ctx.params['agentId'];
  if (!ref) throw new ApiError(400, 'An agent id or handle is required.', 'MISSING_AGENT');
  const agent = await getAgentView(ctx.userId, ref);
  if (!agent) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  return json({ agent });
});

export const updateAgent = wrap(async (ctx) => {
  const ref = ctx.params['agentId'];
  if (!ref) throw new ApiError(400, 'An agent id or handle is required.', 'MISSING_AGENT');
  const existing = await getAgentView(ctx.userId, ref);
  if (!existing) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  const input = await parseBody(ctx.request, UpdateAgentInputSchema);
  const agent = await updateAgentForUser({
    userId: ctx.userId,
    agentId: existing.id,
    installedPluginIds: await installedIds(ctx.userId),
    settings: ctx.settings,
    input,
  });
  if (!agent) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  return json({ ok: true, message: `Updated @${agent.slug}.`, agent });
});

export const deleteAgent = wrap(async (ctx) => {
  const ref = ctx.params['agentId'];
  if (!ref) throw new ApiError(400, 'An agent id or handle is required.', 'MISSING_AGENT');
  const existing = await getAgentView(ctx.userId, ref);
  if (!existing) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  const deleted = await deleteAgentForUser(ctx.userId, existing.id);
  if (!deleted) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  return json({ ok: true, message: `Deleted @${existing.slug}.` });
});
