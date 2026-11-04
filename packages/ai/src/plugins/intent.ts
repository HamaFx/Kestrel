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
// Patterns are declared by each plugin manifest (`chatIntent`), not hardcoded
// here, so a bundled or third-party plugin can become chat-addressable without
// editing core AI. The classifier only ever adds plugin awareness for plugins
// the user has actually installed.

import { pluginHost, type RegisteredPlugin } from '@kestrel/plugin-sdk';

export type InstalledPluginIntentId = string;

export interface PluginIntentMatch {
  pluginId: InstalledPluginIntentId;
  reason: string;
}

function intentPriority(plugin: RegisteredPlugin): number {
  return Math.max(0, ...(plugin.manifest.chatIntent ?? []).map((intent) => intent.priority ?? 0));
}

/**
 * Match a prompt against the installed plugins' declared chat intents.
 *
 * Returns the first matching plugin in priority order (backtesting, then
 * paper-trading, then telegram-bot by their declared priorities) or null when
 * the prompt does not explicitly target an installed plugin.
 */
export function detectInstalledPluginIntent(
  prompt: string,
  installedPluginIds: readonly string[],
): PluginIntentMatch | null {
  const text = prompt.trim();
  if (!text || installedPluginIds.length === 0) return null;

  const candidates = pluginHost
    .getInstalledPlugins(installedPluginIds)
    .filter((plugin) => (plugin.manifest.chatIntent?.length ?? 0) > 0)
    .sort((a, b) => intentPriority(b) - intentPriority(a));

  for (const plugin of candidates) {
    for (const intent of plugin.manifest.chatIntent ?? []) {
      if (intent.exclusions?.some((pattern) => pattern.test(text))) continue;
      if (intent.patterns.some((pattern) => pattern.test(text))) {
        return { pluginId: plugin.manifest.id, reason: intent.reason };
      }
    }
  }

  return null;
}
