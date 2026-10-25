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

// Single source of truth for CORE AI tool identifiers. Each value here:
//   1. has an implementation in `packages/ai/src/tools/<name>.ts`
//   2. is exported from the registry in `packages/ai/src/tools/index.ts`
//   3. is referenced by docs/03-ai-agent.md § "Tool Catalogue"
// Adding a new core entry without all three is a steering violation.
//
// Plugin tools are deliberately NOT added here: they are registered at
// runtime by `@kestrel/plugin-sdk` and resolved per user. Keep this tuple as
// the compile-time contract for the bespoke UI parts (see
// apps/web/src/components/chat/parts/registry.tsx).
export const TOOL_NAMES = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_news',
  'get_calendar',
  'set_alert',
  'log_journal',
  // Phase 2 tools
  'search_knowledge',
  'analyze_technical',
  'analyze_fundamental',
  'get_journal_stats',
  'annotate_chart',
  // Phase 3 tools
  'analyze_chart_image',
  'get_correlation',
  'get_cot',
  'share_snapshot',
  // Phase 7b tools
  'compute_risk',
  'get_session_levels',
  'get_intermarket',
  'forecast_volatility',
  'get_seasonality',
  'compute_position_health',
  'replay_setup',
  'summarize_thread',
  // Phase 7c tools
  'verify_call',
  'convene_committee',
  'get_intermarket_resonance',
  'get_system_diagnostics',
  'run_system_action',
  // F3 — Social Sentiment
  'get_social_sentiment',
  // Web research — exposed only to the Fundamental agent/domain.
  'web_search',
] as const;

export type CoreToolName = (typeof TOOL_NAMES)[number];

/**
 * Explicit alias for the compile-time core boundary. A copy (not a second
 * binding of the same value) keeps `knip` from flagging a duplicate export.
 */
export const CORE_TOOL_NAMES = [...TOOL_NAMES] as const;

/**
 * A plugin-provided tool id. The `string & {}` intersection keeps literal
 * autocomplete for core names while allowing dynamic plugin ids to flow
 * through shared helpers without casts.
 */
export type PluginToolName = string & {};

export type ToolName = CoreToolName | PluginToolName;

/** Type guard for the closed core tool set. */
export function isCoreToolName(name: string): name is CoreToolName {
  return (CORE_TOOL_NAMES as readonly string[]).includes(name);
}
