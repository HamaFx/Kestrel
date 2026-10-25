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

// Safe core-tool catalog for plugins that compose user-defined agents.
//
// The custom-agents studio needs to show a picker of core tools, but it must
// never expose mutation tools or let a forged config reach them. The AI
// package owns the canonical allowlist, so it publishes the reviewed subset on
// the plugin host at boot. The plugin reads `pluginHost.getCoreTools()`.
//
// The tool registry is imported dynamically: this module is reached from the
// `@kestrel/ai/plugins` barrel while a Mastra agent/capability import graph is
// still initializing, and the registry pulls every tool module.

import { pluginHost, type PluginCoreToolInfo } from '@kestrel/plugin-sdk';

import {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from '../mastra-v2/capabilities/tool-names';

type ToolGroup = PluginCoreToolInfo['group'];

const GROUP_BY_TOOL: Readonly<Record<string, ToolGroup>> = {
  get_price: 'market-data',
  get_candles: 'market-data',
  get_session_levels: 'market-data',
  get_market_structure: 'market-data',
  get_cot: 'market-data',
  get_indicators: 'analysis',
  analyze_technical: 'analysis',
  analyze_fundamental: 'analysis',
  analyze_chart_image: 'analysis',
  annotate_chart: 'analysis',
  compute_risk: 'analysis',
  forecast_volatility: 'analysis',
  verify_call: 'analysis',
  replay_setup: 'analysis',
  compute_position_health: 'portfolio',
  get_correlation: 'analysis',
  get_intermarket: 'analysis',
  get_intermarket_resonance: 'analysis',
  get_seasonality: 'analysis',
  get_news: 'research',
  get_calendar: 'research',
  get_social_sentiment: 'research',
  web_search: 'research',
  search_knowledge: 'research',
  get_journal_stats: 'journal',
  convene_committee: 'system',
  get_system_diagnostics: 'system',
};

const SAFE_SENSITIVE_TOOLS = new Set<string>(SENSITIVE_USER_READ_TOOL_NAMES);

/**
 * Build the reviewed read-only tool catalog.
 *
 * Canonical chat tools are already the public, fail-closed read-only surface;
 * the sensitive user reads are added explicitly because a user-authored agent
 * may legitimately read the same private data the desks can read. Mutation
 * tools are never included.
 */
export async function buildPluginCoreToolCatalog(): Promise<PluginCoreToolInfo[]> {
  const { registerAllTools, toolRegistry } = await import('../tools');
  registerAllTools(toolRegistry);

  const names = [
    ...new Set<string>([
      ...CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
      ...SENSITIVE_USER_READ_TOOL_NAMES,
    ]),
  ];

  return names
    .map((name): PluginCoreToolInfo | null => {
      const entry = toolRegistry.getPlugin(name);
      if (!entry) return null;
      return {
        name,
        description: entry.description,
        access: SAFE_SENSITIVE_TOOLS.has(name) ? 'sensitive-read' : 'read-only',
        group: GROUP_BY_TOOL[name] ?? 'other',
      };
    })
    .filter((tool): tool is PluginCoreToolInfo => tool !== null);
}

/**
 * Publish the catalog on the plugin host. Idempotent and safe to call from
 * every boot path (web instrumentation, worker start, plugin API tests).
 */
export async function syncPluginCoreTools(host = pluginHost): Promise<void> {
  host.setCoreTools(await buildPluginCoreToolCatalog());
}
