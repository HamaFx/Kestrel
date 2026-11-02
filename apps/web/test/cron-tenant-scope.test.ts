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

// Audit 2026-10-31 (R1): `withCronAuth` opens no database scope, so each
// cron route must pick one explicitly — admin (BYPASSRLS) for system-wide
// work, `withUserTenant` for per-user work. These tests pin that contract so
// a future edit cannot quietly drop a route back to an unscoped (silently
// empty) query.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as alertsGET } from '@/app/api/cron/alerts/route';
import { GET as briefingsGET } from '@/app/api/cron/briefings/route';
import { GET as cleanupTelemetryGET } from '@/app/api/cron/cleanup-telemetry/route';
import { GET as weeklyReviewGET } from '@/app/api/cron/weekly-review/route';

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  withCronAuth: vi.fn(),
  withAdminDb: vi.fn(),
  withUserTenant: vi.fn(),
  getActiveUserIdsForCron: vi.fn(),
  evaluateAlerts: vi.fn(),
  runRetentionCleanup: vi.fn(),
  findHighImpactEventsInWindow: vi.fn(),
  listEmittedEventIds: vi.fn(),
  emitPreEvent: vi.fn(),
  emitPostEvent: vi.fn(),
  emitWeeklyReview: vi.fn(),
}));

vi.mock('@/lib/http/cron', () => ({
  withCronAuth: mocks.withCronAuth,
  getActiveUserIdsForCron: mocks.getActiveUserIdsForCron,
}));
vi.mock('@/lib/services/alerts', () => ({
  evaluateAlerts: mocks.evaluateAlerts,
  emitPostEvent: mocks.emitPostEvent,
  emitPreEvent: mocks.emitPreEvent,
  emitWeeklyReview: mocks.emitWeeklyReview,
  findHighImpactEventsInWindow: mocks.findHighImpactEventsInWindow,
  listEmittedEventIds: mocks.listEmittedEventIds,
}));
vi.mock('@/lib/services/admin', () => ({
  runRetentionCleanup: mocks.runRetentionCleanup,
}));
vi.mock('@/lib/services/db', () => ({
  withAdminDb: mocks.withAdminDb,
  withUserTenant: mocks.withUserTenant,
}));
vi.mock('@/lib/logger', () => ({
  createScopedLoggerWithContext: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    errorContext: vi.fn(),
  }),
}));

function request(path: string): Request {
  return new Request(`http://localhost${path}`);
}

afterEach(() => {
  delete process.env['WORKER_PARTITION'];
  delete process.env['WORKER_PARTITIONS_TOTAL'];
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.withCronAuth.mockImplementation(
    async (_req: Request, fn: (ctx: unknown) => Promise<unknown>) => {
      const result = await fn({ via: 'bearer', userId: null });
      return Response.json({ ok: true, ...(result as object) });
    },
  );
  mocks.withAdminDb.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => {
    mocks.events.push('admin:enter');
    const result = await work({});
    mocks.events.push('admin:exit');
    return result;
  });
  mocks.withUserTenant.mockImplementation(
    async (userId: string, work: (db: unknown) => Promise<unknown>) => {
      mocks.events.push(`tenant:enter:${userId}`);
      const result = await work({});
      mocks.events.push(`tenant:exit:${userId}`);
      return result;
    },
  );
});

