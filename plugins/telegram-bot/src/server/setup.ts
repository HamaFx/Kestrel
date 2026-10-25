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

// Authenticated setup/status endpoints for the guided Telegram wizard.
//
// Mounted by the core at /api/plugins/telegram-bot/*. Every handler gets the
// caller's decrypted settings and isolated plugin storage from the generic
// plugin API dispatcher.

import { randomBytes } from 'node:crypto';

import type { PluginApiRouteContext } from '@kestrel/plugin-sdk';

import { createLinkToken, createWebhookToken, getLinkedChat, unlinkChat } from '../bot/link';
import { telegramApi } from '../bot/telegram-api';
import { COMMAND_DESCRIPTIONS } from '../bot/types';
import { normaliseSettings, PLUGIN_ID, saveSettings, type TelegramSettings } from '../settings';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function error(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function publicBaseUrl(request: Request): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fallback = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return null;
    }
  })();
  const base = configured && configured.length > 0 ? configured : fallback;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function botTokenFrom(body: Record<string, unknown>, settings: TelegramSettings): string | null {
  const raw = typeof body['botToken'] === 'string' ? body['botToken'].trim() : '';
  const token = raw.length > 0 ? raw : (settings.botToken ?? '');
  return token.length > 0 ? token : null;
}

/** POST /setup/validate-token — calls getMe and stores the bot identity. */
export async function validateTokenRoute(ctx: PluginApiRouteContext): Promise<Response> {
  const body = await readJson(ctx.request);
  const settings = normaliseSettings(ctx.settings);
  const token = botTokenFrom(body, settings);
  if (!token) {
    return error('VALIDATION', 'Paste the HTTP API token from @BotFather first.');
  }

  try {
    const me = await telegramApi(token).getMe();
    await saveSettings(
      { userId: ctx.userId, tenantId: ctx.tenantId, settings: ctx.settings },
      {
        botToken: token,
        botUsername: me.username ?? undefined,
        lastError: undefined,
      },
    );
    return json({
      ok: true,
      message: `Connected to @${me.username ?? me.first_name}`,
      values: { botUsername: me.username ?? '' },
    });
  } catch (err) {
    const message =
      err instanceof Error && /401|unauthorized|not found/i.test(err.message)
        ? 'Telegram rejected that token. Check it in @BotFather and try again.'
        : err instanceof Error
          ? err.message
          : 'Could not reach Telegram';
    await saveSettings(
      { userId: ctx.userId, tenantId: ctx.tenantId, settings: ctx.settings },
      { lastError: message },
    ).catch(() => undefined);
    return error('VALIDATION', message, 400);
  }
}

