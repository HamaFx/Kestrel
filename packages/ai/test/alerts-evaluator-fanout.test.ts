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

// R10 (audit 2026-10-31) — bounded fan-out, fair rotation, and claim recovery.
//
// `listEvaluable` and `deliverAlert` are mocked so the assertions are about the
// evaluator's own behaviour: how much of the batch it asks for, in which order
// it serves users, what happens when a provider never answers, and what it does
// with the delivery claims it still holds when the run ends.
//
// Timeouts are exercised with real (short) budgets: `AbortSignal.timeout` is a
// native timer, so fake timers cannot advance it.

import { createHash } from 'node:crypto';

import { getPrice, type PriceResult } from '@kestrel/data';
import type { Alert, Tick } from '@kestrel/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateAlerts } from '../src/alerts/evaluator';
import { alertRotationKey, evaluationRotationSeed } from '../src/alerts/persistence/crud';

const persistenceMocks = vi.hoisted(() => ({
  listEvaluable: vi.fn(),
  claimAlertDelivery: vi.fn(),
  releaseAlertDeliveryClaim: vi.fn(),
  setRulePreviousValue: vi.fn(),
  markFiredForAlert: vi.fn(),
}));

const deliveryMocks = vi.hoisted(() => ({
  deliverAlert: vi.fn(),
}));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/data')>();
  return { ...actual, getPrice: vi.fn(), getCandles: vi.fn() };
});

vi.mock('@kestrel/db', () => ({
  hasAdminDbScope: () => false,
  hasTenantDbScope: () => false,
  getDb: () => ({
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: () => Promise.resolve([]) }),
        where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    }),
  }),
  requireTenantIdForUser: async (userId: string) => `tenant-${userId}`,
  schema: {
    alerts: { id: 'id', active: 'active', firedAt: 'fired_at', createdAt: 'created_at' },
    users: { id: 'id', email: 'email' },
    userSettings: {
      userId: 'user_id',
      alertEmail: 'alert_email',
      telegramBotToken: 'telegram_bot_token',
      telegramChatId: 'telegram_chat_id',
    },
  },
}));

vi.mock('../src/alerts/persistence', () => persistenceMocks);

vi.mock('../src/alerts/delivery', async () => {
  // Only `deliverAlert` is replaced: the budget helpers under test live in the
  // same barrel and must stay real.
  const budget = await vi.importActual<typeof import('../src/alerts/delivery/budget')>(
    '../src/alerts/delivery/budget',
  );
  return { ...budget, deliverAlert: deliveryMocks.deliverAlert };
});

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeAlert(id: string, userId: string): Alert {
  return {
    id,
    userId,
    rule: { type: 'priceCross', symbol: 'XAUUSD', direction: 'above', level: 2_000 },
    channels: ['email'],
    note: null,
    active: true,
    firedAt: null,
    lastFiredAt: null,
    snoozeHours: 0,
    createdAt: Date.now(),
  } as Alert;
}

function freshPrice(symbol: string): PriceResult {
  const tick = {
    symbol,
    bid: 2_390,
    ask: 2_390,
    mid: 2_390,
    ts: Date.now(),
    source: 'test',
  } as Tick;
  return { tick, stale: false, producedAt: Date.now(), ageMs: 100 };
}

const ok = (alertId: string) => ({ alertId, channel: 'email', ok: true });

