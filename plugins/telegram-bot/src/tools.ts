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

// Tools exposed to Kestrel's agents when the Telegram plugin is installed.
//
// `telegram_send_briefing` is a write tool but explicitly does not require
// approval: it only sends a message the user asked for to their own linked
// chat. Trading mutations remain governed by the core mutation policy.

import type { PluginExecutionContext, PluginToolRegistration } from '@kestrel/plugin-sdk';
import { z } from 'zod';

import { buildBriefing } from './bot/commands';
import { createLinkToken, getLinkedChat } from './bot/link';
import { sendTelegramText } from './bot/telegram-api';
import type { TelegramBotContext } from './bot/types';
import {
  isValidTimezone,
  normaliseSettings,
  saveSettings,
  type TelegramSettings,
} from './settings';

const StatusOutput = z.object({
  configured: z.boolean(),
  botUsername: z.string().nullable(),
  linked: z.boolean(),
  alertsEnabled: z.boolean(),
  briefingEnabled: z.boolean(),
  briefingTime: z.string(),
  timezone: z.string(),
});

const LinkOutput = z.object({
  ok: z.boolean(),
  url: z.string().nullable(),
  expiresAt: z.string().nullable(),
  message: z.string(),
});

const SendOutput = z.object({
  ok: z.boolean(),
  message: z.string(),
});

const BriefingSettingsInput = z.object({
  enabled: z.boolean().optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  timezone: z.string().min(1).optional(),
  includePositions: z.boolean().optional(),
});

function contextFrom(ctx: PluginExecutionContext, settings: TelegramSettings): TelegramBotContext {
  return {
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    chatId: settings.linkedChatId ?? '',
    botToken: settings.botToken ?? '',
    settings,
    storage: ctx.storage,
    saveSettings: (partial) => saveSettings(ctx, partial),
  };
}

const statusTool: PluginToolRegistration<Record<string, never>, z.infer<typeof StatusOutput>> = {
  name: 'telegram_status',
  description:
    "Check whether the user's Telegram Copilot is configured, linked, and which briefing/alerts settings are active.",
  inputSchema: z.object({}),
  outputSchema: StatusOutput,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (_input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    return {
      configured: Boolean(settings.botToken && settings.botUsername),
      botUsername: settings.botUsername ?? null,
      linked: Boolean(settings.linkedChatId),
      alertsEnabled: settings.alertsEnabled,
      briefingEnabled: settings.briefingEnabled,
      briefingTime: settings.briefingTime,
      timezone: settings.timezone,
    };
  },
};

const linkTool: PluginToolRegistration<Record<string, never>, z.infer<typeof LinkOutput>> = {
  name: 'telegram_create_link',
  description:
    'Generate a single-use Telegram deep link the user can tap to connect their chat to Kestrel. The link expires in 15 minutes.',
  inputSchema: z.object({}),
  outputSchema: LinkOutput,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat'],
  execute: async (_input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    if (!settings.botUsername) {
      return {
        ok: false,
        url: null,
        expiresAt: null,
        message:
          'Telegram is not configured yet. Finish the Telegram Copilot setup in Settings → Plugins.',
      };
    }
    const { token, expiresAt } = await createLinkToken({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
    });
    return {
      ok: true,
      url: `https://t.me/${settings.botUsername}?start=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
      message: 'Open this link in Telegram to connect your chat.',
    };
  },
};

const sendBriefingTool: PluginToolRegistration<
  Record<string, never>,
  z.infer<typeof SendOutput>
> = {
  name: 'telegram_send_briefing',
  description:
    "Send the user's current market briefing to their linked Telegram chat (gold price, headlines, calendar, and optional open positions).",
  inputSchema: z.object({}),
  outputSchema: SendOutput,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat'],
  execute: async (_input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    if (!settings.botToken) {
      return { ok: false, message: 'Telegram bot token is not configured.' };
    }
    const chatId = settings.linkedChatId ?? (await getLinkedChat(ctx.userId, ctx.tenantId))?.chatId;
    if (!chatId) {
      return { ok: false, message: 'No Telegram chat is linked yet.' };
    }

    const text = await buildBriefing(contextFrom(ctx, settings));
    await sendTelegramText(settings.botToken, chatId, text);
    return { ok: true, message: 'Briefing sent to the linked Telegram chat.' };
  },
};

const setBriefingTool: PluginToolRegistration<
  z.infer<typeof BriefingSettingsInput>,
  z.infer<typeof SendOutput>
> = {
  name: 'telegram_set_briefing',
  description:
    "Enable or disable the user's daily Telegram briefing and set its local time/timezone.",
  inputSchema: BriefingSettingsInput,
  outputSchema: SendOutput,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    if (input.timezone && !isValidTimezone(input.timezone)) {
      return { ok: false, message: `Unknown timezone: ${input.timezone}` };
    }
    await saveSettings(ctx, {
      ...(input.enabled !== undefined ? { briefingEnabled: input.enabled } : {}),
      ...(input.time !== undefined ? { briefingTime: input.time } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.includePositions !== undefined
        ? { briefingIncludePositions: input.includePositions }
        : {}),
    });
    return {
      ok: true,
      message: 'Telegram briefing settings saved.',
    };
  },
};

export const telegramTools: readonly PluginToolRegistration[] = [
  statusTool,
  linkTool,
  sendBriefingTool,
  setBriefingTool,
];