/** POST /setup/configure-webhook — setWebhook + setMyCommands. */
export async function configureWebhookRoute(ctx: PluginApiRouteContext): Promise<Response> {
  const settings = normaliseSettings(ctx.settings);
  if (!settings.botToken) {
    return error('VALIDATION', 'Validate your bot token before configuring the webhook.');
  }

  const base = publicBaseUrl(ctx.request);
  if (!base) {
    return error(
      'VALIDATION',
      'Set NEXT_PUBLIC_APP_URL to the public HTTPS origin of this Kestrel deployment, then retry.',
      400,
    );
  }

  const webhookToken = createWebhookToken(ctx.userId);
  const webhookSecret =
    settings.webhookSecret && settings.webhookSecret.length >= 16
      ? settings.webhookSecret
      : randomBytes(32).toString('hex');
  const webhookUrl = `${base}/api/plugins/public/${PLUGIN_ID}/webhook/${webhookToken}`;

  try {
    const api = telegramApi(settings.botToken);
    const botUsername =
      settings.botUsername ?? (await api.getMe()).username ?? settings.botUsername;
    await api.setWebhook(webhookUrl, {
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
      max_connections: 40,
    });
    await api.setMyCommands(
      COMMAND_DESCRIPTIONS.map((entry) => ({
        command: entry.command,
        description: entry.description.slice(0, 256),
      })),
    );

    await saveSettings(
      { userId: ctx.userId, tenantId: ctx.tenantId, settings: ctx.settings },
      {
        botUsername,
        webhookSecret,
        webhookUrl,
        webhookConfiguredAt: new Date().toISOString(),
        lastError: undefined,
      },
    );

    return json({
      ok: true,
      message: 'Webhook configured — Telegram can now reach Kestrel.',
      values: { webhookUrl },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Telegram rejected the webhook configuration';
    await saveSettings(
      { userId: ctx.userId, tenantId: ctx.tenantId, settings: ctx.settings },
      { lastError: message },
    ).catch(() => undefined);
    return error('PROVIDER_UNAVAILABLE', message, 502);
  }
}

/** POST /setup/create-link — returns a single-use t.me deep link. */
export async function createLinkRoute(ctx: PluginApiRouteContext): Promise<Response> {
  const settings = normaliseSettings(ctx.settings);
  if (!settings.botUsername) {
    return error('VALIDATION', 'Validate your bot token before generating a link.');
  }

  const { token, expiresAt } = await createLinkToken({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
  });
  const linkUrl = `https://t.me/${settings.botUsername}?start=${encodeURIComponent(token)}`;

  return json({
    ok: true,
    message: 'Link generated. Open it in Telegram to connect this chat.',
    values: { linkUrl, linkExpiresAt: expiresAt.toISOString() },
  });
}

/** GET /status — safe status payload for the plugin page and widget. */
export async function statusRoute(ctx: PluginApiRouteContext): Promise<Response> {
  const settings = normaliseSettings(ctx.settings);
  const linked = settings.linkedChatId
    ? { chatId: settings.linkedChatId, linkedAt: settings.linkedAt ?? null }
    : await getLinkedChat(ctx.userId, ctx.tenantId).then((row) =>
        row ? { chatId: row.chatId, linkedAt: row.linkedAt.toISOString() } : null,
      );

  let webhook: {
    configured: boolean;
    url?: string;
    pendingUpdateCount?: number;
    lastErrorMessage?: string;
  } = { configured: Boolean(settings.webhookUrl) };

  if (settings.botToken) {
    try {
      const api = telegramApi(settings.botToken);
      const info = await Promise.race([
        api.getWebhookInfo(),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Telegram getWebhookInfo timed out')),
            5_000,
          );
          timer.unref?.();
        }),
      ]);
      webhook = {
        configured: Boolean(info.url),
        ...(info.url ? { url: info.url } : {}),
        ...(typeof info.pending_update_count === 'number'
          ? { pendingUpdateCount: info.pending_update_count }
          : {}),
        ...(info.last_error_message ? { lastErrorMessage: info.last_error_message } : {}),
      };
    } catch {
      // Status is best-effort; the page still renders the stored state.
    }
  }

  return json({
    installed: true,
    connected: Boolean(settings.botToken && settings.botUsername),
    botUsername: settings.botUsername ?? null,
    linked,
    webhook,
    settings: {
      alertsEnabled: settings.alertsEnabled,
      briefingEnabled: settings.briefingEnabled,
      briefingTime: settings.briefingTime,
      timezone: settings.timezone,
      briefingIncludePositions: settings.briefingIncludePositions,
      lastError: settings.lastError ?? null,
    },
  });
}

/** POST /unlink — disconnect this Telegram chat from the Kestrel account. */
export async function unlinkRoute(ctx: PluginApiRouteContext): Promise<Response> {
  await unlinkChat(ctx.userId, ctx.tenantId);
  await saveSettings(
    { userId: ctx.userId, tenantId: ctx.tenantId, settings: ctx.settings },
    { linkedChatId: undefined, linkedAt: undefined },
  );
  return json({ ok: true, message: 'Telegram chat unlinked.' });
}

/** POST /test-message — send a one-off confirmation to the linked chat. */
export async function testMessageRoute(ctx: PluginApiRouteContext): Promise<Response> {
  const settings = normaliseSettings(ctx.settings);
  if (!settings.botToken || !settings.linkedChatId) {
    return error('VALIDATION', 'Link a Telegram chat before sending a test message.');
  }
  try {
    await telegramApi(settings.botToken).sendMessage(
      settings.linkedChatId,
      '✅ Kestrel test message — your Telegram Copilot is connected.',
    );
    return json({ ok: true, message: 'Test message sent.' });
  } catch (err) {
    return error(
      'PROVIDER_UNAVAILABLE',
      err instanceof Error ? err.message : 'Telegram send failed',
      502,
    );
  }
}
