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

// @kestrel/plugin-custom-agents — Phase 6.
//
// Agent Studio: per-user standalone Mastra agents with SKILL.md knowledge,
// tool allowlists, optional model pins and remote MCP servers. Agents are
// invoked with `@handle` in chat or Telegram, or as read-only subagents of
// the canonical chat agent when delegation is enabled.
//
// Decision D-04: these agents never mutate the core 4-Desk Committee.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { definePlugin } from '@kestrel/plugin-sdk';

import { customAgentsApiRoutes } from './api/routes';
import { customAgentsCatalog } from './catalog';
import { deleteAllAgentsForUser, seedStarterAgents } from './services/agents';
import { DEFAULT_SETTINGS, PLUGIN_ID, settingsSchema } from './settings';
import { customAgentTools } from './tools';

function resolveSkillDir(name: string): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', name),
    join(process.cwd(), 'plugins', 'custom-agents', 'skills', name),
    join(process.cwd(), 'node_modules', '@kestrel', 'plugin-custom-agents', 'skills', name),
    join(process.cwd(), '..', '..', 'plugins', 'custom-agents', 'skills', name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

const plugin = definePlugin({
  manifest: {
    id: PLUGIN_ID,
    name: 'Custom Agents',
    version: '0.1.0',
    tagline: 'Build standalone Mastra agents with skills, tools and MCP — no code required.',
    description:
      'Agent Studio lets you create your own research agents with a name, @handle, system instructions, Markdown skills, an allowlisted tool set, an optional model pin and remote MCP servers. Talk to them with @handle in chat or Telegram, or let the main chat delegate to them as read-only subagents. Four starter agents are included: ICT Silver Bullet Mentor, Quant Strategy Coder, Macro & Central Bank Analyst, and Prop-Firm Risk Coach. Custom agents are standalone and never change the core 4-Desk Committee.',
    category: 'agents-skills',
    iconName: 'IconUsersGroup',
    installMode: 'instant',
    settingsSchema,
    defaultSettings: { ...DEFAULT_SETTINGS },
    badges: [
      '4 starter agents',
      'Visual agent builder',
      'SKILL.md knowledge',
      'Tool allowlist',
      '@mention in chat',
      'MCP bridge',
      'Adds 7 AI tools',
      'Adds sidebar tab',
    ],
    setupSteps: [],
  },
  skills: [resolveSkillDir('custom-agent-studio')],
  tools: customAgentTools,
  agentCatalogs: [customAgentsCatalog],
  apiRoutes: customAgentsApiRoutes,
  onUserInstall: async (ctx) => {
    await seedStarterAgents(ctx.userId, ctx.settings);
  },
  onUserUninstall: async (ctx) => {
    if (!ctx.wipeData) return;
    await deleteAllAgentsForUser(ctx.userId);
  },
});

export default plugin;
