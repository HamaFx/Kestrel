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

// Authenticated Custom Agents HTTP routes — run history handlers.
//
// Mounted at /api/plugins/custom-agents/<path> by the core dispatcher.

import { ListAgentRunsOutputSchema } from '../../schemas';
import { getAgentView, listAgentRunViews } from '../../services/agents';
import { ApiError, json, query, wrap } from './shared';

export const listAgentRuns = wrap(async (ctx) => {
  const ref = ctx.params['agentId'];
  if (!ref) throw new ApiError(400, 'An agent id or handle is required.', 'MISSING_AGENT');
  const agent = await getAgentView(ctx.userId, ref);
  if (!agent) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  const limit = Math.min(100, Math.max(1, Number(query(ctx.request).get('limit') ?? 20) || 20));
  const runs = await listAgentRunViews(ctx.userId, agent.id, limit);
  return json(ListAgentRunsOutputSchema.parse({ runs, count: runs.length }));
});
