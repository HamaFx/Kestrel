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
// iteration (P1-17). External providers are mocked; noise state is a
// controllable in-memory stub standing in for DbNoiseState.

import { DEFAULT_NOISE_CONFIG, metrics, type Alert, type NoiseConfig } from '@kestrel/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deliverAlert } from '../src/alerts/delivery';
import { markFiredForAlert } from '../src/alerts/persistence';
import { getNoiseConfig } from '../src/notifications/noise-state';

const pluginMocks = vi.hoisted(() => ({
  deliver: vi.fn(async () => ({ ok: true })),
  getAlertChannel: vi.fn((id: string) =>
    id === 'telegram-bot' ? { pluginId: 'telegram-bot', deliver: pluginMocks.deliver } : undefined,
  ),
}));

const noiseMocks = vi.hoisted(() => ({
  hasSeen: vi.fn(async (_dedupKey: string, _ttlSeconds: number): Promise<boolean> => false),
  inCooldown: vi.fn(
    async (_cooldownKey: string, _cooldownSeconds: number): Promise<boolean> => false,
  ),
  record: vi.fn(async (_dedupKey: string, _cooldownKey: string): Promise<void> => undefined),
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
  DbNoiseState: class DbNoiseState {
    constructor(public userId: string) {}
    hasSeen = noiseMocks.hasSeen;
    inCooldown = noiseMocks.inCooldown;
    record = noiseMocks.record;
  },
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
    noiseMocks.hasSeen.mockClear();
    noiseMocks.hasSeen.mockResolvedValue(false);
    noiseMocks.inCooldown.mockClear();
    noiseMocks.inCooldown.mockResolvedValue(false);
    noiseMocks.record.mockClear();
    noiseMocks.record.mockResolvedValue(undefined);
    vi.mocked(getNoiseConfig).mockClear();
    vi.mocked(getNoiseConfig).mockResolvedValue({ ...DEFAULT_NOISE_CONFIG });
    vi.mocked(markFiredForAlert).mockClear();
    pluginMocks.deliver.mockClear();
    pluginMocks.getAlertChannel.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('suppresses duplicate content before any provider call', async () => {
    noiseMocks.hasSeen.mockResolvedValue(true);

    const result = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(result.ok).toBe(false);
    expect(result.channel).toBe('noise-control');
    expect(result.message).toContain('duplicate');
    // No provider call, no fired transition — the alert stays active.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(markFiredForAlert).not.toHaveBeenCalled();
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

  it('records dedup/cooldown state only after a confirmed delivery', async () => {
    const result = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(result.ok).toBe(true);
    expect(result.channel).toBe('email');
    expect(markFiredForAlert).toHaveBeenCalledTimes(1);
    expect(noiseMocks.record).toHaveBeenCalledTimes(1);
    const [dedupKey, cooldownKey] = noiseMocks.record.mock.calls[0]!;
    expect(typeof dedupKey).toBe('string');
    expect(dedupKey.length).toBeGreaterThan(0);
    expect(cooldownKey).toBe('alert');
  });

  it('does not record noise state when delivery fails, so retries are not suppressed', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const result = await deliverAlert({
      alert: makeAlert(['email']),
      reading: { value: 2_450, source: 'test' },
      env: configuredEnv(),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('resend HTTP 500');
    expect(noiseMocks.record).not.toHaveBeenCalled();
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
    noiseMocks.hasSeen.mockReset();
    noiseMocks.hasSeen.mockResolvedValue(false);
    noiseMocks.inCooldown.mockReset();
    noiseMocks.inCooldown.mockResolvedValue(false);
    noiseMocks.record.mockReset();
    noiseMocks.record.mockResolvedValue(undefined);
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
