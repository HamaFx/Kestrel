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

// Authenticated Custom Agents HTTP routes.
//
// Mounted at /api/plugins/custom-agents/<path> by the core dispatcher.
// This barrel keeps the previous `api/routes` import path working.

import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from './agents';
import {
  catalog,
  extractPdf,
  importAgentMarkdown,
  installTemplate,
  validateSkill,
} from './knowledge';
import { listAgentRuns } from './runs';
import { byMethod } from './shared';

export const customAgentsApiRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/agents': byMethod({ GET: listAgents, POST: createAgent }),
  '/agents/:agentId': byMethod({ GET: getAgent, PATCH: updateAgent, DELETE: deleteAgent }),
  '/agents/:agentId/runs': byMethod({ GET: listAgentRuns }),
  '/catalog': byMethod({ GET: catalog }),
  '/skills/validate': byMethod({ POST: validateSkill }),
  '/skills/extract': byMethod({ POST: extractPdf }),
  '/import-agent-md': byMethod({ POST: importAgentMarkdown }),
  '/templates/:templateId': byMethod({ POST: installTemplate }),
};
