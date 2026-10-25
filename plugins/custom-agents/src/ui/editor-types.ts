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

// Agent-editor form state + presentational constants shared by the tabs.

import type { AgentView, CatalogOutput, CustomSkill } from '../schemas';

export interface McpRow {
  id: string;
  url: string;
  authorization: string;
  hadAuthorization: boolean;
  removeAuthorization: boolean;
}

export interface FormState {
  name: string;
  slug: string;
  description: string;
  instructions: string;
  model: string | null;
  tools: string[];
  skills: CustomSkill[];
  skillRefs: Array<{ pluginId: string; skill: string }>;
  mcpServers: McpRow[];
  delegatable: boolean;
}

export const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 w-full rounded-md border px-2.5 py-2 text-xs outline-none';

export const TOOL_GROUP_LABELS: Record<string, string> = {
  'market-data': 'Market data',
  analysis: 'Analysis & risk',
  research: 'Research',
  journal: 'Journal',
  portfolio: 'Portfolio',
  system: 'System',
  plugins: 'Installed plugin tools',
  other: 'Other',
};

export function emptyForm(catalog: CatalogOutput): FormState {
  return {
    name: '',
    slug: '',
    description: '',
    instructions: '',
    model: catalog.settings.defaultModel || null,
    tools: ['get_price', 'get_market_structure', 'get_indicators', 'get_news', 'search_knowledge'],
    skills: [],
    skillRefs: [],
    mcpServers: [],
    delegatable: false,
  };
}

export function fromAgent(agent: AgentView): FormState {
  return {
    name: agent.name,
    slug: agent.slug,
    description: agent.description,
    instructions: agent.instructions,
    model: agent.model,
    tools: [...agent.tools],
    skills: agent.skills.map((skill) => ({ ...skill })),
    skillRefs: agent.skillRefs.map((ref) => ({ ...ref })),
    mcpServers: agent.mcpServers.map((server) => ({
      id: server.id,
      url: server.url,
      authorization: '',
      hadAuthorization: server.hasAuthorization,
      removeAuthorization: false,
    })),
    delegatable: agent.delegatable,
  };
}
