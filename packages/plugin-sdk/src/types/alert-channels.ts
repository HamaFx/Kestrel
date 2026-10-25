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

// Public plugin contract — alert delivery channels (Telegram, email, …).

import type { PluginLogger } from './core';

export interface PluginAlertDeliveryArgs {
  alert: {
    id: string;
    userId: string;
    note: string | null;
    channels: readonly string[];
  };
  reading: { value: number; source: string };
  settings: Readonly<Record<string, unknown>>;
  log: PluginLogger;
  signal?: AbortSignal;
}

export interface PluginAlertChannelRegistration {
  /** Channel id persisted on `alerts.channels`, e.g. `telegram`. */
  id: string;
  label: string;
  deliver: (args: PluginAlertDeliveryArgs) => Promise<{ ok: boolean; message?: string }>;
}
