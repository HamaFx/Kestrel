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

// Alert delivery orchestration: noise gate,
// channel selection, and the single place that marks an alert fired.
//
// Audit plan §1.11 / P1-16 — before any provider is touched, the user's
// noise control settings (dedup / cooldown / quiet hours) are consulted
// through `evaluateNoise`. Suppressed alerts are never delivered but stay
// active, so they fire normally once the suppression window lifts.
//
// R10 (audit 2026-10-31) — every channel attempt runs under a time budget and
// under the run's abort signal. A provider that hangs is abandoned (the alert
// is left active for the next tick) instead of holding the cron tick and every
// other user's alerts behind it.

import { pluginHost } from '@kestrel/plugin-sdk';
import { metrics } from '@kestrel/shared';

import { createPluginExecutionContext, getInstalledPluginRuntime } from '../../plugins';
import { alertChannelRegistry, type AlertChannelDeliveryResult } from '../channel-registry';
import { markFiredForAlert } from '../persistence';
import { deliverEmail, deliverWebPush } from './adapters';
import {
  budgetSignal,
  DELIVERY_ATTEMPT_TIMEOUT_MS,
  isDeliveryAbandoned,
  raceWithAbort,
} from './budget';
import { alog } from './context';
import { evaluateAlertNoise } from './noise';
import { deliverTelegramViaPlugin } from './telegram';
import type { DeliverArgs, DeliveryResult } from './types';

export async function deliverAlert({
  alert,
  reading,
  env,
  claimAt,
  signal,
  attemptTimeoutMs,
}: DeliverArgs): Promise<DeliveryResult> {
  // R10 — the run is already cancelled (job abort / run budget): do not touch
  // a provider at all. The caller releases the claim so the next tick retries.
  if (signal?.aborted) {
    return {
      alertId: alert.id,
      channel: alert.channels[0] ?? 'none',
      ok: false,
      abandoned: true,
      message: 'run cancelled before delivery started',
    };
  }

  // Audit plan §1.11 / P1-16 — consult dedup/cooldown/quiet-hours state
  // before any external call. A suppressed alert returns without calling
  // markFired; the evaluator releases the claim and the alert stays active,
  // so it fires once the suppression window lifts.
  const noise = await evaluateAlertNoise(alert, reading);
  if (noise && !noise.decision.shouldSend) {
    metrics.increment('alert_noise_suppressed_total', {
      tags: { reason: noise.decision.reasonCode },
    });
    alog.debug('alert suppressed by noise control', {
      alertId: alert.id,
      reason: noise.decision.reasonCode,
    });
    return {
      alertId: alert.id,
      channel: 'noise-control',
      ok: false,
      message: `noise: ${noise.decision.reasonCode} (${noise.decision.message})`,
    };
  }

  // Pick the first configured channel that can actually deliver. Iterating
  // over alert.channels means the user controls priority.
  //
  // Audit plan §1.11 / P1-17 — only a successful delivery (`ok`) short-circuits
  // the loop. Unconfigured or failing channels are skipped so a later
  // configured channel still gets its chance; the previous "not configured"
  // short-circuit silently starved every channel after the first gap.
  let lastAttempt: DeliveryResult | null = null;
  const budgetMs = attemptTimeoutMs ?? DELIVERY_ATTEMPT_TIMEOUT_MS;
  for (const ch of alert.channels) {
    // R10 — one bounded attempt per channel, under the run's signal.
    const attemptSignal = budgetSignal(budgetMs, signal);
    let r: DeliveryResult | null;
    try {
      r = await raceWithAbort(
        deliverChannel(ch, {
          alert,
          reading,
          env,
          claimAt,
          signal: attemptSignal,
          attemptTimeoutMs: budgetMs,
        }),
        attemptSignal,
        `channel "${ch}" did not answer within ${budgetMs}ms`,
      );
    } catch (err) {
      if (!isDeliveryAbandoned(err)) throw err;
      // A hung provider must fail fast and move on: the alert stays active
      // and the evaluator releases the claim, so the next tick retries it
      // (at-least-once). Trying a second channel here would risk notifying
      // the user twice for one alert, since the abandoned attempt may yet
      // have reached the provider.
      const message = err instanceof Error ? err.message : String(err);
      alog.warn('alert channel abandoned at its time budget', {
        alertId: alert.id,
        channel: ch,
        err: message,
      });
      return {
        alertId: alert.id,
        channel: ch,
        ok: false,
        abandoned: true,
        message,
      };
    }
    if (!r) continue; // Unknown channel id — skip, never fatal.
    if (r.ok) {
      // Delivery confirmed — persist dedup/cooldown state so subsequent
      // noisy repeats of this content are suppressed. Never record for an
      // abandoned attempt: that would suppress its own retry.
      if (!r.abandoned) {
        await noise?.record().catch((err) => {
          alog.warn('noise-control record failed', { alertId: alert.id, err: String(err) });
        });
      }
      return r;
    }
    lastAttempt = r;
  }
  // Preserve the most informative failure (e.g. "not configured") for callers
  // that log the DeliveryResult; "no channels" stays for an empty list.
  return lastAttempt ?? { alertId: alert.id, channel: 'none', ok: false, message: 'no channels' };
}

