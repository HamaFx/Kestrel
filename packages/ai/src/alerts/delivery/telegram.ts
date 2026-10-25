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

// SPDX-License-Identifier: Apache-2.0

// Personal-bot Telegram bridge (DEC-05 split from delivery.ts).
//
// DEC-02 — a web-created alert that stores the core `telegram` channel is
// delivered exclusively through the user's personal Telegram bot plugin.
// There is no shared-server-bot fallback: linking, webhooks, and delivery are
// owned by `@kestrel/plugin-telegram-bot`.

import { pluginHost } from '@kestrel/plugin-sdk';

import { createPluginExecutionContext, getInstalledPluginRuntime } from '../../plugins';
import type { AlertChannelDeliveryResult } from '../channel-registry';
import type { DeliverArgs } from './types';

export async function deliverTelegramViaPlugin(
  args: DeliverArgs,
): Promise<AlertChannelDeliveryResult | null> {
  const runtime = await getInstalledPluginRuntime(args.alert.userId);
  if (!runtime.tenantId || !runtime.installedPluginIds.includes('telegram-bot')) return null;
  const settings = runtime.plugins.find((entry) => entry.pluginId === 'telegram-bot')?.settings;
  if (
    !settings ||
    typeof settings['botToken'] !== 'string' ||
    settings['botToken'].length === 0 ||
    typeof settings['linkedChatId'] !== 'string' ||
    settings['linkedChatId'].length === 0
  ) {
    return null;
  }
  const plugin = pluginHost.getAlertChannel('telegram-bot');
  if (!plugin) return null;
  const ctx = createPluginExecutionContext({
    userId: runtime.userId,
    tenantId: runtime.tenantId,
    pluginId: 'telegram-bot',
    settings,
  });
  return plugin.deliver({
    alert: {
      id: args.alert.id,
      userId: args.alert.userId,
      note: args.alert.note ?? null,
      channels: args.alert.channels,
    },
    reading: { value: args.reading.value, source: args.reading.source },
    settings: ctx.settings,
    log: ctx.log,
  });
}
