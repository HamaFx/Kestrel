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

// Per-user daily briefing.
//
// The plugin job runtime already scopes work to users who installed and
// enabled this plugin. We run every 5 minutes and only act when the user's
// local clock is inside their chosen minute window, so a static cron can
// honour any IANA timezone without a per-user scheduler row.

import type { PluginJobRegistration } from '@kestrel/plugin-sdk';

import { buildBriefing } from '../bot/commands';
import { sendTelegramText } from '../bot/telegram-api';
import type { TelegramBotContext } from '../bot/types';
import { isValidTimezone, normaliseSettings } from '../settings';

const WINDOW_MINUTES = 5;
const BRIEFING_COLLECTION = 'briefing-sent';
const UPDATE_COLLECTION = 'updates';
const UPDATE_TTL_MS = 24 * 60 * 60 * 1000;

function localMinutes(timezone: string): { minutes: number; dateKey: string } | null {
  try {
    const now = new Date();
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(timeParts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(timeParts.find((part) => part.type === 'minute')?.value ?? '0');

    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const dateKey = [
      dateParts.find((part) => part.type === 'year')?.value,
      dateParts.find((part) => part.type === 'month')?.value,
      dateParts.find((part) => part.type === 'day')?.value,
    ].join('-');

    return { minutes: hour * 60 + minute, dateKey };
  } catch {
    return null;
  }
}

function targetMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export const dailyBriefingJob: PluginJobRegistration = {
  id: 'daily-briefing',
  description: 'Send each user their local-time Telegram market briefing.',
  schedule: '*/5 * * * *',
  timezone: 'UTC',
  lock: 'none',
  run: async (ctx) => {
    const users = await ctx.getInstalledUsers();
    let sent = 0;
    let skipped = 0;

    for (const user of users) {
      if (ctx.signal.aborted) break;
      try {
        const settings = normaliseSettings(user.settings);
        if (
          !settings.briefingEnabled ||
          !settings.botToken ||
          !settings.linkedChatId ||
          !isValidTimezone(settings.timezone)
        ) {
          skipped += 1;
          continue;
        }

        const target = targetMinutes(settings.briefingTime);
        const local = localMinutes(settings.timezone);
        if (target === null || !local) {
          skipped += 1;
          continue;
        }

        const delta = (local.minutes - target + 1440) % 1440;
        if (delta >= WINDOW_MINUTES) continue;

        if (!user.storage) {
          skipped += 1;
          continue;
        }

        const key = `${local.dateKey}:${settings.briefingTime}`;
        const alreadySent = await user.storage.get(BRIEFING_COLLECTION, key);
        if (alreadySent) continue;

        const botContext: TelegramBotContext = {
          userId: user.userId,
          tenantId: user.tenantId,
          chatId: settings.linkedChatId,
          botToken: settings.botToken,
          settings,
          storage: user.storage,
          saveSettings: async () => settings,
        };

        const text = await buildBriefing(botContext);
        await sendTelegramText(settings.botToken, settings.linkedChatId, text);
        await user.storage.set(BRIEFING_COLLECTION, key, {
          sentAt: new Date().toISOString(),
        });
        sent += 1;
      } catch (err) {
        ctx.log.warn('Telegram briefing failed for user', {
          userId: user.userId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Prune the webhook idempotency ledger for every installed user. This is
    // cheap (bounded by update volume) and keeps plugin_storage tidy.
    for (const user of users) {
      if (!user.storage || ctx.signal.aborted) continue;
      try {
        const entries = await user.storage.list<{ processedAt?: string }>(UPDATE_COLLECTION);
        const cutoff = Date.now() - UPDATE_TTL_MS;
        for (const entry of entries) {
          const processedAt = entry.value?.processedAt ? Date.parse(entry.value.processedAt) : 0;
          if (!Number.isFinite(processedAt) || processedAt < cutoff) {
            await user.storage.delete(UPDATE_COLLECTION, entry.key);
          }
        }
      } catch {
        // Cleanup is best-effort.
      }
    }

    return {
      processed: sent,
      ...(users.length > 0 ? { note: `${users.length} installs checked, ${skipped} skipped` } : {}),
    };
  },
};
