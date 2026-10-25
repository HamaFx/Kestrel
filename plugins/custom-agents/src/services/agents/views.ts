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

// Row → view mapping for custom agents and their runs.

import {
  getCustomAgentById,
  getCustomAgentBySlug,
  listCustomAgentRuns,
  listCustomAgents,
} from '../../db/queries';
import type { CustomAgentRow } from '../../db/tables';
import type { AgentRunView, AgentView } from '../../schemas';

export function agentView(row: CustomAgentRow): AgentView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    model: row.model,
    tools: Array.isArray(row.tools) ? row.tools : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    skillRefs: Array.isArray(row.skillRefs) ? row.skillRefs : [],
    mcpServers: (Array.isArray(row.mcpServers) ? row.mcpServers : []).map((server) => ({
      id: server.id,
      url: server.url,
      hasAuthorization: Boolean(server.authorization),
    })),
    delegatable: row.delegatable,
    starterTemplate: row.starterTemplate,
    runCount: row.runCount,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAgentViews(
  userId: string,
  options: { query?: string; delegatableOnly?: boolean } = {},
): Promise<AgentView[]> {
  const rows = await listCustomAgents(userId);
  const query = options.query?.trim().toLowerCase();
  return rows
    .filter((row) => (options.delegatableOnly ? row.delegatable : true))
    .filter((row) =>
      query
        ? row.name.toLowerCase().includes(query) ||
          row.slug.includes(query) ||
          row.description.toLowerCase().includes(query)
        : true,
    )
    .map(agentView);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getAgentView(userId: string, ref: string): Promise<AgentView | null> {
  const bySlug = await getCustomAgentBySlug(userId, ref.trim().toLowerCase());
  if (bySlug) return agentView(bySlug);
  if (!UUID_RE.test(ref)) return null;
  const byId = await getCustomAgentById(userId, ref);
  return byId ? agentView(byId) : null;
}

export async function listAgentRunViews(
  userId: string,
  agentId: string,
  limit = 20,
): Promise<AgentRunView[]> {
  const rows = await listCustomAgentRuns(userId, agentId, limit);
  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status === 'failed' || row.status === 'cancelled' ? row.status : 'succeeded',
    model: row.model,
    latencyMs: row.latencyMs,
    costUsd: row.costUsd,
    toolCalls: row.toolCalls,
    inputChars: row.inputChars,
    outputChars: row.outputChars,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  }));
}
