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

// Telegram account linking.
//
// Two token types:
//   1. Webhook path token — HMAC over the user id, long-lived. It identifies
//      the owning install but is not shown to the user.
//   2. Telegram start token — a short random code (well under Telegram's
//      64-character `?start=` limit) stored in `bot_links` with platform
//      `telegram-link`. The public webhook can look it up without knowing the
//      user in advance, then consumes it and writes the real `telegram` link.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getDb, schema, withAdminDb, withTenantDb } from '@kestrel/db';
import { and, eq, inArray, lt } from 'drizzle-orm';

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
// Telegram stores the webhook URL indefinitely; rotate only when the user
// re-runs setup. Ten years is effectively "until reinstall".
const WEBHOOK_TOKEN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

const LINK_PLATFORM = 'telegram-link';
const START_TOKEN_PREFIX = 'v1_';

function signingKey(): string {
  const secret =
    process.env.TELEGRAM_PLUGIN_SECRET ?? process.env.AUTH_SECRET ?? process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'Telegram plugin requires TELEGRAM_PLUGIN_SECRET (or AUTH_SECRET/ENCRYPTION_SECRET) to sign webhook tokens',
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

function createSignedToken(userId: string, ttlMs: number): string {
  const payload = [
    Buffer.from(userId, 'utf8').toString('base64url'),
    String(Date.now() + ttlMs),
    randomBytes(12).toString('base64url'),
  ].join('.');
  return `${payload}.${sign(payload)}`;
}

export interface VerifiedTelegramToken {
  userId: string;
  nonce: string;
  expiresAt: number;
}

export function verifyTelegramToken(token: string): VerifiedTelegramToken | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [encodedUserId, expiresRaw, nonce, signature] = parts;
  if (!encodedUserId || !expiresRaw || !nonce || !signature) return null;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const payload = `${encodedUserId}.${expiresRaw}.${nonce}`;
  const expected = Buffer.from(sign(payload), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let userId: string;
  try {
    userId = Buffer.from(encodedUserId, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!userId) return null;

  return { userId, nonce, expiresAt };
}

/** Long-lived token embedded in the Telegram webhook path. */
export function createWebhookToken(userId: string): string {
  return createSignedToken(userId, WEBHOOK_TOKEN_TTL_MS);
}

/** Short random `?start=` payload. 27 chars, well under Telegram's 64 limit. */
export function generateStartToken(): string {
  return `${START_TOKEN_PREFIX}${randomBytes(18).toString('base64url')}`;
}

/** Create a single-use 15-minute Telegram start token for a user. */
export async function createLinkToken(args: {
  userId: string;
  tenantId: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
  const staleBefore = new Date(Date.now() - LINK_TOKEN_TTL_MS);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateStartToken();
    const inserted = await withTenantDb(
      args.tenantId,
      async (db) => {
        // Drop this user's expired pending tokens before adding a new one.
        await db
          .delete(schema.botLinks)
          .where(
            and(
              eq(schema.botLinks.platform, LINK_PLATFORM),
              eq(schema.botLinks.userId, args.userId),
              lt(schema.botLinks.linkedAt, staleBefore),
            ),
          );

        return db
          .insert(schema.botLinks)
          .values({
            userId: args.userId,
            tenantId: args.tenantId,
            platform: LINK_PLATFORM,
            chatId: token,
            linkedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ chatId: schema.botLinks.chatId });
      },
      { userId: args.userId },
    );
    if (inserted.length > 0) return { token, expiresAt };
  }

  throw new Error('Could not allocate a unique Telegram link token');
}

/**
 * Verify + consume a start token. Returns the owning user/tenant only when
 * the token exists and has not expired. The temporary row is deleted whether
 * the token was valid or expired, so a code is truly single-use.
 */
export async function consumeLinkToken(
  token: string,
): Promise<{ userId: string; tenantId: string; expiresAt: Date } | null> {
  if (!token.startsWith(START_TOKEN_PREFIX) || token.length > 64) return null;

  const lookupAndConsume = async (db: ReturnType<typeof getDb>) => {
    const [found] = await db
      .select({
        userId: schema.botLinks.userId,
        tenantId: schema.botLinks.tenantId,
        linkedAt: schema.botLinks.linkedAt,
      })
      .from(schema.botLinks)
      .where(and(eq(schema.botLinks.platform, LINK_PLATFORM), eq(schema.botLinks.chatId, token)))
      .limit(1);

    if (!found) return null;

    await db
      .delete(schema.botLinks)
      .where(and(eq(schema.botLinks.platform, LINK_PLATFORM), eq(schema.botLinks.chatId, token)));

    return found;
  };

  let row: Awaited<ReturnType<typeof lookupAndConsume>>;
  try {
    row = await withAdminDb(lookupAndConsume);
  } catch {
    // Local/single-role deployments may not configure ADMIN_DATABASE_URL.
    row = await lookupAndConsume(getDb());
  }

  if (!row) return null;
  const expiresAt = new Date(row.linkedAt.getTime() + LINK_TOKEN_TTL_MS);
  if (expiresAt.getTime() <= Date.now()) return null;

  return { userId: row.userId, tenantId: row.tenantId, expiresAt };
}

// ── bot_links persistence ─────────────────────────────────────────────────

export async function linkChat(args: {
  userId: string;
  tenantId: string;
  chatId: string;
}): Promise<void> {
  await withTenantDb(
    args.tenantId,
    async (db) => {
      await db
        .insert(schema.botLinks)
        .values({
          userId: args.userId,
          tenantId: args.tenantId,
          platform: 'telegram',
          chatId: args.chatId,
        })
        .onConflictDoUpdate({
          target: [schema.botLinks.platform, schema.botLinks.chatId],
          set: {
            userId: args.userId,
            tenantId: args.tenantId,
            linkedAt: new Date(),
          },
        });
    },
    { userId: args.userId },
  );
}

export async function unlinkChat(userId: string, tenantId: string): Promise<void> {
  await withTenantDb(
    tenantId,
    async (db) => {
      await db
        .delete(schema.botLinks)
        .where(
          and(
            eq(schema.botLinks.userId, userId),
            inArray(schema.botLinks.platform, ['telegram', LINK_PLATFORM]),
          ),
        );
    },
    { userId },
  );
}

export async function getLinkedChat(
  userId: string,
  tenantId: string,
): Promise<{ chatId: string; linkedAt: Date } | null> {
  return withTenantDb(
    tenantId,
    async (db) => {
      const [row] = await db
        .select({ chatId: schema.botLinks.chatId, linkedAt: schema.botLinks.linkedAt })
        .from(schema.botLinks)
        .where(and(eq(schema.botLinks.userId, userId), eq(schema.botLinks.platform, 'telegram')))
        .limit(1);
      return row ?? null;
    },
    { userId },
  );
}
