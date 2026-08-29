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

import { GET } from '@/app/api/cron/billing-dlq/route';

const mockWithCronAuth = vi.hoisted(() => vi.fn());
const mockCountStaleBillingWebhookFailures = vi.hoisted(() => vi.fn());
const mockCaptureMessage = vi.hoisted(() => vi.fn());

vi.mock('@/lib/cron', () => ({ withCronAuth: mockWithCronAuth }));
vi.mock('@/lib/services/api-boundary', () => ({
  countStaleBillingWebhookFailures: mockCountStaleBillingWebhookFailures,
}));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mockCaptureMessage }));

describe('GET /api/cron/billing-dlq', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountStaleBillingWebhookFailures.mockResolvedValue(0);
    mockWithCronAuth.mockImplementation(async (_request: Request, fn: () => Promise<unknown>) => {
      const result = await fn();
      return Response.json({ ok: true, ...result });
    });
  });

  it('alerts when pending failures or replay leases are stale', async () => {
    mockCountStaleBillingWebhookFailures.mockResolvedValueOnce(2);

    const response = await GET(new Request('http://localhost/api/cron/billing-dlq'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      processed: 2,
      note: '2 pending or replaying billing webhook failure(s) older than one hour',
    });
    expect(mockCountStaleBillingWebhookFailures).toHaveBeenCalledWith(expect.any(Date));
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Billing webhook DLQ has stale entries',
      expect.objectContaining({
        level: 'error',
        tags: { component: 'billing-webhook', kind: 'dlq-stale' },
        extra: expect.objectContaining({ pendingOlderThanHour: 2 }),
      }),
    );
  });

  it('does not alert when all DLQ work is fresh or already replayed', async () => {
    const response = await GET(new Request('http://localhost/api/cron/billing-dlq'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, processed: 0, note: 'No stale billing webhook failures' });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