describe('evaluateAlerts — R10 bounded and rotated fan-out', () => {
  beforeEach(() => {
    vi.mocked(getPrice).mockImplementation(async (symbol) => freshPrice(symbol));
    persistenceMocks.listEvaluable.mockReset();
    persistenceMocks.claimAlertDelivery.mockReset();
    persistenceMocks.claimAlertDelivery.mockResolvedValue(true);
    persistenceMocks.releaseAlertDeliveryClaim.mockReset();
    persistenceMocks.releaseAlertDeliveryClaim.mockResolvedValue(undefined);
    persistenceMocks.setRulePreviousValue.mockReset();
    deliveryMocks.deliverAlert.mockReset();
  });

  afterEach(() => {
    vi.mocked(getPrice).mockReset();
  });

  it('asks the persistence layer for a bounded, rotated batch', async () => {
    persistenceMocks.listEvaluable.mockResolvedValue([]);

    await evaluateAlerts({ limit: 25, rotationSeed: 42 });

    expect(persistenceMocks.listEvaluable).toHaveBeenCalledWith({ limit: 25, rotationSeed: 42 });
  });

  it('serves users round-robin so one user storm cannot starve another', async () => {
    const alerts = [
      makeAlert('a1', USER_A),
      makeAlert('a2', USER_A),
      makeAlert('a3', USER_A),
      makeAlert('b1', USER_B),
      makeAlert('b2', USER_B),
    ];
    persistenceMocks.listEvaluable.mockResolvedValue(alerts);

    const delivered: string[] = [];
    deliveryMocks.deliverAlert.mockImplementation(async ({ alert }: { alert: Alert }) => {
      delivered.push(alert.id);
      return ok(alert.id);
    });

    const result = await evaluateAlerts();

    expect(result.total).toBe(5);
    expect(result.fired).toBe(5);
    // A's three alerts arrive before B's in the list; the rotation interleaves
    // them so B's first alert is delivered before A's second.
    expect(delivered).toEqual(['a1', 'b1', 'a2', 'b2', 'a3']);
  });

  it('abandons a hung provider, releases its claim, and keeps going', async () => {
    persistenceMocks.listEvaluable.mockResolvedValue([
      makeAlert('hung', USER_A),
      makeAlert('ok', USER_B),
    ]);
    deliveryMocks.deliverAlert.mockImplementation(async ({ alert }: { alert: Alert }) => {
      if (alert.id === 'hung') return new Promise(() => undefined);
      return ok(alert.id);
    });

    const result = await evaluateAlerts({ alertDeliveryBudgetMs: 25 });

    // The hung alert did not block the run: the second alert was delivered.
    expect(result.fired).toBe(1);
    expect(result.stopReason).toBe('complete');
    const abandoned = result.deliveries.find((d) => d.abandoned === true);
    expect(abandoned).toMatchObject({ alertId: 'hung', ok: false });
    expect(abandoned?.message).toContain('25ms');
    // Its claim went back to the queue: the next tick retries it.
    expect(persistenceMocks.releaseAlertDeliveryClaim).toHaveBeenCalledWith(
      USER_A,
      'hung',
      expect.any(Date),
    );
    expect(result.claimsReleased).toBe(0);
  });

  it('stops at the run budget and reports the work it did not reach', async () => {
    persistenceMocks.listEvaluable.mockResolvedValue([
      makeAlert('slow', USER_A),
      makeAlert('never', USER_B),
    ]);
    deliveryMocks.deliverAlert.mockImplementation(async ({ alert }: { alert: Alert }) => {
      if (alert.id === 'slow') return new Promise(() => undefined);
      return ok(alert.id);
    });

    const result = await evaluateAlerts({ budgetMs: 40, alertDeliveryBudgetMs: 5_000 });

    expect(result.stopReason).toBe('budget');
    expect(result.fired).toBe(0);
    // The abandoned attempt's claim was released even though the run stopped.
    expect(persistenceMocks.releaseAlertDeliveryClaim).toHaveBeenCalledWith(
      USER_A,
      'slow',
      expect.any(Date),
    );
    expect(deliveryMocks.deliverAlert).toHaveBeenCalledTimes(1);
  });

  it('retries a failed claim release when the run ends instead of leaving it held', async () => {
    persistenceMocks.listEvaluable.mockResolvedValue([makeAlert('one', USER_A)]);
    deliveryMocks.deliverAlert.mockResolvedValue({
      alertId: 'one',
      channel: 'email',
      ok: false,
      message: 'resend HTTP 500',
    });
    persistenceMocks.releaseAlertDeliveryClaim
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValue(undefined);

    const result = await evaluateAlerts();

    expect(result.fired).toBe(0);
    // First attempt inside the loop failed, the run-end sweep retried it.
    expect(persistenceMocks.releaseAlertDeliveryClaim).toHaveBeenCalledTimes(2);
    expect(result.claimsReleased).toBe(1);
  });

  it('honours the job abort signal and releases anything it holds', async () => {
    persistenceMocks.listEvaluable.mockResolvedValue([makeAlert('a', USER_A)]);
    deliveryMocks.deliverAlert.mockResolvedValue(ok('a'));
    const controller = new AbortController();
    controller.abort(new Error('job timed out'));

    const result = await evaluateAlerts({ signal: controller.signal });

    expect(result.stopReason).toBe('aborted');
    expect(deliveryMocks.deliverAlert).not.toHaveBeenCalled();
    expect(result.fired).toBe(0);
  });

  it('keeps the noise gate authoritative: a suppressed delivery is not counted as fired', async () => {
    persistenceMocks.listEvaluable.mockResolvedValue([makeAlert('noisy', USER_A)]);
    deliveryMocks.deliverAlert.mockResolvedValue({
      alertId: 'noisy',
      channel: 'noise-control',
      ok: false,
      message: 'noise: duplicate',
    });

    const result = await evaluateAlerts();

    expect(result.fired).toBe(0);
    expect(result.matched).toBe(1);
    expect(persistenceMocks.releaseAlertDeliveryClaim).toHaveBeenCalledTimes(1);
  });
});

describe('alert fan-out helpers', () => {
  it('rotates the evaluation seed once per window', () => {
    // Aligned to a window boundary: every tick inside the window sees the same
    // ordering, the next window re-hashes the whole active set.
    expect(evaluationRotationSeed(60_000)).toBe(evaluationRotationSeed(119_999));
    expect(evaluationRotationSeed(120_000)).not.toBe(evaluationRotationSeed(119_999));
  });

  it('orders alerts by a stable hash of (id, seed)', () => {
    // The SQL in `listEvaluable` uses md5(id::text || ':' || seed); this pins
    // the JavaScript mirror used to reason about (and test) the rotation.
    const id = '00000000-0000-4000-8000-000000000001';
    expect(alertRotationKey(id, 7)).toBe(createHash('md5').update(`${id}:7`).digest('hex'));
    expect(alertRotationKey('a', 7)).not.toBe(alertRotationKey('a', 8));
  });
});
