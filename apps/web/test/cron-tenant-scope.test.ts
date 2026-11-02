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
  withUserTenant: vi.fn(),
  evaluateAlerts: vi.fn(),
  runRetentionCleanup: vi.fn(),
  runBriefingsFanout: vi.fn(),
  runWeeklyReviewFanout: vi.fn(),
}));

vi.mock('@/lib/http/cron', () => ({
  withCronAuth: mocks.withCronAuth,
}));
vi.mock('@/lib/services/alerts', () => ({
  evaluateAlertsAcrossTenants: mocks.evaluateAlerts,
}));
vi.mock('@/lib/services/cron-jobs', () => ({
  runBriefingsFanout: mocks.runBriefingsFanout,
  runWeeklyReviewFanout: mocks.runWeeklyReviewFanout,
}));
vi.mock('@/lib/services/admin', () => ({
  runRetentionCleanupAcrossTenants: mocks.runRetentionCleanup,
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
  mocks.withUserTenant.mockImplementation(
    async (userId: string, work: (db: unknown) => Promise<unknown>) => {
      mocks.events.push(`tenant:enter:${userId}`);
      const result = await work({});
      mocks.events.push(`tenant:exit:${userId}`);
      return result;
    },
  );
});

describe('cron routes delegate cross-tenant work to admin-scoped services (R1)', () => {
  it('alerts delegates cross-tenant evaluation to the admin-scoped service', async () => {
    mocks.evaluateAlerts.mockImplementation(async () => {
      mocks.events.push('evaluate');
      return { total: 0, matched: 0, fired: 0, skipped: 0, errors: [], deliveries: [] };
    });

    const response = await alertsGET(request('/api/cron/alerts'));

    expect(response.status).toBe(200);
    expect(mocks.evaluateAlerts).toHaveBeenCalledTimes(1);
    expect(mocks.events).toEqual(['evaluate']);
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
    expect(mocks.events).toEqual(['evaluate']);
  });

  it('alerts fails closed on an invalid partition pair (R16)', async () => {
    process.env['WORKER_PARTITION'] = '2';
    process.env['WORKER_PARTITIONS_TOTAL'] = '2';

    await expect(alertsGET(request('/api/cron/alerts'))).rejects.toThrow(
      /WORKER_PARTITION \(2\) must be < WORKER_PARTITIONS_TOTAL \(2\)/,
    );
    expect(mocks.evaluateAlerts).not.toHaveBeenCalled();
  });

  it('cleanup-telemetry delegates retention deletion to the admin-scoped service', async () => {
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
    expect(mocks.runRetentionCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.events).toEqual(['retention']);
  });

  it('briefings delegates the fan-out to the shared cron runner', async () => {
    mocks.runBriefingsFanout.mockResolvedValue({
      processed: 2,
      preCandidates: 1,
      preEmitted: 1,
      postCandidates: 1,
      postEmitted: 1,
      note: 'pre=1/1, post=1/1',
    });

    const response = await briefingsGET(request('/api/cron/briefings'));

    expect(response.status).toBe(200);
    expect(mocks.runBriefingsFanout).toHaveBeenCalledWith({
      log: expect.objectContaining({ info: expect.any(Function) }),
    });
    expect(await response.json()).toMatchObject({
      processed: 2,
      note: 'pre=1/1, post=1/1',
    });
  });

  it('weekly-review delegates the fan-out and maps per-user reasons to the note', async () => {
    mocks.runWeeklyReviewFanout.mockResolvedValue({
      processed: 1,
      reasons: ['[user-1]: already-emitted'],
    });

    const response = await weeklyReviewGET(request('/api/cron/weekly-review'));

    expect(response.status).toBe(200);
    expect(mocks.runWeeklyReviewFanout).toHaveBeenCalledWith({
      log: expect.objectContaining({ info: expect.any(Function) }),
    });
    expect(await response.json()).toMatchObject({
      processed: 1,
      note: '[user-1]: already-emitted',
    });
  });
});
