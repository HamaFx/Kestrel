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

// Declarative chat-intent hints for the AI planner (P0-3). The router matches
// these patterns only when the user has this plugin installed.

import type { PluginChatIntent } from '@kestrel/plugin-sdk';

const BACKTEST_INTENT_RE =
  /\b(backtest(?:s|ing)?|parameter\s+sweep|grid\s+sweep|run\s+a\s+sweep|walk[-\s]?forward|strategy\s+template|equity\s+curve|sharpe\s+ratio\s+of\s+my\s+strategy|save\s+(?:this\s+)?strategy|list\s+(?:my\s+)?strategies|test\s+(?:a\s+|this\s+|my\s+)?strategy|simulate\s+(?:a\s+|this\s+)?strategy|getSignal|expectancy\s*r|profit\s+factor)\b|^\/backtest\b/i;

export const backtestingChatIntent: readonly PluginChatIntent[] = [
  {
    reason: 'backtesting-keyword',
    priority: 30,
    patterns: [BACKTEST_INTENT_RE],
  },
];
