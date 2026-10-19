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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as webhook } from '@/app/api/billing/webhook/route';

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  verifyStripeWebhook: vi.fn(),
  processStripeEvent: vi.fn(),
  claimBillingEvent: vi.fn(),
  markBillingEventProcessed: vi.fn(),
  markBillingEventFailed: vi.fn(),
  recordBillingWebhookFailure: vi.fn(),
  verifyIpnSignature: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock('@/lib/logger', () => ({
  createScopedLoggerWithContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/stripe', () => ({ verifyStripeWebhook: mocks.verifyStripeWebhook }));
vi.mock('@/lib/services/stripe-billing', () => ({
  processStripeEvent: mocks.processStripeEvent,
}));
vi.mock('@/lib/nowpayments', () => ({ verifyIpnSignature: mocks.verifyIpnSignature }));
vi.mock('@kestrel/db', () => ({
  schema: {},
  claimBillingEvent: mocks.claimBillingEvent,
  markBillingEventProcessed: mocks.markBillingEventProcessed,
  markBillingEventFailed: mocks.markBillingEventFailed,
  recordBillingWebhookFailure: mocks.recordBillingWebhookFailure,
  claimIpnEvent: vi.fn(),
  getPaymentByNowpaymentsId: vi.fn(),
  markIpnFailed: vi.fn(),
  markIpnProcessed: vi.fn(),
  updatePaymentStatus: vi.fn(),
  updateSubscriptionFromPayment: vi.fn(),
  getTopupProduct: vi.fn(),
  addCredits: vi.fn(),
  ensureMonthlyGrant: vi.fn(),
  getBillingUserIdForTenant: vi.fn(),
  requireTenantIdForUser: vi.fn(async () => 'tenant-1'),
  withTenantDbFresh: vi.fn(async (_tenantId: string, work: (db: unknown) => Promise<unknown>) =>
    work({}),
  ),
}));

const EVENT = {
  id: 'evt_test_1',
  type: 'invoice.paid',
  data: { object: { id: 'in_test_1' } },
};

function request(): Request {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    body: JSON.stringify(EVENT),
    headers: { 'stripe-signature': 't=1,v1=abc' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerEnv.mockReturnValue({
    BILLING_ENABLED: true,
    BILLING_STRIPE_ENABLED: true,
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
  });
  mocks.verifyStripeWebhook.mockReturnValue(EVENT);
  mocks.claimBillingEvent.mockResolvedValue({ kind: 'claimed', id: 'be-1' });
  mocks.processStripeEvent.mockResolvedValue(undefined);
  mocks.markBillingEventProcessed.mockResolvedValue(undefined);
  mocks.markBillingEventFailed.mockResolvedValue(undefined);
  mocks.recordBillingWebhookFailure.mockResolvedValue(undefined);
});

describe('Stripe webhook dispatch', () => {
  it('rejects an invalid signature before claiming the event', async () => {
    mocks.verifyStripeWebhook.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const response = await webhook(request());
    expect(response.status).toBe(401);
    expect(mocks.claimBillingEvent).not.toHaveBeenCalled();
  });

  it('acknowledges a replayed event without processing it', async () => {
    mocks.claimBillingEvent.mockResolvedValue({ kind: 'processed' });
    const response = await webhook(request());
    expect(response.status).toBe(200);
    expect(mocks.processStripeEvent).not.toHaveBeenCalled();
  });

  it('processes once and marks the event processed', async () => {
    const response = await webhook(request());
    expect(response.status).toBe(200);
    expect(mocks.processStripeEvent).toHaveBeenCalledWith(EVENT);
    expect(mocks.markBillingEventProcessed).toHaveBeenCalledWith('be-1');
  });

  it('persists a DLQ row and returns 200 after authenticated processing failure', async () => {
    mocks.processStripeEvent.mockRejectedValue(new Error('grant failed'));
    const response = await webhook(request());
    expect(response.status).toBe(200);
    expect(mocks.markBillingEventFailed).toHaveBeenCalledWith('be-1', 'grant failed');
    expect(mocks.recordBillingWebhookFailure).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'stripe', eventId: EVENT.id, error: 'grant failed' }),
    );
  });
});
