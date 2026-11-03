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

// R10 (audit 2026-10-31) — a hung provider must fail fast and move on.
//
// The channel registry is used to register deliberately hung / uncooperative
// channels, and `deliverAlert` is given a tiny attempt budget so the real
// timers finish in milliseconds.

import { DEFAULT_NOISE_CONFIG, type Alert, type NoiseConfig } from '@kestrel/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alertChannelRegistry } from '../src/alerts/channel-registry';
import { deliverAlert } from '../src/alerts/delivery';
import { markFiredForAlert } from '../src/alerts/persistence';
import type * as NoiseControl from '../src/notifications/noise-control';
import { getNoiseConfig } from '../src/notifications/noise-state';

const noiseMocks = vi.hoisted(() => ({
  hasSeen: vi.fn(async (_key: string, _ttl: number): Promise<boolean> => false),
  inCooldown: vi.fn(async (_key: string, _seconds: number): Promise<boolean> => false),
  record: vi.fn(async (_dedupKey: string, _cooldownKey: string): Promise<void> => undefined),
}));

vi.mock('../src/alerts/persistence', () => ({
  markFiredForAlert: vi.fn(async () => true),
}));

vi.mock('../src/push/persistence', () => ({
  listPushSubscriptions: vi.fn(async () => []),
  deletePushSubscription: vi.fn(async () => undefined),
}));

vi.mock('../src/notifications/noise-state', () => ({
  getNoiseConfig: vi.fn(async (): Promise<NoiseConfig> => ({ ...DEFAULT_NOISE_CONFIG })),
}));

vi.mock('../src/notifications/noise-control', async () => {
  const actual = await vi.importActual<typeof NoiseControl>('../src/notifications/noise-control');
  return {
    ...actual,
    InMemoryNoiseState: class InMemoryNoiseState {
      hasSeen = noiseMocks.hasSeen;
      inCooldown = noiseMocks.inCooldown;
      record = noiseMocks.record;
    },
  };
});

function makeAlert(id: string, channels: Alert['channels']): Alert {
  return {
    id,
    userId: 'user-1',
    rule: { type: 'priceCross', symbol: 'XAUUSD', direction: 'above', level: 2_400 },
    channels,
    note: null,
    active: true,
    firedAt: null,
    lastFiredAt: null,
    snoozeHours: 0,
    createdAt: Date.now(),
  };
}

const configuredEnv = () => ({
  RESEND_API_KEY: 'resend-key',
  ALERT_FROM_EMAIL: 'alerts@kestrel.local',
  ALERT_TO_EMAIL: 'owner@kestrel.local',
});

describe('deliverAlert — provider time budgets (R10)', () => {
  beforeEach(() => {
    noiseMocks.record.mockClear();
    vi.mocked(getNoiseConfig).mockResolvedValue({ ...DEFAULT_NOISE_CONFIG });
    vi.mocked(markFiredForAlert).mockClear();
  });

  afterEach(() => {
    alertChannelRegistry.clear();
  });

  it('abandons a channel that never answers and reports it as abandoned', async () => {
    alertChannelRegistry.register({
      id: 'email',
      label: 'Hung email',
      deliver: () => new Promise(() => undefined),
    });

    const started = Date.now();
    const result = await deliverAlert({
      alert: makeAlert('hung', ['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
      attemptTimeoutMs: 25,
    });

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result).toMatchObject({ alertId: 'hung', channel: 'email', ok: false, abandoned: true });
    expect(result.message).toContain('25ms');
    // Never claim a delivery we gave up waiting for, and never record noise
    // state for it: that would suppress its own retry.
    expect(markFiredForAlert).not.toHaveBeenCalled();
    expect(noiseMocks.record).not.toHaveBeenCalled();
  });

  it('keeps trying later channels when an earlier one is merely unconfigured', async () => {
    alertChannelRegistry.register({
      id: 'email',
      label: 'Healthy email',
      deliver: async () => ({ ok: false, message: 'not configured' }),
    });
    alertChannelRegistry.register({
      id: 'web-push',
      label: 'Healthy push',
      deliver: async () => ({ ok: true }),
    });

    const result = await deliverAlert({
      alert: makeAlert('fallback', ['email', 'web-push']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
      attemptTimeoutMs: 500,
    });

    expect(result).toMatchObject({ channel: 'web-push', ok: true });
    expect(markFiredForAlert).toHaveBeenCalledTimes(1);
    expect(noiseMocks.record).toHaveBeenCalledTimes(1);
  });

  it('does not mark an alert fired when the run aborted after the provider accepted', async () => {
    alertChannelRegistry.register({
      id: 'email',
      label: 'Late email',
      deliver: async () => ({ ok: true }),
    });
    const controller = new AbortController();
    controller.abort(new Error('run budget exhausted'));

    const result = await deliverAlert({
      alert: makeAlert('late', ['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
      signal: controller.signal,
      attemptTimeoutMs: 500,
    });

    // The claim stays with the evaluator's release path so the next tick
    // retries; the provider acceptance is not treated as a confirmed fire.
    expect(result.ok).toBe(false);
    expect(result.abandoned).toBe(true);
    expect(markFiredForAlert).not.toHaveBeenCalled();
  });

  it('marks fired and records noise state when the provider answers in time', async () => {
    alertChannelRegistry.register({
      id: 'email',
      label: 'Fast email',
      deliver: async () => ({ ok: true }),
    });

    const result = await deliverAlert({
      alert: makeAlert('fast', ['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
      attemptTimeoutMs: 500,
      claimAt: new Date(),
    });

    expect(result).toMatchObject({ ok: true, channel: 'email' });
    expect(markFiredForAlert).toHaveBeenCalledTimes(1);
    expect(noiseMocks.record).toHaveBeenCalledTimes(1);
  });
});
