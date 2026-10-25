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

// Per-user Telegram alert delivery.
//
// Alerts created from the Telegram bot use the channel id `telegram-bot`, so
// they are delivered by the user's own bot rather than the shared server bot
// (the core `telegram` channel remains available for web-created alerts).

import type { PluginAlertChannelRegistration } from '@kestrel/plugin-sdk';

import { sendTelegramText } from './bot/telegram-api';
import { normaliseSettings, type TelegramSettings } from './settings';

export const telegramAlertChannel: PluginAlertChannelRegistration = {
  id: 'telegram-bot',
  label: 'Telegram (personal bot)',
  deliver: async ({ alert, reading, settings, log }) => {
    let parsed: TelegramSettings;
    try {
      parsed = normaliseSettings(settings);
    } catch (err) {
      log.warn('Telegram alert channel settings are invalid', {
        alertId: alert.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, message: 'Telegram plugin settings are invalid' };
    }
    if (!parsed.alertsEnabled) {
      // Treat a deliberate mute as "handled" so the alert does not retry
      // every cron tick. The alert is marked fired, matching the user's
      // instruction to pause Telegram notifications.
      return { ok: true, message: 'Telegram notifications are muted' };
    }
    if (!parsed.botToken || !parsed.linkedChatId) {
      return { ok: false, message: 'Telegram bot is not configured or linked' };
    }

    const text = [
      '🔔 Kestrel alert',
      '',
      alert.note?.trim() || 'Your price alert was triggered.',
      `Reading: ${reading.value} (${reading.source})`,
      '',
      'Manage alerts: /alerts in the web app',
    ].join('\n');

    try {
      await sendTelegramText(parsed.botToken, parsed.linkedChatId, text);
      return { ok: true };
    } catch (err) {
      log.warn('Telegram alert delivery failed', {
        alertId: alert.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
