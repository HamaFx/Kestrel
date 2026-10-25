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

// Public plugin contract — realtime tick feed subscribers.

import type { PluginId, PluginInstalledUser, PluginLogger } from './core';

export interface PluginTick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  /** Milliseconds since epoch (UTC). */
  ts: number;
  source: string;
  high?: number;
  low?: number;
  volume?: number;
}

export interface PluginTickContext {
  pluginId: PluginId;
  log: PluginLogger;
  signal: AbortSignal;
  getInstalledUsers(): Promise<readonly PluginInstalledUser[]>;
}

export interface PluginTickSubscriber {
  /** Stable subscriber id within the plugin. */
  id: string;
  /** Optional symbol allow-list. Empty/omitted = every symbol. */
  symbols?: readonly string[];
  handler: (tick: PluginTick, ctx: PluginTickContext) => void | Promise<void>;
}
