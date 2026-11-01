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

// R10 (audit 2026-10-31) — the bounded/rotated alert fan-out and the delivery
// claim lease, against real PostgreSQL.
//
// Provisions a disposable database, applies the real Drizzle migrations, then
// proves what a mock cannot: the `md5(id || seed)` rotation returns exactly the
// rows the JavaScript mirror predicts and slides across seeds, two concurrent
// claims cannot both win, a lease expires (a crashed runner's claim comes back)
// while a live claim does not, and `markFired` is terminal.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (the same
// gate as the PostgreSQL RLS suites).

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { schema } from '@kestrel/db';
import { container as dependencyContainer } from '@kestrel/shared';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimAlertDelivery,
  listEvaluable,
  markFired,
  releaseAlertDeliveryClaim,
} from '../src/alerts/persistence';
import { alertRotationKey } from '../src/alerts/persistence/crud';
import { DB } from '../src/runtime/tokens';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

const USER_ID = 'alerts-r10-user';
// The user-insert trigger provisions a personal organization whose id equals
// the user id, so the membership tenant for this user is the user id.
const TENANT_ID = USER_ID;

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
type Raw = ReturnType<typeof postgres>;

let admin: Raw | null = null;
let raw: Raw | null = null;
let db: TestDb | null = null;
let databaseName = '';

async function applyMigrations(client: Raw): Promise<void> {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'packages',
    'db',
    'drizzle',
  );
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf-8'));
  for (const entry of journal.entries ?? []) {
    const file = readdirSync(dir).find((name: string) => name.startsWith(`${entry.tag}.sql`));
    if (!file) throw new Error(`Missing migration ${entry.tag}`);
    const statements = readFileSync(join(dir, file), 'utf-8').split('--> statement-breakpoint');
    for (const statement of statements) {
      const executable = statement
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (executable) await client.unsafe(executable);
    }
  }
}

async function seedAlerts(count: number): Promise<string[]> {
  const ids = Array.from({ length: count }, () => randomUUID());
  await raw!.unsafe(
    `INSERT INTO alerts (id, user_id, tenant_id, rule, channels, active, snooze_hours)
     SELECT id::uuid, $1, $2,
            '{"type":"priceCross","symbol":"XAUUSD","direction":"above","level":1}'::jsonb,
            ARRAY['email']::text[], true, 0
       FROM unnest($3::text[]) AS id`,
    [USER_ID, TENANT_ID, ids],
  );
  return ids;
}

