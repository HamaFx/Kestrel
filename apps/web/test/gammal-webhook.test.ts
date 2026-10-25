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
  verifyGammalToken: vi.fn(),
  getGammalProjectId: vi.fn(),
  processGammalClaims: vi.fn(),
  claimBillingEvent: vi.fn(),
  markBillingEventProcessed: vi.fn(),
  markBillingEventFailed: vi.fn(),
  recordBillingWebhookFailure: vi.fn(),
  verifyStripeWebhook: vi.fn(),
  verifyIpnSignature: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock('@/lib/logger', () => ({
  createScopedLoggerWithContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/gammal', () => ({
  verifyGammalToken: mocks.verifyGammalToken,
  getGammalProjectId: mocks.getGammalProjectId,
}));
vi.mock('@/lib/services/gammal-billing', () => ({
  processGammalClaims: mocks.processGammalClaims,
}));
vi.mock('@/lib/stripe', () => ({ verifyStripeWebhook: mocks.verifyStripeWebhook }));
vi.mock('@/lib/services/stripe-billing', () => ({ processStripeEvent: vi.fn() }));
vi.mock('@/lib/nowpayments', () => ({ verifyIpnSignature: mocks.verifyIpnSignature }));
vi.mock('@/lib/services/api-boundary', () => ({
  metrics: { increment: vi.fn() },
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

const CLAIMS = {
  type: 'payment' as const,
  txn: 'GT-TXN-test',
  amount: 29,
  currency: 'USD',
  description: 'Kestrel Pro pass 7f3a2c91-d4e8-4b61-8a2c-0123456789ab',
  project_id: 47,
  exp: Math.floor(Date.now() / 1000) + 300,
};

function request(): Request {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    body: JSON.stringify({ event: 'payment.success', payment_token: 'token' }),
    headers: { 'x-gammal-event': 'payment.success' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerEnv.mockReturnValue({
    BILLING_ENABLED: true,
    BILLING_GAMMAL_ENABLED: true,
    GAMMAL_PROJECT_ID: 47,
    BILLING_STRIPE_ENABLED: false,
    NOWPAYMENTS_IPN_SECRET: '',
  });
  mocks.verifyGammalToken.mockResolvedValue(CLAIMS);
  mocks.getGammalProjectId.mockReturnValue(47);
  mocks.processGammalClaims.mockResolvedValue('processed');
  mocks.claimBillingEvent.mockResolvedValue({ kind: 'claimed', id: 'be-gammal' });
  mocks.markBillingEventProcessed.mockResolvedValue(undefined);
  mocks.markBillingEventFailed.mockResolvedValue(undefined);
  mocks.recordBillingWebhookFailure.mockResolvedValue(undefined);
});

describe('Gammal webhook dispatch', () => {
  it('returns 404 when Gammal billing is disabled', async () => {
    mocks.getServerEnv.mockReturnValue({
      BILLING_ENABLED: true,
      BILLING_GAMMAL_ENABLED: false,
    });
    const response = await webhook(request());
    expect(response.status).toBe(404);
    expect(mocks.claimBillingEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid token before claiming the event', async () => {
    mocks.verifyGammalToken.mockRejectedValue(new Error('bad signature'));
    const response = await webhook(request());
    expect(response.status).toBe(401);
    expect(mocks.claimBillingEvent).not.toHaveBeenCalled();
  });

  it('processes once and marks the event processed', async () => {
    const response = await webhook(request());
    expect(response.status).toBe(200);
    expect(mocks.claimBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gammal', eventId: CLAIMS.txn }),
    );
    expect(mocks.processGammalClaims).toHaveBeenCalledWith(CLAIMS);
    expect(mocks.markBillingEventProcessed).toHaveBeenCalledWith('be-gammal');
  });

  it('persists a DLQ row and returns 200 after processing failure', async () => {
    mocks.processGammalClaims.mockRejectedValue(new Error('activation failed'));
    const response = await webhook(request());
    expect(response.status).toBe(200);
    expect(mocks.markBillingEventFailed).toHaveBeenCalledWith('be-gammal', 'activation failed');
    expect(mocks.recordBillingWebhookFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gammal',
        eventId: CLAIMS.txn,
        error: 'activation failed',
      }),
    );
  });
});
