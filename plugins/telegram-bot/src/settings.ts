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

import type { PluginExecutionContext } from '@kestrel/plugin-sdk';
import { preparePluginSettings } from '@kestrel/plugin-sdk/settings';
import { z } from 'zod';

export const PLUGIN_ID = 'telegram-bot';

export const settingsSchema = z.object({
  botToken: z.string().min(1, 'A BotFather token is required').optional().meta({
    secret: true,
    label: 'Bot token',
    description:
      'Open @BotFather in Telegram, create a bot with /newbot, and paste the HTTP API token here.',
    placeholder: '123456789:AAH…',
  }),
  botUsername: z.string().optional().meta({ hidden: true }),
  webhookSecret: z.string().optional().meta({ hidden: true, secret: true }),
  webhookUrl: z.string().optional().meta({ hidden: true, secret: true }),
  webhookConfiguredAt: z.string().optional().meta({ hidden: true }),
  linkedChatId: z.string().optional().meta({ hidden: true }),
  linkedAt: z.string().optional().meta({ hidden: true }),
  lastError: z.string().optional().meta({ hidden: true }),
  alertsEnabled: z.boolean().default(true).meta({
    label: 'Alert notifications',
    description: 'Allow the bot to send price-alert and account notifications to your chat.',
  }),
  briefingEnabled: z.boolean().default(false).meta({
    label: 'Daily market briefing',
    description: 'Send a short market briefing at your chosen local time.',
  }),
  briefingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM')
    .default('07:30')
    .meta({
      label: 'Briefing time',
      description: '24-hour clock in your timezone, for example 07:30.',
      placeholder: '07:30',
    }),
  timezone: z.string().min(1).default('UTC').meta({
    label: 'Timezone',
    description: 'IANA timezone, for example Europe/London or America/New_York.',
    placeholder: 'Europe/London',
  }),
  briefingIncludePositions: z.boolean().default(true).meta({
    label: 'Include open positions',
    description: 'Add your open positions and unrealized P&L to the daily briefing.',
  }),
});

export type TelegramSettings = z.infer<typeof settingsSchema>;

export function normaliseSettings(raw: Readonly<Record<string, unknown>>): TelegramSettings {
  return settingsSchema.parse(raw);
}

/**
 * Merge a partial settings update, validate it, encrypt secrets, and persist.
 *
 * The public webhook path calls this with an explicit tenant id (there is no
 * ambient tenant transaction on an unauthenticated transport route).
 */
export async function saveSettingsForInstall(
  args: {
    userId: string;
    tenantId: string;
    settings: Readonly<Record<string, unknown>>;
  },
  partial: Partial<TelegramSettings>,
  options?: { clearKeys?: readonly string[] },
): Promise<TelegramSettings> {
  const { updatePluginSettings, withTenantDb } = await import('@kestrel/db');
  const { invalidateInstalledPluginCache } = await import('@kestrel/ai/plugins');

  const prepared = preparePluginSettings({
    schema: settingsSchema,
    existing: args.settings,
    input: partial,
    ...(options?.clearKeys ? { clearKeys: options.clearKeys } : {}),
  });

  await withTenantDb(
    args.tenantId,
    async () => {
      const row = await updatePluginSettings({
        userId: args.userId,
        pluginId: PLUGIN_ID,
        settings: prepared.stored,
      });
      if (!row) throw new Error('Telegram bot settings row not found');
      return row;
    },
    { userId: args.userId },
  );

  invalidateInstalledPluginCache(args.userId);
  return prepared.plain as TelegramSettings;
}

export async function saveSettings(
  ctx: Pick<PluginExecutionContext, 'userId' | 'tenantId' | 'settings'>,
  partial: Partial<TelegramSettings>,
  options?: { clearKeys?: readonly string[] },
): Promise<TelegramSettings> {
  return saveSettingsForInstall(
    { userId: ctx.userId, tenantId: ctx.tenantId, settings: ctx.settings },
    partial,
    options,
  );
}

/** A timezone is valid when Intl accepts it. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
