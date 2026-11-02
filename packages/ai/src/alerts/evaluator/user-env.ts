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

// Per-user delivery configuration for one evaluator run.
//
// Alert delivery needs each user's own address and bot/chat ids plus that
// user's tenant id for the claim and fired-state writes. Both are resolved
// once per tick here so the per-alert helpers never repeat the membership join
// (an N+1 across the whole alert list).

import { requireTenantIdForUser, schema, type DbClient } from '@kestrel/db';
import { eq, inArray } from 'drizzle-orm';

import type { EvaluatorEnv } from './env';

export interface AlertRunEnvs {
  /** Process/worker-level defaults, used when a user has no override. */
  globalEnv: EvaluatorEnv;
  /** Delivery env for one user (falls back to `globalEnv` field by field). */
  envFor: (userId: string) => EvaluatorEnv;
  /** The user's tenant, or undefined when the membership lookup fails. */
  tenantFor: (userId: string) => Promise<string | undefined>;
}

/** Axis the evaluator needs from an alert to resolve its user's env. */
interface AlertOwnerRow {
  id: string;
  userId: string;
}

function processEvaluatorEnv(): EvaluatorEnv {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? undefined,
    ALERT_FROM_EMAIL: process.env.ALERT_FROM_EMAIL ?? undefined,
    ALERT_TO_EMAIL: process.env.ALERT_TO_EMAIL ?? undefined, // Fallback
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? undefined,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? undefined,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? undefined,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? undefined,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? undefined,
  };
}

export async function resolveAlertRunEnvs(
  alerts: readonly AlertOwnerRow[],
  db: DbClient,
  explicitEnv?: EvaluatorEnv | undefined,
): Promise<AlertRunEnvs> {
  const globalEnv: EvaluatorEnv = explicitEnv ?? processEvaluatorEnv();
  const userEnvMap = new Map<string, EvaluatorEnv>();
  // `null` caches a failed lookup too: the evaluator would otherwise repeat
  // (and re-log) the membership join once per alert for the same user.
  const tenantByUser = new Map<string, string | null>();

  const tenantFor = async (userId: string): Promise<string | undefined> => {
    const known = tenantByUser.get(userId);
    if (known !== undefined) return known ?? undefined;
    try {
      const tenantId = await requireTenantIdForUser(userId);
      tenantByUser.set(userId, tenantId);
      return tenantId;
    } catch {
      // Fall through undefined so the persistence helper resolves (and
      // fails) on its own path with its own error surface.
      tenantByUser.set(userId, null);
      return undefined;
    }
  };

  const userIds = Array.from(new Set(alerts.map((a) => a.userId)));
  if (userIds.length > 0) {
    const userRows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        alertEmail: schema.userSettings.alertEmail,
        telegramBotToken: schema.userSettings.telegramBotToken,
        telegramChatId: schema.userSettings.telegramChatId,
      })
      .from(schema.users)
      .leftJoin(schema.userSettings, eq(schema.users.id, schema.userSettings.userId))
      .where(inArray(schema.users.id, userIds));

    for (const row of userRows) {
      userEnvMap.set(row.id, {
        ...globalEnv,
        ALERT_TO_EMAIL: row.alertEmail || row.email || globalEnv.ALERT_TO_EMAIL,
        TELEGRAM_BOT_TOKEN: row.telegramBotToken || globalEnv.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: row.telegramChatId || globalEnv.TELEGRAM_CHAT_ID,
      });
    }
  }

  return {
    globalEnv,
    envFor: (userId) => userEnvMap.get(userId) ?? globalEnv,
    tenantFor,
  };
}
