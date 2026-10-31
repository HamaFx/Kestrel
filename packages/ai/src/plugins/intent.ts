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

// Deterministic, zero-LLM classifier for "this prompt is asking an installed
// plugin to do something" (P0-3, P0-4).
//
// The chat boundary previously rejected paper-trading / backtesting / Telegram
// prompts with HTTP 422 before plugin tools were ever reached, and the unified
// router hijacked symbol-bearing plugin prompts to the XAUUSD / symbol-research
// paths (which carry no plugin tools). Both boundaries now consult this single
// classifier:
//
//   * `/api/chat` skips the read-only 422 gate when it matches.
//   * `decideMastraExecution` routes the turn to `canonical-chat`, where every
//     `main-chat` plugin tool and its UI card is mounted.
//
// The classifier only ever *adds* plugin awareness for plugins the user has
// actually installed. Real-money execution stays blocked: any explicit
// live-broker vocabulary disqualifies the paper-trading match.

export type InstalledPluginIntentId =
  'paper-trading' | 'backtesting' | 'custom-agents' | 'telegram-bot';

export interface PluginIntentMatch {
  pluginId: InstalledPluginIntentId;
  reason: string;
}

/**
 * Live-broker vocabulary that must never be rescued into a plugin route: a
 * prompt asking for real-money execution still hits the read-only boundary.
 */
const LIVE_BROKER_EXCLUSION_RE =
  /\b(real\s+money|live\s+account|live\s+broker|mt4|mt5|metatrader|interactive\s+brokers|ibkr|binance\s+live|coinbase\s+live|wire\s+transfer|withdraw\s+funds)\b/i;

const BACKTEST_INTENT_RE =
  /\b(backtest(?:s|ing)?|parameter\s+sweep|grid\s+sweep|run\s+a\s+sweep|walk[-\s]?forward|strategy\s+template|equity\s+curve|sharpe\s+ratio\s+of\s+my\s+strategy|save\s+(?:this\s+)?strategy|list\s+(?:my\s+)?strategies)\b|^\/backtest\b/i;

const PAPER_EXPLICIT_RE =
  /\b(paper\s+(?:trade|trading|account|accounts|order|orders|position|positions|balance|equity|portfolio|sandbox|fill|fills|strategy|runner)|agent\s+sandbox|sandbox\s+account|virtual\s+(?:account|balance|trade|position|order)|simulated\s+(?:account|trade|position|order)|deploy\s+(?:[a-z0-9/_-]+\s+){0,4}?to\s+paper)\b|^\/paper\b/i;

const PAPER_TRADE_ACTION_RE =
  /\b(buy|sell|long|short|place\s+(?:a\s+|an\s+)?(?:market|limit|stop)\s+order|close\s+(?:my\s+|the\s+)?(?:[a-z0-9/_-]+\s+)?(?:open\s+)?(?:position|trade)|modify\s+(?:my\s+|the\s+)?(?:[a-z0-9/_-]+\s+)?position|cancel\s+(?:my\s+|the\s+)?(?:pending\s+)?order|reset\s+(?:my\s+)?(?:paper\s+|sandbox\s+)?account|my\s+open\s+positions|my\s+pending\s+orders|my\s+paper\s+positions)\b/i;

const CUSTOM_AGENTS_INTENT_RE =
  /\b(custom\s+agent(?:s)?|subagent(?:s)?|delegate\s+to\s+agent|agent\s+studio|run\s+script\s+tool)\b|^\/agents\b/i;

const TELEGRAM_INTENT_RE =
  /\b(telegram(?:\s+bot|\s+briefing|\s+recap|\s+alert|\s+digest|\s+notification)?)\b|^\/telegram\b/i;

/**
 * Match a prompt against the installed plugins' advertised capabilities.
 *
 * Returns the first matching plugin (checked in priority order: backtesting,
 * paper-trading, custom-agents, telegram-bot) or null when the prompt does not
 * explicitly target an installed plugin.
 */
export function detectInstalledPluginIntent(
  prompt: string,
  installedPluginIds: readonly string[],
): PluginIntentMatch | null {
  const text = prompt.trim();
  if (!text) return null;

  const installed = new Set(installedPluginIds);

  if (installed.has('backtesting') && BACKTEST_INTENT_RE.test(text)) {
    return { pluginId: 'backtesting', reason: 'backtesting-keyword' };
  }

  if (installed.has('paper-trading') && !LIVE_BROKER_EXCLUSION_RE.test(text)) {
    if (PAPER_EXPLICIT_RE.test(text)) {
      return { pluginId: 'paper-trading', reason: 'paper-explicit' };
    }
    if (PAPER_TRADE_ACTION_RE.test(text)) {
      return { pluginId: 'paper-trading', reason: 'paper-trade-action' };
    }
  }

  if (installed.has('custom-agents') && CUSTOM_AGENTS_INTENT_RE.test(text)) {
    return { pluginId: 'custom-agents', reason: 'custom-agents-keyword' };
  }

  if (installed.has('telegram-bot') && TELEGRAM_INTENT_RE.test(text)) {
    return { pluginId: 'telegram-bot', reason: 'telegram-keyword' };
  }

  return null;
}
