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

// Public Telegram webhook.
//
// URL: /api/plugins/public/telegram-bot/webhook/<signed-user-token>
//
// Two independent checks must pass before an update is processed:
//   1. The path token is an HMAC over the user id (identifies the install).
//   2. Telegram's `X-Telegram-Bot-Api-Secret-Token` matches the per-install
//      secret generated when the webhook was configured.
//
// Updates are deduplicated in plugin_storage for 24h-ish (pruned by the
// nightly job) so Telegram retries cannot double-charge AI tokens.

import { withTenantDb } from '@kestrel/db';
import type { PluginPublicApiRouteContext, PluginStorage } from '@kestrel/plugin-sdk';
import { z } from 'zod';

import { verifyTelegramToken } from '../bot/link';
import { handleTelegramUpdate } from '../bot/runner';
import { normaliseSettings } from '../settings';
import { secretMatches } from './secret';
import { claimTelegramUpdate, UPDATE_COLLECTION } from './update-ledger';

const TelegramUpdateSchema = z.object({
  update_id: z.int(),
  message: z
    .object({
      message_id: z.int(),
      chat: z.object({
        id: z.number(),
        username: z.string().optional(),
        first_name: z.string().optional(),
      }),
      text: z.string().optional(),
      from: z
        .object({
          id: z.number(),
          is_bot: z.boolean().optional(),
          first_name: z.string().optional(),
          username: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string(),
      from: z.object({ id: z.number(), is_bot: z.boolean().optional() }).optional(),
      message: z.object({ message_id: z.int(), chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});

const MAX_UPDATE_AGE_MS = 24 * 60 * 60 * 1000;

function ok(): Response {
  return new Response('OK', { status: 200 });
}

export async function handleTelegramWebhookRoute(
  ctx: PluginPublicApiRouteContext,
): Promise<Response> {
  const token = ctx.params['token'];
  if (!token) return new Response('Not found', { status: 404 });

  const verified = verifyTelegramToken(token);
  if (!verified) return new Response('Unauthorized', { status: 401 });

  const install = await ctx.getInstall(verified.userId);
  if (!install) return new Response('Not found', { status: 404 });

  const settings = normaliseSettings(install.settings);
  if (!settings.botToken || !settings.webhookSecret) {
    return new Response('Not configured', { status: 400 });
  }

  const headerSecret = ctx.request.headers.get('x-telegram-bot-api-secret-token');
  if (!secretMatches(headerSecret, settings.webhookSecret)) {
    ctx.log.warn('Telegram webhook secret mismatch', { userId: verified.userId });
    return new Response('Unauthorized', { status: 401 });
  }

  let update: z.infer<typeof TelegramUpdateSchema>;
  try {
    update = TelegramUpdateSchema.parse(await ctx.request.json());
  } catch (err) {
    ctx.log.warn('Malformed Telegram update', {
      userId: verified.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return new Response('Bad request', { status: 400 });
  }

  const idempotencyKey = String(update.update_id);

  try {
    // Public plugin routes carry no ambient tenant transaction (no
    // `withAuth`), and the bot's commands read RLS-protected tables
    // (alerts, trade_journal, plg_paper_trading_*) plus `plugin_storage`.
    // Everything below must run inside the install's tenant scope.
    const response = await withTenantDb(
      install.tenantId,
      async () => {
        // R10 — claim the update atomically (INSERT … ON CONFLICT DO NOTHING
        // RETURNING) instead of check-then-set: Telegram retries while the
        // first handler is still running, and two concurrent deliveries must
        // not both run the prompt.
        const claim = await claimTelegramUpdate({
          tenantId: install.tenantId,
          userId: install.userId,
          pluginId: ctx.pluginId,
          updateId: update.update_id,
        });
        if (!claim.claimed) {
          ctx.log.info('Skipping duplicate Telegram update', {
            userId: verified.userId,
            updateId: update.update_id,
          });
          return ok();
        }
        if (claim.reClaimed) {
          ctx.log.warn('Re-claimed an abandoned Telegram update', {
            userId: verified.userId,
            updateId: update.update_id,
          });
        }

        await handleTelegramUpdate(
          {
            userId: install.userId,
            tenantId: install.tenantId,
            settings: settings as unknown as Record<string, unknown>,
            storage: install.storage,
          },
          update,
          AbortSignal.timeout(85_000),
        );

        // The reply is already in the Telegram chat. A failed ledger write
        // must not become a 5xx — Telegram would retry the update and the
        // same prompt would run (and answer) again.
        try {
          await install.storage.set(UPDATE_COLLECTION, idempotencyKey, {
            processedAt: new Date().toISOString(),
          });
        } catch (storageErr) {
          ctx.log.warn('Telegram webhook dedupe write failed after handling update', {
            userId: install.userId,
            updateId: update.update_id,
            err: storageErr instanceof Error ? storageErr.message : String(storageErr),
          });
        }

        return ok();
      },
      { userId: install.userId },
    );

    // Opportunistic pruning so a single hot install never grows unbounded.
    // Runs after the tenant transaction commits; each storage call opens its
    // own short scope when no ambient one is active.
    if (update.update_id % 50 === 0) {
      void pruneUpdates(install.storage, ctx).catch(() => undefined);
    }

    return response;
  } catch (err) {
    await install.storage.delete(UPDATE_COLLECTION, idempotencyKey).catch(() => undefined);
    ctx.log.error('Telegram update failed', {
      userId: verified.userId,
      updateId: update.update_id,
      err: err instanceof Error ? err.message : String(err),
    });
    // Let Telegram retry; the idempotency key was released.
    return new Response('Internal error', { status: 500 });
  }
}

async function pruneUpdates(
  storage: PluginStorage,
  ctx: PluginPublicApiRouteContext,
): Promise<void> {
  const entries = await storage.list<{ processedAt?: string }>(UPDATE_COLLECTION);
  const cutoff = Date.now() - MAX_UPDATE_AGE_MS;
  for (const entry of entries) {
    const processedAt = entry.value?.processedAt ? Date.parse(entry.value.processedAt) : 0;
    if (!Number.isFinite(processedAt) || processedAt < cutoff) {
      await storage.delete(UPDATE_COLLECTION, entry.key);
    }
  }
  ctx.log.debug?.('Pruned Telegram update ledger', { remaining: entries.length });
}
