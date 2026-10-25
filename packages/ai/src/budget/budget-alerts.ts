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

// Monthly spend and provider-threshold alerts.
//
// Alerts are best-effort notifications: the budget decision is computed
// first, then thresholds are persisted so each percentage fires once.

import { getUserWithSettings, requireTenantIdForUser, schema } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';

import { sendDirectNotification } from '../alerts/delivery';
import { getDb } from '../runtime/db';
import { getMonthlySpend, getProviderMonthlySpend } from './budget-spend';

function triggerSpendAlert(
  userId: string,
  percentage: string,
  spent: number,
  limit: number,
  config: { email?: boolean; telegram?: boolean },
) {
  return triggerAlert(userId, config, {
    subject: `[Kestrel] Monthly Budget Alert: ${percentage} Reached`,
    body: `Your monthly AI spend has reached ${percentage} of your limit.\n\nSpent: $${spent.toFixed(2)} / $${limit.toFixed(2)}\n\n— Kestrel`,
  });
}

function triggerProviderAlert(
  userId: string,
  providerId: string,
  spent: number,
  limit: number,
  config: { email?: boolean; telegram?: boolean },
) {
  return triggerAlert(userId, config, {
    subject: `[Kestrel] Provider Threshold Alert: ${providerId}`,
    body: `Your monthly spend for provider "${providerId}" has exceeded your configured threshold.\n\nSpent: $${spent.toFixed(2)} / $${limit.toFixed(2)}\n\n— Kestrel`,
  });
}

async function triggerAlert(
  userId: string,
  config: { email?: boolean; telegram?: boolean },
  opts: { subject: string; body: string },
) {
  const { settings, user: userRow } = await getUserWithSettings(userId);

  const alertEmail = settings?.alertEmail || userRow?.email || process.env.ALERT_TO_EMAIL;
  const telegramBotToken = settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  const channels: ('email' | 'telegram')[] = [];
  if (config.email && alertEmail) channels.push('email');
  if (config.telegram && telegramBotToken && telegramChatId) channels.push('telegram');

  if (channels.length === 0) return;

  const alertEnv: Parameters<typeof sendDirectNotification>[2] = {};
  if (process.env.RESEND_API_KEY) alertEnv.RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (process.env.ALERT_FROM_EMAIL) alertEnv.ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
  if (alertEmail) alertEnv.ALERT_TO_EMAIL = alertEmail;
  if (telegramBotToken) alertEnv.TELEGRAM_BOT_TOKEN = telegramBotToken;
  if (telegramChatId) alertEnv.TELEGRAM_CHAT_ID = telegramChatId;

  await sendDirectNotification(opts.subject, opts.body, alertEnv, channels);
}

export async function checkBudgetAlertsAndThresholds(
  userId: string,
  activeProviderId: string | null,
  now = new Date(),
): Promise<{ blocked: boolean; blockedReason?: string; nonEssentialDisabled: boolean }> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const [userSettings] = await db
    .select({
      monthlyBudgetLimit: schema.userSettings.monthlyBudgetLimit,
      providerSpendingThresholds: schema.userSettings.providerSpendingThresholds,
      spendAlertsConfig: schema.userSettings.spendAlertsConfig,
      spendAlertsState: schema.userSettings.spendAlertsState,
    })
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));

  if (!userSettings) {
    return { blocked: false, nonEssentialDisabled: false };
  }

  const limit = userSettings.monthlyBudgetLimit;
  const providerThresholds = userSettings.providerSpendingThresholds ?? {};
  const alertsConfig = userSettings.spendAlertsConfig ?? {};
  const alertsState = userSettings.spendAlertsState ?? {};

  const currentMonthKey = now.toISOString().slice(0, 7);
  const isNewMonth = alertsState.monthKey !== currentMonthKey;

  const state = isNewMonth
    ? {
        monthKey: currentMonthKey,
        alerted50: false,
        alerted80: false,
        alerted100: false,
        providerAlerted: [] as string[],
      }
    : {
        monthKey: alertsState.monthKey,
        alerted50: !!alertsState.alerted50,
        alerted80: !!alertsState.alerted80,
        alerted100: !!alertsState.alerted100,
        providerAlerted: Array.isArray(alertsState.providerAlerted)
          ? alertsState.providerAlerted
          : ([] as string[]),
      };

  let stateChanged = isNewMonth;
  let nonEssentialDisabled = false;

  if (limit && limit > 0) {
    const totalSpend = await getMonthlySpend(userId, now);
    if (totalSpend >= limit) {
      if (!state.alerted100) {
        state.alerted100 = true;
        await triggerSpendAlert(userId, '100%', totalSpend, limit, alertsConfig);
      }
      return {
        blocked: true,
        blockedReason: `Monthly budget limit reached: $${totalSpend.toFixed(2)} / $${limit.toFixed(2)}`,
        nonEssentialDisabled: true,
      };
    }

    if (totalSpend >= limit * 0.8) {
      nonEssentialDisabled = true;
      if (!state.alerted80) {
        state.alerted80 = true;
        stateChanged = true;
        await triggerSpendAlert(userId, '80%', totalSpend, limit, alertsConfig);
      }
    } else if (totalSpend >= limit * 0.5) {
      if (!state.alerted50) {
        state.alerted50 = true;
        stateChanged = true;
        await triggerSpendAlert(userId, '50%', totalSpend, limit, alertsConfig);
      }
    }
  }

  if (activeProviderId) {
    const providerLimit = providerThresholds[activeProviderId];
    if (providerLimit && providerLimit > 0) {
      const providerSpend = await getProviderMonthlySpend(userId, activeProviderId, now);
      if (providerSpend >= providerLimit) {
        if (!state.providerAlerted.includes(activeProviderId)) {
          state.providerAlerted.push(activeProviderId);
          await triggerProviderAlert(
            userId,
            activeProviderId,
            providerSpend,
            providerLimit,
            alertsConfig,
          );
        }
        return {
          blocked: true,
          blockedReason: `Provider "${activeProviderId}" spending limit exceeded: $${providerSpend.toFixed(2)} / $${providerLimit.toFixed(2)}`,
          nonEssentialDisabled,
        };
      }
    }
  }

  if (stateChanged) {
    await db
      .update(schema.userSettings)
      .set({
        spendAlertsState: state as {
          monthKey?: string;
          alerted50?: boolean;
          alerted80?: boolean;
          alerted100?: boolean;
          providerAlerted?: string[];
        } | null,
      })
      .where(
        and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)),
      );
  }

  return { blocked: false, nonEssentialDisabled };
}
