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

// Noise-control gate for alert delivery.
//
// Audit plan §1.11 / P1-16 — before any provider is touched, the user's
// noise control settings (dedup / cooldown / quiet hours) are consulted.
// Suppressed alerts are never delivered but stay active, so they fire
// normally once the suppression window lifts. Dedup/cooldown state is
// process-local.

import type { Alert, NoiseDecision } from '@kestrel/shared';

import { evaluateNoise, hashContent, InMemoryNoiseState } from '../../notifications/noise-control';
import { getNoiseConfig } from '../../notifications/noise-state';
import type { RuleReading } from '../spec';
import { ALERT_NOISE_SEVERITY, alog } from './context';
import { renderEmailBody } from './render';

/**
 * Process-local noise state, one bucket per user. A fresh instance per call
 * (the previous behaviour) reset dedup/cooldown memory on every tick, so an
 * identical alert could never be suppressed.
 */
const noiseStates = new Map<string, InMemoryNoiseState>();

function noiseStateFor(userId: string): InMemoryNoiseState {
  let state = noiseStates.get(userId);
  if (!state) {
    state = new InMemoryNoiseState();
    noiseStates.set(userId, state);
  }
  return state;
}

/** Clear process-local noise buckets between tests. */
export function resetAlertNoiseStateForTests(): void {
  noiseStates.clear();
}

/**
 * Noise-control gate for one alert delivery (audit plan §1.11 / P1-16).
 *
 * Returns the `evaluateNoise` decision plus a deferred `record()` that
 * persists the dedup/cooldown keys. Recording is deferred until a channel
 * confirms delivery: a transient provider failure must keep retrying on the
 * next cron tick, not be suppressed as its own "duplicate".
 *
 * Returns null (fail open) when noise state cannot be read — alert delivery
 * must never depend on the noise subsystem being healthy.
 */
export async function evaluateAlertNoise(
  alert: Alert,
  reading: RuleReading,
): Promise<{ decision: NoiseDecision; record: () => Promise<void> } | null> {
  const content = renderEmailBody(alert, reading);
  try {
    const config = await getNoiseConfig(alert.userId);
    const state = noiseStateFor(alert.userId);
    const decision = await evaluateNoise(content, 'alert', ALERT_NOISE_SEVERITY, config, {
      hasSeen: (dedupKey, ttlSeconds) => state.hasSeen(dedupKey, ttlSeconds),
      inCooldown: (cooldownKey, cooldownSeconds) => state.inCooldown(cooldownKey, cooldownSeconds),
      record: async () => {
        /* deferred — see record() below */
      },
    });
    const dedupKey = decision.dedupKey ?? hashContent(content, 'alert');
    const cooldownKey = decision.cooldownKey ?? 'alert';
    return {
      decision,
      record: () => state.record(dedupKey, cooldownKey),
    };
  } catch (err) {
    alog.warn('noise-control unavailable; delivering without suppression', {
      alertId: alert.id,
      err: String(err),
    });
    return null;
  }
}
