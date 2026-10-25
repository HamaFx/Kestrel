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

// Install / uninstall lifecycle hooks.

import { randomBytes } from 'node:crypto';

import type { PluginUserLifecycleContext } from '@kestrel/plugin-sdk';

import { unlinkChat } from './bot/link';
import { telegramApi } from './bot/telegram-api';
import { normaliseSettings, saveSettings } from './settings';

export async function onTelegramInstall(ctx: PluginUserLifecycleContext): Promise<void> {
  const settings = normaliseSettings(ctx.settings);
  const webhookSecret =
    settings.webhookSecret && settings.webhookSecret.length >= 16
      ? settings.webhookSecret
      : randomBytes(32).toString('hex');

  await saveSettings(ctx, {
    webhookSecret,
    alertsEnabled: settings.alertsEnabled ?? true,
    briefingEnabled: settings.briefingEnabled ?? false,
    briefingTime: settings.briefingTime ?? '07:30',
    timezone: settings.timezone ?? 'UTC',
  });
}

export async function onTelegramUninstall(
  ctx: PluginUserLifecycleContext & { wipeData?: boolean },
): Promise<void> {
  const settings = normaliseSettings(ctx.settings);

  if (settings.botToken) {
    try {
      const api = telegramApi(settings.botToken);
      await Promise.race([
        api.deleteWebhook({ drop_pending_updates: true }),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Telegram deleteWebhook timed out')),
            5_000,
          );
          timer.unref?.();
        }),
      ]);
    } catch (err) {
      ctx.log.warn('Could not delete Telegram webhook during uninstall', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    await unlinkChat(ctx.userId, ctx.tenantId);
  } catch (err) {
    ctx.log.warn('Could not unlink Telegram chat during uninstall', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Clear fields that describe an external connection so a later reinstall
  // does not restore a stale "linked" state from the keep-data snapshot.
  try {
    await saveSettings(
      ctx,
      {},
      {
        clearKeys: ['linkedChatId', 'linkedAt', 'webhookUrl', 'webhookConfiguredAt', 'lastError'],
      },
    );
  } catch (err) {
    ctx.log.warn('Could not clear Telegram connection fields during uninstall', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
