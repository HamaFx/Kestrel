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

// Alert evaluator orchestrator (DEC-05 split from evaluator.ts) — what the
// cron handler calls.
//
// Semantics:
//   - priceCross / candleClose — LEVEL alerts (one-shot). Fire the moment the
//     latest reading meets the rule, then deactivate.
//   - indicatorCross — true CROSSING semantics. We need the previous-tick
//     reading to detect a transition through the level; that baseline lives
//     on the rule itself (`rule.previousValue`). On the first tick it is
//     null and the alert never fires immediately on creation, even when
//     the indicator already sits past the threshold.
//
// In both flavours, delivery owns the `markFired` write; the alert stays
// active until a channel returns 2xx so transient delivery errors retry on
// the next cron tick.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import type { AlertRule } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { eq, inArray } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import { deliverAlert, type DeliveryResult } from '../delivery';
import {
  claimAlertDelivery,
  listEvaluable,
  releaseAlertDeliveryClaim,
  setRulePreviousValue,
} from '../persistence';
import { alertRuleRegistry } from '../rule-registry';
import { specFromRule } from '../spec';
import type { EvaluatorEnv } from './env';
import { readReadingsBatch } from './readings';

const elog = createCategorizedLogger('ai', { component: 'alerts-evaluator' });

export interface EvaluationResult {
  total: number;
  matched: number;
  fired: number;
  skipped: number;
  errors: Array<{ alertId: string; message: string }>;
  deliveries: DeliveryResult[];
}

export async function evaluateAlerts(
  opts: {
    env?: EvaluatorEnv;
    signal?: AbortSignal;
    ownsTenant?: (userId: string) => boolean;
  } = {},
): Promise<EvaluationResult> {
  const allAlerts = await listEvaluable();
  const alerts = opts.ownsTenant ? allAlerts.filter((a) => opts.ownsTenant!(a.userId)) : allAlerts;
  const globalEnv: EvaluatorEnv = opts.env ?? {
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? undefined,
    ALERT_FROM_EMAIL: process.env.ALERT_FROM_EMAIL ?? undefined,
    ALERT_TO_EMAIL: process.env.ALERT_TO_EMAIL ?? undefined, // Fallback
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? undefined,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? undefined,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? undefined,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? undefined,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? undefined,
  };

  const db = getDb();
  const userIds = Array.from(new Set(alerts.map((a) => a.userId)));
  const userEnvMap = new Map<string, EvaluatorEnv>();

  // Resolve each user's tenant at most once per tick. Without this, every
  // per-alert write helper repeats the membership join (an N+1 across the
  // whole alert list).
  const tenantByUser = new Map<string, string>();
  const tenantFor = async (userId: string): Promise<string | undefined> => {
    const known = tenantByUser.get(userId);
    if (known) return known;
    try {
      const tenantId = await requireTenantIdForUser(userId);
      tenantByUser.set(userId, tenantId);
      return tenantId;
    } catch {
      // Fall through undefined so the persistence helper resolves (and
      // fails) on its own path with its own error surface.
      return undefined;
    }
  };

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

  let matched = 0;
  let fired = 0;
  let skipped = 0;
  const errors: EvaluationResult['errors'] = [];
  const deliveries: DeliveryResult[] = [];

  // Phase 2 hardening §9 — read all rules' inputs in parallel.
  // We group dependencies (symbol, tf) and pre-fetch them concurrently
  // so we never execute duplicated upstream calls in this worker boundary.
  const batchMap = await readReadingsBatch(alerts);

  const readings = alerts.map((alert) => {
    const res = batchMap.get(alert.id);
    if (res instanceof Error) {
      return { alert, reading: null, error: res };
    }
    return { alert, reading: res ?? null, error: null };
  });

  for (const { alert, reading, error } of readings) {
    if (opts.signal?.aborted) break;
    if (error) {
      errors.push({
        alertId: alert.id,
        message: error.message,
      });
      continue;
    }
    try {
      if (!reading) {
        skipped += 1;
        continue;
      }

      // indicatorCross uses true crossing semantics: compare the previous
      // baseline (persisted on the rule) against the current value. If
      // there's no baseline yet, seed it and skip — the alert never fires
      // immediately on creation.
      // PF-08 — Use the specification pattern to evaluate the rule.
      const spec = specFromRule(alert.rule);
      const cross =
        alert.rule.type === 'indicatorCross'
          ? { previousValue: alert.rule.previousValue ?? null }
          : undefined;
      const isMatch = spec.isSatisfiedBy(reading, cross);

      if (alert.rule.type === 'indicatorCross' && !isMatch) {
        // Seed / refresh the baseline so the next tick has the right
        // anchor. Best-effort: failures here just mean the next tick
        // re-seeds.
        try {
          await setRulePreviousValue(
            alert.userId,
            alert.id,
            alert.rule,
            reading.value,
            await tenantFor(alert.userId),
          );
        } catch (err) {
          elog.warn('setRulePreviousValue failed', { id: alert.id, err: String(err) });
        }
        continue;
      }

      if (!isMatch) continue;

      matched += 1;

      // Claim immediately before external delivery. The conditional UPDATE
      // is the concurrency boundary: only one cron runner can hold the
      // lease for an alert at a time. A failed delivery releases it; a
      // crashed runner leaves a lease that a later tick can reclaim.
      const claimAt = new Date();
      const claimed = await claimAlertDelivery(
        alert.userId,
        alert.id,
        claimAt,
        undefined,
        await tenantFor(alert.userId),
      );
      if (!claimed) {
        skipped += 1;
        continue;
      }

      const alertEnv = userEnvMap.get(alert.userId) ?? globalEnv;
      try {
        const result = await deliverAlert({ alert, reading, env: alertEnv, claimAt });
        deliveries.push(result);
        if (result.ok) fired += 1;
        else await releaseAlertDeliveryClaim(alert.userId, alert.id, claimAt);
      } catch (err) {
        await releaseAlertDeliveryClaim(alert.userId, alert.id, claimAt).catch((releaseErr) => {
          elog.warn('releaseAlertDeliveryClaim failed', { id: alert.id, err: String(releaseErr) });
        });
        throw err;
      }
    } catch (err) {
      errors.push({
        alertId: alert.id,
        message: err instanceof Error ? err.message : 'unknown evaluator error',
      });
    }
  }

  return { total: alerts.length, matched, fired, skipped, errors, deliveries };
}

// Re-exports so callers can run the orchestrator AND build human-readable
// labels for the same rule shape.
export function describeRule(rule: AlertRule): string {
  return alertRuleRegistry.get(rule.type).describe(rule);
}
