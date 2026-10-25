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

// Leaf allowlists shared by the capability manifest and the plugin runtime.
//
// This module has no imports on purpose: the plugin SDK/AI plugin barrel is
// loaded while the capability manifest itself is initializing, so importing
// the manifest from there creates a temporal-dead-zone cycle.

/** Explicit public read-only boundary for canonical chat (Decision Q11 includes convene_committee). */
export const CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_session_levels',
  'get_news',
  'get_calendar',
  'get_cot',
  'get_seasonality',
  'get_intermarket',
  'get_intermarket_resonance',
  'get_social_sentiment',
  'get_correlation',
  'forecast_volatility',
  'analyze_technical',
  'analyze_fundamental',
  'compute_risk',
  'web_search',
  'search_knowledge',
  'verify_call',
  'convene_committee',
] as const;

/** Sensitive user-scoped reads require an explicit capability. */
export const SENSITIVE_USER_READ_TOOL_NAMES = [
  'get_journal_stats',
  'get_portfolio_snapshot',
  'compute_position_health',
  'replay_setup',
] as const;