async function deliverChannel(ch: string, args: DeliverArgs): Promise<DeliveryResult | null> {
  if (ch === 'telegram') {
    const bridged = await deliverTelegramViaPlugin(args);
    if (bridged) return finalizeDelivery('telegram', bridged, args);
    return {
      alertId: args.alert.id,
      channel: 'telegram',
      ok: false,
      message: 'Telegram plugin is not installed or not linked',
    };
  }

  const core = alertChannelRegistry.get(ch);
  if (core) {
    const result = await core.deliver(args);
    return finalizeDelivery(ch, result, args);
  }

  const plugin = pluginHost.getAlertChannel(ch);
  if (plugin) {
    const runtime = await getInstalledPluginRuntime(args.alert.userId);
    if (!runtime.installedPluginIds.includes(plugin.pluginId) || !runtime.tenantId) {
      return {
        alertId: args.alert.id,
        channel: ch,
        ok: false,
        message: `plugin "${plugin.pluginId}" is not installed`,
      };
    }
    const ctx = createPluginExecutionContext({
      userId: runtime.userId,
      tenantId: runtime.tenantId,
      pluginId: plugin.pluginId,
      settings: runtime.plugins.find((entry) => entry.pluginId === plugin.pluginId)?.settings ?? {},
      ...(args.signal ? { signal: args.signal } : {}),
    });
    const result = await plugin.deliver({
      alert: {
        id: args.alert.id,
        userId: args.alert.userId,
        note: args.alert.note ?? null,
        channels: args.alert.channels,
      },
      reading: { value: args.reading.value, source: args.reading.source },
      settings: ctx.settings,
      log: ctx.log,
      ...(args.signal ? { signal: args.signal } : {}),
    });
    return finalizeDelivery(ch, result, args);
  }

  // Unknown channel id — skip, never fatal (a user may have downgraded a
  // plugin while an alert still lists the channel).
  return null;
}

/**
 * Single place that marks an alert fired. Channels only report provider
 * acceptance; they never mutate alert state themselves.
 *
 * R10 — a provider that accepted after the run abandoned the attempt never
 * marks the alert fired. The claim is released instead, so the alert is
 * re-delivered on a later tick rather than being silently dropped (or being
 * marked fired for a delivery the run refused to wait for).
 */
async function finalizeDelivery(
  channel: string,
  result: AlertChannelDeliveryResult,
  args: DeliverArgs,
): Promise<DeliveryResult> {
  if (!result.ok) {
    return {
      alertId: args.alert.id,
      channel,
      ok: false,
      ...(result.message !== undefined ? { message: result.message } : {}),
    };
  }
  if (args.signal?.aborted) {
    return {
      alertId: args.alert.id,
      channel,
      ok: false,
      abandoned: true,
      message: 'delivery abandoned at its time budget after provider acceptance',
    };
  }
  const finalized = await markFiredForAlert(args.alert, new Date(), args.claimAt);
  return finalized
    ? { alertId: args.alert.id, channel, ok: true }
    : {
        alertId: args.alert.id,
        channel,
        ok: false,
        message: 'delivery claim lost after provider acceptance',
      };
}

// Core channels register themselves into the plugin-extensible registry.
// Plugin channels are resolved from `pluginHost` in `deliverChannel`, so no
// core edit is needed to add Discord/Slack/etc.
alertChannelRegistry.register({ id: 'email', label: 'Email', deliver: deliverEmail });
alertChannelRegistry.register({ id: 'web-push', label: 'Web push', deliver: deliverWebPush });
