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

// Audit plan §1.11 — alert delivery noise control (P1-16) and channel
// iteration (P1-17). External providers are mocked; the noise state is the
// real process-local implementation, reset between tests.

import { DEFAULT_NOISE_CONFIG, metrics, type Alert, type NoiseConfig } from '@kestrel/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deliverAlert } from '../src/alerts/delivery';
import { resetAlertNoiseStateForTests } from '../src/alerts/delivery/noise';
import { markFiredForAlert } from '../src/alerts/persistence';
import { getNoiseConfig } from '../src/notifications/noise-state';

const pluginMocks = vi.hoisted(() => ({
  deliver: vi.fn(async () => ({ ok: true })),
  getAlertChannel: vi.fn((id: string) =>
    id === 'telegram-bot' ? { pluginId: 'telegram-bot', deliver: pluginMocks.deliver } : undefined,
  ),
}));

vi.mock('../src/alerts/persistence', () => ({
  markFiredForAlert: vi.fn(async () => true),
}));

vi.mock('../src/push/persistence', () => ({
  listPushSubscriptions: vi.fn(async () => []),
  deletePushSubscription: vi.fn(async () => undefined),
}));

vi.mock('../src/push/send', () => ({
  sendWebPush: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@kestrel/plugin-sdk', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, pluginHost: { getAlertChannel: pluginMocks.getAlertChannel } };
});

vi.mock('../src/plugins', () => ({
  getInstalledPluginRuntime: vi.fn(async () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    installedPluginIds: ['telegram-bot'],
    plugins: [{ pluginId: 'telegram-bot', settings: { botToken: 'tg-token', linkedChatId: '42' } }],
  })),
  createPluginExecutionContext: vi.fn(() => ({
    settings: {},
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })),
}));

vi.mock('../src/notifications/noise-state', () => ({
  getNoiseConfig: vi.fn(async (): Promise<NoiseConfig> => ({ ...DEFAULT_NOISE_CONFIG })),
}));

const fetchMock = vi.fn(async () => new Response('{"id":"resp-1"}', { status: 200 }));

function makeAlert(channels: Alert['channels']): Alert {
  return {
    id: '00000000-0000-4000-8000-000000000001',
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

function configuredEnv() {
  return {
    RESEND_API_KEY: 'resend-key',
    ALERT_FROM_EMAIL: 'alerts@kestrel.local',
    ALERT_TO_EMAIL: 'owner@kestrel.local',
    TELEGRAM_BOT_TOKEN: 'tg-token',
    TELEGRAM_CHAT_ID: '42',
  };
}

describe('deliverAlert — noise control (audit plan §1.11 / P1-16)', () => {
  beforeEach(() => {
    metrics.reset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response('{"id":"resp-1"}', { status: 200 }));
    resetAlertNoiseStateForTests();
    vi.mocked(getNoiseConfig).mockClear();
    vi.mocked(getNoiseConfig).mockResolvedValue({ ...DEFAULT_NOISE_CONFIG });
    vi.mocked(markFiredForAlert).mockClear();
    pluginMocks.deliver.mockClear();
    pluginMocks.getAlertChannel.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('suppresses duplicate content before the second provider call', async () => {
    const first = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });
    expect(first.ok).toBe(true);

    const second = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(second.ok).toBe(false);
    expect(second.channel).toBe('noise-control');
    expect(second.message).toContain('duplicate');
    // Only the confirmed delivery touched the provider or markFired.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(markFiredForAlert).toHaveBeenCalledTimes(1);
    expect(metrics.snapshot().counters['alert_noise_suppressed_total{reason=duplicate}']).toBe(1);
  });

  it('suppresses below-min-severity alerts during quiet hours', async () => {
    vi.mocked(getNoiseConfig).mockResolvedValue({
      ...DEFAULT_NOISE_CONFIG,
      // Full-day window so the assertion holds at any wall-clock time.
      quietHours: { start: '00:00', end: '24:00' },
      timezone: 'UTC',
    });

    const result = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('quiet_hours');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(metrics.snapshot().counters['alert_noise_suppressed_total{reason=quiet_hours}']).toBe(1);
  });

  it('does not suppress a retry after a failed delivery', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const failed = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });
    expect(failed.ok).toBe(false);
    expect(failed.message).toContain('resend HTTP 500');

    const retried = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });
    expect(retried.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails open and delivers when noise state cannot be read', async () => {
    vi.mocked(getNoiseConfig).mockRejectedValue(new Error('noise db unavailable'));

    const result = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(result.ok).toBe(true);
    expect(result.channel).toBe('email');
  });
});

describe('deliverAlert — channel iteration (audit plan §1.11 / P1-17)', () => {
  beforeEach(() => {
    metrics.reset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response('{"id":"resp-1"}', { status: 200 }));
    resetAlertNoiseStateForTests();
    vi.mocked(getNoiseConfig).mockClear();
    vi.mocked(getNoiseConfig).mockResolvedValue({ ...DEFAULT_NOISE_CONFIG });
    vi.mocked(markFiredForAlert).mockClear();
    pluginMocks.deliver.mockClear();
    pluginMocks.getAlertChannel.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips an unconfigured channel instead of stopping the loop', async () => {
    // Email is listed first but not configured; the Telegram plugin channel
    // is installed and linked. The old "not configured" short-circuit never
    // reached Telegram.
    const result = await deliverAlert({
      alert: makeAlert(['email', 'telegram']),
      reading: { value: 2_450, source: 'test' },
      env: {},
    });

    expect(result.ok).toBe(true);
    expect(result.channel).toBe('telegram');
    expect(pluginMocks.deliver).toHaveBeenCalledTimes(1);
    expect(markFiredForAlert).toHaveBeenCalledTimes(1);
  });

  it('keeps iterating after a hard delivery failure on an earlier channel', async () => {
    fetchMock.mockResolvedValueOnce(new Response('resend down', { status: 503 }));

    const result = await deliverAlert({
      alert: makeAlert(['email', 'telegram']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.channel).toBe('telegram');
    expect(pluginMocks.deliver).toHaveBeenCalledTimes(1);
  });

  it('returns the informative result when every configured channel is missing', async () => {
    const result = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(result.channel).toBe('email');
    expect(result.message).toContain('not configured');
    expect(markFiredForAlert).not.toHaveBeenCalled();
  });

  it('returns no-channels for an empty channel list', async () => {
    const result = await deliverAlert({
      alert: makeAlert([]),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(result.ok).toBe(false);
    expect(result.channel).toBe('none');
    expect(result.message).toBe('no channels');
  });
});
