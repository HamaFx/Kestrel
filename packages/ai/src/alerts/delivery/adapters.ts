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

// Core channel adapters — email (Resend) and web-push (DEC-05 split from
// delivery.ts). Each provider is invoked with a bounded request timeout;
// the evaluator supplies a database lease so concurrent cron runners do not
// deliver the same alert.
//
// We use plain fetch against Resend's API to avoid an extra dep; their API
// is a single POST with a JSON body.
//
// Ordering contract (Requirements 7.5, 7.6):
//   1. Build the email payload.
//   2. POST to Resend and await the response.
//   3. On 2xx → call markFired, then return ok.
//   4. On non-2xx (or fetch error) → log the Resend status + truncated body
//      and return without calling markFired so the next cron tick retries.

import { logErrorContext } from '@kestrel/shared/logger';

import { deletePushSubscription, listPushSubscriptions } from '../../push/persistence';
import { sendWebPush } from '../../push/send';
import type { AlertChannelDeliveryResult } from '../channel-registry';
import { alog, describeRule, EXTERNAL_DELIVERY_TIMEOUT_MS } from './context';
import { renderEmailBody } from './render';
import type { DeliverArgs } from './types';

export async function deliverEmail({
  alert,
  reading,
  env,
}: DeliverArgs): Promise<AlertChannelDeliveryResult> {
  if (!env.RESEND_API_KEY || !env.ALERT_FROM_EMAIL || !env.ALERT_TO_EMAIL) {
    // No Resend call happens, so delivery is not confirmed and the alert
    // stays active for the next cron tick.
    alog.warn('email channel not configured (RESEND_*); skipping');
    return {
      ok: false,
      message: 'not configured (RESEND_API_KEY / ALERT_FROM_EMAIL / ALERT_TO_EMAIL missing)',
    };
  }

  const subject = `Kestrel · ${describeRule(alert.rule)}`;
  const body = renderEmailBody(alert, reading);

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.ALERT_FROM_EMAIL,
        to: [env.ALERT_TO_EMAIL],
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(EXTERNAL_DELIVERY_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    logErrorContext(err, 'alerts/resend_fetch_failed', { alertId: alert.id }, 'email');
    return {
      ok: false,
      message: msg,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const truncated = text.slice(0, 200);
    // Log here so the failure is visible in Vercel function logs even though
    // the evaluator only surfaces the DeliveryResult upward.
    logErrorContext(
      new Error(`resend HTTP ${res.status}: ${truncated}`),
      'alerts/resend_http_error',
      { alertId: alert.id, status: res.status },
      'email',
    );
    return {
      ok: false,
      message: `resend HTTP ${res.status}: ${truncated}`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Web Push (Phase 3)
// ---------------------------------------------------------------------------
//
// Same ordering contract as email/Telegram: we only call `markFired` after
// every active subscription returned 2xx (or all returned 410/404, in
// which case the dead subscriptions are removed and the alert is still
// marked fired so the cron loop doesn't keep re-evaluating it).
//
// On a single non-2xx, non-410 response we leave the alert un-fired so the
// next cron tick retries — matching the email/Telegram retry semantics.

export async function deliverWebPush({
  alert,
  reading,
  env,
}: DeliverArgs): Promise<AlertChannelDeliveryResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return {
      ok: false,
      message: 'not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing)',
    };
  }

  const subs = await listPushSubscriptions(alert.userId);
  if (subs.length === 0) {
    return {
      ok: false,
      message: 'not configured (no push subscriptions registered)',
    };
  }

  const payload = JSON.stringify({
    title: `Kestrel · ${describeRule(alert.rule)}`,
    body: renderEmailBody(alert, reading),
    url: '/alerts',
  });

  let allOkOrGone = true;
  let anyOk = false;
  for (const sub of subs) {
    const r = await sendWebPush(sub, payload, {
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: env.VAPID_SUBJECT,
    });
    if (r.ok) {
      anyOk = true;
      continue;
    }
    if (r.status === 410 || r.status === 404) {
      // Dead subscription — drop it and keep going. We don't count this as
      // a failure for the markFired decision; the alert was effectively
      // delivered to every still-valid subscriber.
      alog.warn(
        `dropping dead push subscription ${sub.id} (HTTP ${r.status}) for alert ${alert.id}`,
      );
      await deletePushSubscription(alert.userId, sub.id);
      continue;
    }
    allOkOrGone = false;
    logErrorContext(
      new Error(`web-push HTTP ${r.status}`),
      'alerts/webpush_http_error',
      { alertId: alert.id, subscriptionId: sub.id, status: r.status },
      'push',
    );
  }

  if (!allOkOrGone) {
    return {
      ok: false,
      message: 'one or more pushes failed',
    };
  }

  if (!anyOk) {
    // Every active subscription returned 410/404 — none delivered. Still
    // return ok so the alert is marked fired and not re-evaluated forever;
    // the user can re-subscribe and the next matching alert will fire.
    alog.warn(`all push subscriptions were dead for alert ${alert.id}; marking fired anyway`);
  }

  return { ok: true };
}
