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

// Bundled plugin UI discovery barrel.
//
// Kept separate from `registry.ts` so the worker never imports React or any
// plugin component. The web app imports this module from client components
// that need dynamic nav items, widgets, chat cards, or plugin pages.
//
// `pnpm create:plugin` appends to the marked regions below.

// @kestrel:plugin-ui-imports-start
import backtestingUi from '@kestrel/plugin-backtesting/ui';
import customAgentsUi from '@kestrel/plugin-custom-agents/ui';
import paperTradingUi from '@kestrel/plugin-paper-trading/ui';
import {
  pluginUiRegistry,
  type PluginUiDefinition,
  type PluginUiRegistry,
} from '@kestrel/plugin-sdk/ui';
import telegramBotUi from '@kestrel/plugin-telegram-bot/ui';

// @kestrel:plugin-ui-imports-end

export interface BundledPluginUi {
  pluginId: string;
  ui: PluginUiDefinition;
}

export const BUNDLED_PLUGIN_UI: readonly BundledPluginUi[] = [
  // @kestrel:plugin-ui-list-start
  { pluginId: 'backtesting', ui: backtestingUi },
  { pluginId: 'custom-agents', ui: customAgentsUi },
  { pluginId: 'paper-trading', ui: paperTradingUi },
  { pluginId: 'telegram-bot', ui: telegramBotUi },
  // @kestrel:plugin-ui-list-end
];

const registered = new WeakSet<PluginUiRegistry>();

/**
 * Register every bundled plugin UI exactly once per registry.
 *
 * Idempotent: a plugin that registered its UI elsewhere is skipped rather
 * than throwing (Next.js can evaluate client modules in more than one chunk).
 */
export function registerBundledPluginUi(registry: PluginUiRegistry = pluginUiRegistry): void {
  if (registered.has(registry)) return;
  for (const { pluginId, ui } of BUNDLED_PLUGIN_UI) {
    if (registry.get(pluginId)) continue;
    registry.register(pluginId, ui);
  }
  registered.add(registry);
}

/** Test helper — allows a cleared registry to be re-seeded. */
export function resetBundledPluginUiForTests(registry: PluginUiRegistry = pluginUiRegistry): void {
  registered.delete(registry);
}
