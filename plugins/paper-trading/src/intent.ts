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

// Declarative chat-intent hints for the AI planner (P0-3/P0-4). A prompt that
// asks for real-money execution is excluded so it still hits the read-only
// chat boundary instead of being rescued into the paper-trading route.

import type { PluginChatIntent } from '@kestrel/plugin-sdk';

/**
 * Live-broker vocabulary that must never be rescued into a plugin route: a
 * prompt asking for real-money execution still hits the read-only boundary.
 */
const LIVE_BROKER_EXCLUSION_RE =
  /\b(real\s+money|live\s+account|live\s+broker|mt4|mt5|metatrader|interactive\s+brokers|ibkr|binance\s+live|coinbase\s+live|wire\s+transfer|withdraw\s+funds)\b/i;

const PAPER_EXPLICIT_RE =
  /\b(paper\s+(?:trade|trading|account|accounts|order|orders|position|positions|balance|equity|portfolio|sandbox|fill|fills|strategy|runner)|agent\s+sandbox|sandbox\s+account|virtual\s+(?:account|balance|trade|position|order)|simulated\s+(?:account|trade|position|order)|deploy\s+(?:[a-z0-9/_-]+\s+){0,4}?to\s+paper)\b|^\/paper\b/i;

const PAPER_TRADE_ACTION_RE =
  /\b(buy|sell|long|short|place\s+(?:a\s+|an\s+)?(?:market|limit|stop)\s+order|close\s+(?:my\s+|the\s+)?(?:[a-z0-9/_-]+\s+)?(?:open\s+)?(?:position|trade)|modify\s+(?:my\s+|the\s+)?(?:[a-z0-9/_-]+\s+)?position|cancel\s+(?:my\s+|the\s+)?(?:pending\s+)?order|reset\s+(?:my\s+)?(?:paper\s+|sandbox\s+)?account|my\s+open\s+positions|my\s+pending\s+orders|my\s+paper\s+positions|(?:move|trail|tighten|update)\s+(?:my\s+|the\s+)?(?:[a-z0-9/_-]+\s+)?stop(?:\s+loss)?|breakeven|(?:trim|flatten|exit)\s+(?:(?:my|the|half|of|all)\s+)*(?:[a-z0-9/_-]+\s+){0,3}(?:position|positions|trade|trades)|(?:pause|resume|stop)\s+(?:my\s+|the\s+)?(?:deployed\s+|paper\s+)?strategy)\b/i;

export const paperTradingChatIntent: readonly PluginChatIntent[] = [
  {
    reason: 'paper-explicit',
    priority: 20,
    patterns: [PAPER_EXPLICIT_RE],
    exclusions: [LIVE_BROKER_EXCLUSION_RE],
  },
  {
    reason: 'paper-trade-action',
    priority: 20,
    patterns: [PAPER_TRADE_ACTION_RE],
    exclusions: [LIVE_BROKER_EXCLUSION_RE],
  },
];
