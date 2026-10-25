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

// Shared (client-safe) Plugin Store view models.
//
// Server components build these from PluginHost + the install ledger; client
// components only ever receive serialisable data (no Zod schemas, no component
// references, no decrypted secrets).

import type {
  PluginCategory,
  PluginInstallMode,
  PluginSettingsFieldDescriptor,
  PluginSetupStep,
  PluginToolAccess,
} from '@kestrel/plugin-sdk';

export interface PluginCapabilitySummary {
  tools: number;
  skills: number;
  jobs: number;
  tickSubscribers: number;
  alertChannels: number;
  indicators: number;
  agents: number;
  packetEnrichers: number;
  apiRoutes: number;
  navItems: number;
  dashboardWidgets: number;
  slashCommands: number;
}

export interface PluginToolSummary {
  name: string;
  description: string;
  access: PluginToolAccess;
}

export interface PluginStoreEntry {
  id: string;
  name: string;
  version: string;
  tagline: string;
  description: string;
  category: PluginCategory;
  iconName: string;
  installMode: PluginInstallMode;
  badges: readonly string[];
  capabilities: PluginCapabilitySummary;
  tools: readonly PluginToolSummary[];
  skills: readonly { name: string; description?: string; path?: string }[];
  installed: boolean;
  enabled: boolean;
  onboardingCompleted: boolean;
  installedAt: string | null;
  updatedAt: string | null;
  /** Secret values are replaced by `PLUGIN_SECRET_MASK`. */
  settings: Record<string, unknown>;
  settingsFields: readonly PluginSettingsFieldDescriptor[];
  setupSteps: readonly PluginSetupStep[];
  /** First plugin nav item, when the plugin registers one. */
  primaryHref: string | null;
}

export interface PluginStoreSnapshot {
  plugins: readonly PluginStoreEntry[];
  installedCount: number;
}

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  'trading-execution': 'Trading & Execution',
  'quant-research': 'Quant Research',
  'channels-automation': 'Channels & Automation',
  'agents-skills': 'Agents & Skills',
  'market-data': 'Market Data',
};

export const PLUGIN_CATEGORY_ORDER: readonly PluginCategory[] = [
  'quant-research',
  'trading-execution',
  'channels-automation',
  'agents-skills',
  'market-data',
];
