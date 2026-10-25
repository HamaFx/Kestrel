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

// Alert delivery orchestration (DEC-05 split from delivery.ts): noise gate,
// channel selection, and the single place that marks an alert fired.
//
// Audit plan §1.11 / P1-16 — before any provider is touched, the user's
// noise control settings (dedup / cooldown / quiet hours) are consulted
// through `evaluateNoise`. Suppressed alerts are never delivered but stay
// active, so they fire normally once the suppression window lifts.

import { pluginHost } from '@kestrel/plugin-sdk';
import { metrics } from '@kestrel/shared';

import { createPluginExecutionContext, getInstalledPluginRuntime } from '../../plugins';
import { alertChannelRegistry, type AlertChannelDeliveryResult } from '../channel-registry';
import { markFiredForAlert } from '../persistence';
import { deliverEmail, deliverWebPush } from './adapters';
import { alog } from './context';
import { evaluateAlertNoise } from './noise';
import { deliverTelegramViaPlugin } from './telegram';
import type { DeliverArgs, DeliveryResult } from './types';

export async function deliverAlert({
  alert,
  reading,
  env,
  claimAt,
}: DeliverArgs): Promise<DeliveryResult> {
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
  for (const ch of alert.channels) {
    const r = await deliverChannel(ch, { alert, reading, env, claimAt });
    if (!r) continue; // Unknown channel id — skip, never fatal.
    if (r.ok) {
      // Delivery confirmed — persist dedup/cooldown state so subsequent
      // noisy repeats of this content are suppressed.
      await noise?.record().catch((err) => {
        alog.warn('noise-control record failed', { alertId: alert.id, err: String(err) });
      });
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
