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

// Bundled plugin discovery barrel.
//
// Every plugin package under `plugins/<id>` is imported here and registered
// once at application boot (web instrumentation + worker main). The
// `pnpm create:plugin` scaffolder appends to the marked regions below, so
// adding a plugin never requires touching core packages.
//
// Keep this module server-safe: it must not import React, Next.js, or
// browser-only code. UI slots live in each plugin's optional
// `src/ui/index.tsx` and are registered separately by the web app.

// @kestrel:plugin-imports-start
import backtestingPlugin from '@kestrel/plugin-backtesting';
import customAgentsPlugin from '@kestrel/plugin-custom-agents';
import paperTradingPlugin from '@kestrel/plugin-paper-trading';
import { pluginHost, type KestrelPlugin, type PluginHost } from '@kestrel/plugin-sdk';
import telegramBotPlugin from '@kestrel/plugin-telegram-bot';

// @kestrel:plugin-imports-end

/**
 * Statically linked plugins. The array is intentionally explicit (not a
 * filesystem scan) so bundlers can tree-shake and the worker image contains
 * exactly the reviewed plugin set.
 */
export const BUNDLED_PLUGINS: readonly KestrelPlugin[] = [
  // @kestrel:plugin-list-start
  backtestingPlugin,
  customAgentsPlugin,
  paperTradingPlugin,
  telegramBotPlugin,
  // @kestrel:plugin-list-end
];

const registeredHosts = new WeakSet<PluginHost>();

/**
 * Register every bundled plugin on `host`.
 *
 * A broken plugin is isolated: valid plugins are registered before the
 * aggregate error is thrown, so one bad package cannot disable the rest of
 * the plugin surface. Idempotent per host.
 */
export function registerBundledPlugins(host: PluginHost = pluginHost): void {
  const failures: string[] = [];
  for (const plugin of BUNDLED_PLUGINS) {
    if (host.hasPlugin(plugin.manifest.id)) continue;
    try {
      host.register(plugin);
    } catch (err) {
      const id =
        plugin && typeof plugin === 'object' && plugin.manifest ? plugin.manifest.id : '(unknown)';
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `[plugins] failed to register ${failures.length} plugin(s): ${failures.join('; ')}`,
    );
  }
}

/**
 * Register bundled plugins exactly once per host process. This is the
 * bootstrap call used by `apps/web/src/instrumentation.ts` and the worker.
 */
export function ensureBundledPluginsRegistered(host: PluginHost = pluginHost): void {
  if (registeredHosts.has(host)) return;
  registerBundledPlugins(host);
  registeredHosts.add(host);
}

/** Test helper — allows a cleared host to be re-seeded. */
export function resetBundledPluginRegistrationForTests(host: PluginHost = pluginHost): void {
  registeredHosts.delete(host);
}