async function readRow(
  id: string,
): Promise<{ delivery_claimed_at: Date | null; fired_at: Date | null }> {
  const rows = await raw!.unsafe<{ delivery_claimed_at: Date | null; fired_at: Date | null }[]>(
    `SELECT delivery_claimed_at, fired_at FROM alerts WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

describe.skipIf(!enabled || !adminUrl)('alert fan-out and claims — real PostgreSQL (R10)', () => {
  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 2, prepare: false });
    databaseName = `kestrel_alerts_r10_${randomUUID().replaceAll('-', '_')}`;
    await admin.unsafe(`CREATE DATABASE ${databaseName}`);

    const url = new URL(adminUrl!);
    url.pathname = `/${databaseName}`;
    const isolatedUrl = url.toString();

    raw = postgres(isolatedUrl, { max: 4, prepare: false });
    await raw.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await raw.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END
      $$;
    `);
    await applyMigrations(raw);
    await raw.unsafe(`INSERT INTO "user" ("id","email") VALUES ($1, $2)`, [
      USER_ID,
      'alerts-r10@example.com',
    ]);

    db = drizzle(raw, { schema });
    // `packages/ai`'s runtime `getDb()` resolves through the DI container.
    dependencyContainer.register(DB, () => db as never);
  }, 300_000);

  beforeEach(async () => {
    await raw!.unsafe(`DELETE FROM alerts WHERE user_id = $1`, [USER_ID]);
  });

  afterAll(async () => {
    dependencyContainer.register(DB, () => {
      throw new Error('R10 alert test database was not initialised');
    });
    await raw?.end({ timeout: 5 });
    if (admin && databaseName) {
      try {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  });

  it('bounds the batch to the requested limit', async () => {
    await seedAlerts(30);

    const rows = await listEvaluable({ limit: 5, rotationSeed: 11 });

    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row.userId).toBe(USER_ID);
  });

  it('picks the rows the JavaScript rotation key predicts and slides across seeds', async () => {
    const ids = await seedAlerts(30);
    const seedA = 101;
    const seedB = 202;

    const batchA = await listEvaluable({ limit: 5, rotationSeed: seedA });
    const expectedA = [...ids]
      .sort((a, b) => alertRotationKey(a, seedA).localeCompare(alertRotationKey(b, seedA)))
      .slice(0, 5);
    expect(batchA.map((row) => row.id)).toEqual(expectedA);

    // A different seed walks a different slice of the same set...
    const batchB = await listEvaluable({ limit: 5, rotationSeed: seedB });
    expect(batchB.map((row) => row.id)).not.toEqual(expectedA);

    // ...and across windows every alert is eventually reached: the rotation
    // exists precisely so the tail of the list is not starved.
    const seen = new Set([...batchA, ...batchB].map((row) => row.id));
    for (let seed = 1; seed <= 5; seed += 1) {
      const batch = await listEvaluable({ limit: 5, rotationSeed: seed });
      for (const row of batch) seen.add(row.id);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('is not starved by creation order: the newest alert is reached too', async () => {
    await seedAlerts(20);
    const [newest] = await seedAlerts(1);

    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed += 1) {
      const batch = await listEvaluable({ limit: 4, rotationSeed: seed });
      for (const row of batch) seen.add(row.id);
      if (seen.has(newest!)) break;
    }

    // With the old `ORDER BY created_at ASC LIMIT 4` this could never happen.
    expect(seen.has(newest!)).toBe(true);
  });

  it('grants exactly one of two concurrent claims for the same alert', async () => {
    const [id] = await seedAlerts(1);
    const results = await Promise.all([
      claimAlertDelivery(USER_ID, id!, new Date(), undefined, TENANT_ID),
      claimAlertDelivery(USER_ID, id!, new Date(), undefined, TENANT_ID),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await readRow(id!)).delivery_claimed_at).not.toBeNull();
  });

  it('holds a live claim and reclaims a lease that has run out', async () => {
    const [liveId, staleId] = await seedAlerts(2);
    const now = new Date();

    // A claim taken a second ago is live: another tick is skipped, never
    // double-delivered.
    await expect(
      claimAlertDelivery(USER_ID, liveId!, new Date(now.getTime() - 1_000), 60_000, TENANT_ID),
    ).resolves.toBe(true);
    await expect(claimAlertDelivery(USER_ID, liveId!, now, 60_000, TENANT_ID)).resolves.toBe(false);

    // A claim whose lease has run out is a runner that died mid-delivery: the
    // next tick takes it back instead of hiding the alert for 30 minutes.
    await expect(
      claimAlertDelivery(USER_ID, staleId!, new Date(now.getTime() - 120_000), 60_000, TENANT_ID),
    ).resolves.toBe(true);
    await expect(claimAlertDelivery(USER_ID, staleId!, now, 60_000, TENANT_ID)).resolves.toBe(true);
  });

  it('hands an alert back to the queue when a delivery fails', async () => {
    const [id] = await seedAlerts(1);
    const claimedAt = new Date();
    await claimAlertDelivery(USER_ID, id!, claimedAt, 60_000, TENANT_ID);

    await releaseAlertDeliveryClaim(USER_ID, id!, claimedAt);

    expect((await readRow(id!)).delivery_claimed_at).toBeNull();
    await expect(claimAlertDelivery(USER_ID, id!, new Date(), 60_000, TENANT_ID)).resolves.toBe(
      true,
    );
  });

  it('does not release a claim another run has since taken', async () => {
    const [id] = await seedAlerts(1);
    const firstClaim = new Date(Date.now() - 120_000);
    const secondClaim = new Date();
    // The first run's lease has expired, so the second run legitimately takes
    // the alert over.
    await expect(claimAlertDelivery(USER_ID, id!, firstClaim, 30_000, TENANT_ID)).resolves.toBe(
      true,
    );
    await expect(claimAlertDelivery(USER_ID, id!, secondClaim, 60_000, TENANT_ID)).resolves.toBe(
      true,
    );

    // The first runner finally wakes up and tries to release its old lease: the
    // conditional UPDATE matches nothing, so the live claim survives.
    await releaseAlertDeliveryClaim(USER_ID, id!, firstClaim);

    expect((await readRow(id!)).delivery_claimed_at).not.toBeNull();
  });

  it('markFired is terminal: the claim is cleared and the alert leaves the batch', async () => {
    const [id] = await seedAlerts(1);
    const claimedAt = new Date();
    await claimAlertDelivery(USER_ID, id!, claimedAt, 60_000, TENANT_ID);

    await expect(markFired(USER_ID, id!, new Date(), claimedAt)).resolves.toBe(true);

    const row = await readRow(id!);
    expect(row.fired_at).not.toBeNull();
    expect(row.delivery_claimed_at).toBeNull();
    await expect(claimAlertDelivery(USER_ID, id!, new Date(), 60_000, TENANT_ID)).resolves.toBe(
      false,
    );
    const evaluable = await listEvaluable({ limit: 50, rotationSeed: 1 });
    expect(evaluable.map((alert) => alert.id)).not.toContain(id);
  });
});
