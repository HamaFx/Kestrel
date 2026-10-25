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

import { definePluginUi } from '@kestrel/plugin-sdk/ui';

import { AgentStudioPage } from './agent-studio-page';
import { CustomAgentsWidget } from './agent-widget';
import { CustomAgentCard, CustomAgentSavedCard, CustomAgentsListCard } from './chat-cards';

const ui = definePluginUi({
  chatToolParts: {
    custom_agent_list: { component: CustomAgentsListCard },
    custom_agent_get: { component: CustomAgentCard },
    custom_agent_create: { component: CustomAgentSavedCard },
    custom_agent_update: { component: CustomAgentSavedCard },
    custom_agent_delete: { component: CustomAgentSavedCard },
  },
  navItems: [
    {
      href: '/plugins/custom-agents',
      label: 'Custom Agents',
      iconName: 'IconUsersGroup',
      description: 'Build standalone agents with skills, tools & MCP',
      match: ['/plugins/custom-agents'],
      order: 35,
    },
  ],
  pages: [{ path: '', component: AgentStudioPage }],
  dashboardWidgets: [
    {
      id: 'custom-agents',
      title: 'Custom Agents',
      description: 'Your standalone agents and delegation status',
      component: CustomAgentsWidget,
      defaultSize: 'sm',
    },
  ],
  slashCommands: [
    {
      id: 'agents',
      label: 'Custom Agents',
      description: 'Open the Agent Studio',
    },
  ],
});

export default ui;
