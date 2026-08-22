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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cron/health-alerts/route';

const mockWithCronAuth = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn());
const mockComputeHealth = vi.hoisted(() => vi.fn());
const mockDeliverHealthAlert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/cron', () => ({ withCronAuth: mockWithCronAuth }));
vi.mock('@/lib/services/api-boundary', () => ({ getDb: mockGetDb }));
vi.mock('@/lib/services/admin-health', () => ({ computeHealthSloService: mockComputeHealth }));
vi.mock('@/lib/services/health-alert-delivery', () => ({
  deliverHealthAlert: mockDeliverHealthAlert,
}));

const snapshot = {
  ts: '2026-08-16T00:00:00.000Z',
  dbLatencyMs: 5,
  dbOk: true,
  overall: 'degraded' as const,
  langfuseActive: false,
  langfuseBaseUrl: null,
  anomalies: ['No chat turns in the selected window'],
  slis: [],
};

describe('GET /api/cron/health-alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({});
    mockComputeHealth.mockResolvedValue(snapshot);
    mockDeliverHealthAlert.mockResolvedValue({ status: 'sent', anomalyCount: 1 });
    mockWithCronAuth.mockImplementation(async (_request: Request, fn: () => Promise<unknown>) => {
      const result = await fn();
      return Response.json({ ok: true, ...result });
    });
  });

  it('computes the snapshot and reports webhook delivery', async () => {
    const response = await GET(new Request('http://localhost/api/cron/health-alerts'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      processed: 1,
      note: 'degraded; webhook=sent',
    });
    expect(mockComputeHealth).toHaveBeenCalledWith({}, { hours: 1 });
    expect(mockDeliverHealthAlert).toHaveBeenCalledWith(snapshot);
  });

  it('keeps the cron response successful when delivery is not configured', async () => {
    mockDeliverHealthAlert.mockResolvedValue({ status: 'skipped', reason: 'not_configured' });

    const response = await GET(new Request('http://localhost/api/cron/health-alerts'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.note).toBe('degraded; webhook=skipped:not_configured');
  });
});
