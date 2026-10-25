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

// Public plugin contract — scheduled and event-driven plugin jobs.

import type { PluginId, PluginInstalledUser, PluginLogger } from './core';

export interface PluginJobContext {
  pluginId: PluginId;
  jobId: string;
  log: PluginLogger;
  signal: AbortSignal;
  /**
   * Users who currently have this plugin installed and enabled. A plugin job
   * must only process this set — it can never fan out to every tenant.
   */
  getInstalledUsers(): Promise<readonly PluginInstalledUser[]>;
}

export interface PluginJobRegistration {
  /** Stable job id within the plugin, e.g. `daily-briefing`. */
  id: string;
  description: string;
  /** Cron expression, or `null` for an event-driven/manual job. */
  schedule: string | null;
  /** IANA timezone. Defaults to UTC. */
  timezone?: string;
  /**
   * `daily` uses the shared cron idempotency ledger (at most once per UTC
   * day). `none` leaves idempotency to the plugin (minute-level jobs).
   * Defaults to `none`.
   */
  lock?: 'daily' | 'none';
  run: (ctx: PluginJobContext) => Promise<{ processed: number; note?: string }>;
}
