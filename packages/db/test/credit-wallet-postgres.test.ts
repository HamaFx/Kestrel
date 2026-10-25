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

// Opt-in Postgres integration test for the credit engine.
//
//   RUN_CREDIT_POSTGRES_TESTS=1 TEST_POSTGRES_ADMIN_URL=postgres://… \
//     pnpm --filter @kestrel/db test
//
// Proves the plan §17 concurrency/idempotency invariants against a real
// Postgres: exactly floor(balance / estimate) reservations succeed, the
// wallet never goes negative, and a replayed grant writes one ledger row.

import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type * as CreditModuleTypes from '../src/index';

const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL ?? process.env.DATABASE_URL;
const enabled = process.env.RUN_CREDIT_POSTGRES_TESTS === '1' && Boolean(adminUrl);

const userId = `credit-test-${randomUUID()}`;
const tenantId = userId;
const admin = enabled ? postgres(adminUrl!, { max: 2, prepare: false }) : null;

type CreditModule = typeof CreditModuleTypes;
let credit: CreditModule;

describe.skipIf(!enabled)('credit engine — Postgres concurrency', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = adminUrl;
    process.env.KESTREL_ENABLE_RLS = 'true';
    process.env.MULTI_USER_ENABLED = 'false';
    await admin!`INSERT INTO "user" (id, email) VALUES (${userId}, ${`${userId}@example.test`})`;
    credit = await import('../src/index');
    await credit.withTenantDbFresh(tenantId, () => credit.ensureWallet(userId, { tenantId }));
  });

  afterAll(async () => {
    if (admin) {
      await admin`DELETE FROM credit_ledger WHERE user_id = ${userId}`;
      await admin`DELETE FROM credit_reservations WHERE user_id = ${userId}`;
      await admin`DELETE FROM credit_wallets WHERE user_id = ${userId}`;
      await admin`DELETE FROM organization WHERE id = ${tenantId}`;
      await admin`DELETE FROM "user" WHERE id = ${userId}`;
      await admin.end({ timeout: 5 });
    }
  });

  it('20 concurrent reservations against 100 credits admit exactly 10', async () => {
    const grant = await credit.addCredits({
      userId,
      tenantId,
      amountCredits: 100,
      kind: 'admin_adjustment',
      idempotencyKey: `test-grant:${userId}`,
    });
    expect(grant.balanceAfter).toBe(100);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        credit.reserveCredits({
          userId,
          tenantId,
          estimateCredits: 10,
          idempotencyKey: `test-reserve:${userId}:${index}`,
        }),
      ),
    );
    const admitted = results.filter((result) => result.ok);
    expect(admitted).toHaveLength(10);

    const wallet = await credit.getWallet(userId, { tenantId });
    expect(wallet?.availableCredits).toBe(0);
    expect(wallet?.availableCredits).toBeGreaterThanOrEqual(0);
  });

  it('shadow reservations record burn without debiting the wallet', async () => {
    const before = await credit.getWallet(userId, { tenantId });
    const result = await credit.reserveCredits({
      userId,
      tenantId,
      estimateCredits: 999,
      idempotencyKey: `test-shadow:${userId}`,
      shadow: true,
    });
    expect(result.ok).toBe(true);
    expect(result.reservationId).not.toBeNull();

    const afterReserve = await credit.getWallet(userId, { tenantId });
    expect(afterReserve?.availableCredits).toBe(before?.availableCredits);

    await credit.reconcileCreditReservation({
      reservationId: result.reservationId!,
      actualCredits: 500,
    });
    const afterReconcile = await credit.getWallet(userId, { tenantId });
    expect(afterReconcile?.availableCredits).toBe(before?.availableCredits);
  });

  it('replayed grant with the same key writes one ledger row', async () => {
    const key = `test-replay:${userId}`;
    const first = await credit.addCredits({
      userId,
      tenantId,
      amountCredits: 250,
      kind: 'topup_grant',
      idempotencyKey: key,
    });
    const second = await credit.addCredits({
      userId,
      tenantId,
      amountCredits: 250,
      kind: 'topup_grant',
      idempotencyKey: key,
    });
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);

    const rows = await admin!`
      SELECT count(*)::int AS count FROM credit_ledger
      WHERE user_id = ${userId} AND idempotency_key = ${key}
    `;
    expect(rows[0]?.count).toBe(1);
  });
});