describe('cron routes select an explicit database scope (R1)', () => {
  it('alerts evaluates every tenant inside withAdminDb', async () => {
    mocks.evaluateAlerts.mockImplementation(async () => {
      mocks.events.push('evaluate');
      return { total: 0, matched: 0, fired: 0, skipped: 0, errors: [], deliveries: [] };
    });

    const response = await alertsGET(request('/api/cron/alerts'));

    expect(response.status).toBe(200);
    expect(mocks.withAdminDb).toHaveBeenCalledTimes(1);
    expect(mocks.events).toEqual(['admin:enter', 'evaluate', 'admin:exit']);
  });

  it('alerts filters users through the worker partition (R16)', async () => {
    process.env['WORKER_PARTITION'] = '1';
    process.env['WORKER_PARTITIONS_TOTAL'] = '2';
    mocks.evaluateAlerts.mockImplementation(
      async (opts: { ownsTenant?: (userId: string) => boolean }) => {
        // md5 bucket fixtures shared with apps/worker/test/tenant-router.test.ts.
        expect(opts.ownsTenant?.('user-1')).toBe(true); // mod 2 = 1
        expect(opts.ownsTenant?.('user-2')).toBe(false); // mod 2 = 0
        mocks.events.push('evaluate');
        return { total: 0, matched: 0, fired: 0, skipped: 0, errors: [], deliveries: [] };
      },
    );

    const response = await alertsGET(request('/api/cron/alerts'));

    expect(response.status).toBe(200);
    expect(mocks.events).toEqual(['admin:enter', 'evaluate', 'admin:exit']);
  });

  it('alerts fails closed on an invalid partition pair (R16)', async () => {
    process.env['WORKER_PARTITION'] = '2';
    process.env['WORKER_PARTITIONS_TOTAL'] = '2';

    await expect(alertsGET(request('/api/cron/alerts'))).rejects.toThrow(
      /WORKER_PARTITION \(2\) must be < WORKER_PARTITIONS_TOTAL \(2\)/,
    );
    expect(mocks.evaluateAlerts).not.toHaveBeenCalled();
  });

  it('cleanup-telemetry deletes retention rows inside withAdminDb', async () => {
    mocks.runRetentionCleanup.mockImplementation(async () => {
      mocks.events.push('retention');
      return {
        telemetryDeleted: 0,
        toolTelemetryDeleted: 0,
        tracesDeleted: 0,
        rateLimitsDeleted: 0,
        providerDailyQuotaDeleted: 0,
        cronRunsDeleted: 0,
        outboxDeleted: 0,
        fullAnalysisQueueDeleted: 0,
        budgetReservationsDeleted: 0,
        sharedSnapshotsDeleted: 0,
        notificationNoiseStateDeleted: 0,
        mastraObservationalMemoryDeleted: 0,
        note: 'clean',
      };
    });

    const response = await cleanupTelemetryGET(request('/api/cron/cleanup-telemetry'));

    expect(response.status).toBe(200);
    expect(mocks.events).toEqual(['admin:enter', 'retention', 'admin:exit']);
  });

  it('briefings discovers users via admin and scopes each user’s emits', async () => {
    mocks.getActiveUserIdsForCron.mockResolvedValue(['user-1']);
    mocks.findHighImpactEventsInWindow.mockResolvedValue([{ id: 'ev-1' }]);
    mocks.listEmittedEventIds.mockResolvedValue(new Set());
    mocks.emitPreEvent.mockResolvedValue({ emitted: true });
    mocks.emitPostEvent.mockResolvedValue({ emitted: true });

    const response = await briefingsGET(request('/api/cron/briefings'));

    expect(response.status).toBe(200);
    expect(mocks.getActiveUserIdsForCron).toHaveBeenCalledTimes(1);
    expect(mocks.withUserTenant).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.events).toEqual(['tenant:enter:user-1', 'tenant:exit:user-1']);
    // Phase 3 Task 2 — the idempotency prefetch runs inside the tenant scope
    // (parity with the worker job), then emits only the remaining pairs.
    expect(mocks.listEmittedEventIds).toHaveBeenCalledWith('user-1', ['ev-1'], 'pre');
    expect(mocks.listEmittedEventIds).toHaveBeenCalledWith('user-1', ['ev-1'], 'post');
    expect(mocks.emitPreEvent).toHaveBeenCalledWith('user-1', 'ev-1');
    expect(mocks.emitPostEvent).toHaveBeenCalledWith('user-1', 'ev-1');
  });

  it('briefings skips events already emitted for the user', async () => {
    mocks.getActiveUserIdsForCron.mockResolvedValue(['user-1']);
    mocks.findHighImpactEventsInWindow.mockResolvedValue([{ id: 'ev-1' }]);
    mocks.listEmittedEventIds.mockResolvedValue(new Set(['ev-1']));

    const response = await briefingsGET(request('/api/cron/briefings'));

    expect(response.status).toBe(200);
    expect(mocks.emitPreEvent).not.toHaveBeenCalled();
    expect(mocks.emitPostEvent).not.toHaveBeenCalled();
  });

  it('weekly-review discovers users via admin and scopes each user’s review', async () => {
    mocks.getActiveUserIdsForCron.mockResolvedValue(['user-1']);
    mocks.emitWeeklyReview.mockResolvedValue({ emitted: true });

    const response = await weeklyReviewGET(request('/api/cron/weekly-review'));

    expect(response.status).toBe(200);
    expect(mocks.withUserTenant).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.events).toEqual(['tenant:enter:user-1', 'tenant:exit:user-1']);
    expect(mocks.emitWeeklyReview).toHaveBeenCalledWith('user-1');
  });
});
