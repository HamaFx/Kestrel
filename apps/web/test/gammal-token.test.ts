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

import { createSign, generateKeyPairSync } from 'node:crypto';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  buildGammalPaymentLink,
  extractGammalOrderRef,
  gammalAmountToCents,
  passDaysForPlanInterval,
  verifyGammalToken,
  type GammalClaims,
} from '@/lib/gammal';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    BILLING_ENABLED: true,
    BILLING_GAMMAL_ENABLED: true,
    GAMMAL_PROJECT_ID: 47,
    GAMMAL_API_BASE: 'https://api.gammal.tech',
    GAMMAL_CURRENCY: 'USD',
    GAMMAL_PASS_DAYS: 30,
  }),
}));

let publicKeyPem: string;
let privateKeyPem: string;

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signClaims(claims: Partial<GammalClaims> & Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      type: 'payment',
      txn: 'GT-TXN-test',
      amount: 29,
      currency: 'USD',
      description: 'Kestrel Pro pass 7f3a2c91-d4e8-4b61-8a2c-0123456789ab',
      project_id: 47,
      exp: Math.floor(Date.now() / 1000) + 300,
      ...claims,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKeyPem).toString('base64url')}`;
}

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
});

describe('Gammal token verification', () => {
  it('accepts a correctly signed payment token', async () => {
    const token = signClaims({});
    const claims = await verifyGammalToken(token, { publicKeyPem });
    expect(claims.type).toBe('payment');
    expect(claims.txn).toBe('GT-TXN-test');
    expect(claims.amount).toBe(29);
    expect(claims.project_id).toBe(47);
  });

  it('rejects a tampered payload', async () => {
    const token = signClaims({});
    const [header, , signature] = token.split('.');
    const tampered = base64url(
      JSON.stringify({
        type: 'payment',
        txn: 'GT-TXN-test',
        amount: 2900,
        currency: 'USD',
        description: 'tampered',
        project_id: 47,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    );
    await expect(
      verifyGammalToken(`${header}.${tampered}.${signature}`, { publicKeyPem }),
    ).rejects.toThrow(/signature/i);
  });

  it('rejects an expired token', async () => {
    const token = signClaims({ exp: Math.floor(Date.now() / 1000) - 3600 });
    await expect(verifyGammalToken(token, { publicKeyPem })).rejects.toThrow(/expired/i);
  });

  it('rejects a refund token without an event', async () => {
    const token = signClaims({ type: 'refund', sale_txn: 'GT-TXN-sale' });
    await expect(verifyGammalToken(token, { publicKeyPem })).rejects.toThrow(/event/i);
  });

  it('accepts a refund notice with its sale transaction', async () => {
    const token = signClaims({
      type: 'refund',
      txn: 'GT-RFD-test',
      event: 'payment.refunded',
      sale_txn: 'GT-TXN-sale',
      refunded: 29,
      ratio: 1,
      full: true,
    });
    const claims = await verifyGammalToken(token, { publicKeyPem });
    expect(claims.type).toBe('refund');
    expect(claims.event).toBe('payment.refunded');
    expect(claims.sale_txn).toBe('GT-TXN-sale');
  });

  it('rejects an unsupported algorithm', async () => {
    const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ type: 'payment' }));
    await expect(verifyGammalToken(`${header}.${payload}.x`, { publicKeyPem })).rejects.toThrow(
      /algorithm/i,
    );
  });
});

describe('Gammal link helpers', () => {
  it('builds an encoded hosted payment link', () => {
    const link = buildGammalPaymentLink({
      projectId: 47,
      amountCents: 2900,
      currency: 'USD',
      description: 'Kestrel Pro pass 7f3a2c91-d4e8-4b61-8a2c-0123456789ab',
      callbackUrl:
        'https://kestrel.example/settings/billing/gammal/return?payment=7f3a2c91-d4e8-4b61-8a2c-0123456789ab',
    });
    const url = new URL(link);
    expect(url.origin).toBe('https://api.gammal.tech');
    expect(url.pathname).toBe('/sdk/pay/link/');
    expect(url.searchParams.get('pid')).toBe('47');
    expect(url.searchParams.get('amount')).toBe('29.00');
    expect(url.searchParams.get('currency')).toBe('USD');
    expect(url.searchParams.get('callback')).toContain('payment=');
    expect(url.searchParams.get('recurrence')).toBeNull();
  });

  it('extracts the local order ref from a description', () => {
    expect(extractGammalOrderRef('Kestrel Pro pass 7f3a2c91-d4e8-4b61-8a2c-0123456789ab')).toBe(
      '7f3a2c91-d4e8-4b61-8a2c-0123456789ab',
    );
    expect(extractGammalOrderRef('no ref here')).toBeNull();
  });

  it('maps plan intervals to pass days', () => {
    expect(passDaysForPlanInterval('monthly')).toBe(30);
    expect(passDaysForPlanInterval('quarterly')).toBe(90);
    expect(passDaysForPlanInterval('yearly')).toBe(365);
    expect(passDaysForPlanInterval('unknown', 7)).toBe(7);
  });

  it('converts amounts to cents', () => {
    expect(gammalAmountToCents(29)).toBe(2900);
    expect(gammalAmountToCents(29.99)).toBe(2999);
  });
});
