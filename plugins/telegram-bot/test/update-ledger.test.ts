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

// R10 (audit 2026-10-31) — Telegram update dedup made atomic, against real
// PostgreSQL.
//
// The ledger is `plugin_storage`, whose primary key
// `(tenant_id, user_id, plugin_id, collection, key)` is the idempotency key.
// The claim is a single `INSERT … ON CONFLICT DO NOTHING RETURNING`, so the
// database decides which of two concurrent deliveries of the same `update_id`
// proceeds. This suite provisions a disposable database, applies the real
// migrations, and drives the real statement — including concurrently.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (the same
// gate as the PostgreSQL RLS suites).

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb } from '@kestrel/db';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimTelegramUpdate,
  UPDATE_CLAIM_LEASE_MS,
  UPDATE_COLLECTION,
} from '../src/server/update-ledger';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

const USER_ID = 'telegram-ledger-user';
// The user-insert trigger provisions a personal organization whose id equals
// the user id, so the membership tenant for this user is the user id.
const TENANT_ID = USER_ID;
const PLUGIN_ID = 'telegram-bot';

type Raw = ReturnType<typeof postgres>;

let admin: Raw | null = null;
let raw: Raw | null = null;
let databaseName = '';
const previousEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  DB_DISABLE_SSL: process.env.DB_DISABLE_SSL,
};

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

function claim(updateId: number, now?: Date) {
  return claimTelegramUpdate({
    tenantId: TENANT_ID,
    userId: USER_ID,
    pluginId: PLUGIN_ID,
    updateId,
    ...(now ? { now } : {}),
  });
}

async function readEntry(
  updateId: number,
): Promise<{ value: Record<string, unknown> } | undefined> {
  const rows = await raw!.unsafe<{ value: Record<string, unknown> }[]>(
    `SELECT value FROM plugin_storage
      WHERE tenant_id = $1 AND user_id = $2 AND plugin_id = $3 AND collection = $4 AND key = $5`,
    [TENANT_ID, USER_ID, PLUGIN_ID, UPDATE_COLLECTION, String(updateId)],
  );
  return rows[0];
}

describe.skipIf(!enabled || !adminUrl)('telegram update ledger — real PostgreSQL (R10)', () => {
  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 2, prepare: false });
    databaseName = `kestrel_tg_ledger_${randomUUID().replaceAll('-', '_')}`;
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
      'telegram-ledger@example.com',
    ]);

    // The ledger resolves the app connection through `@kestrel/db`'s getDb().
    process.env.DATABASE_URL = isolatedUrl;
    process.env.DB_DISABLE_SSL = 'true';
  }, 300_000);

  beforeEach(async () => {
    await raw!.unsafe(`DELETE FROM plugin_storage WHERE user_id = $1`, [USER_ID]);
  });

  afterAll(async () => {
    await closeDb();
    if (previousEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousEnv.DATABASE_URL;
    if (previousEnv.DB_DISABLE_SSL === undefined) delete process.env.DB_DISABLE_SSL;
    else process.env.DB_DISABLE_SSL = previousEnv.DB_DISABLE_SSL;
    await raw?.end({ timeout: 5 });
    if (admin && databaseName) {
      try {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  });

  it('records the claim under the plugin_storage primary key', async () => {
    const result = await claim(101);

    expect(result).toEqual({ claimed: true, reClaimed: false });
    const entry = await readEntry(101);
    expect(entry?.value).toMatchObject({
      claimedAt: expect.any(String),
      claimedAtMs: expect.any(Number),
    });
  });

  it('grants exactly one of two concurrent deliveries of the same update_id', async () => {
    const results = await Promise.all([claim(202), claim(202)]);

    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    const entry = await readEntry(202);
    expect(entry).toBeDefined();
    // The loser must not have overwritten the winner's claim timestamp.
    expect(entry?.value['processedAt']).toBeUndefined();
  });

  it('never re-claims an update that has been processed', async () => {
    expect((await claim(303)).claimed).toBe(true);
    await raw!.unsafe(
      `UPDATE plugin_storage SET value = $1::jsonb
        WHERE tenant_id = $2 AND user_id = $3 AND plugin_id = $4 AND collection = $5 AND key = '303'`,
      [
        { claimedAt: new Date().toISOString(), processedAt: new Date().toISOString() },
        TENANT_ID,
        USER_ID,
        PLUGIN_ID,
        UPDATE_COLLECTION,
      ],
    );

    const again = await claim(303);
    expect(again.claimed).toBe(false);

    // Even after the claim lease would have expired: a processed update is
    // terminal, so a Telegram retry can never run the prompt twice.
    const muchLater = await claim(303, new Date(Date.now() + UPDATE_CLAIM_LEASE_MS * 4));
    expect(muchLater.claimed).toBe(false);
  });

  it('re-claims a claim abandoned by a dead process, exactly once', async () => {
    const providerDied = new Date(Date.now() - UPDATE_CLAIM_LEASE_MS - 60_000);
    expect((await claim(404, providerDied)).claimed).toBe(true);
    // Still inside the lease: a Telegram retry is deduped.
    expect(
      (await claim(404, new Date(providerDied.getTime() + UPDATE_CLAIM_LEASE_MS - 1_000))).claimed,
    ).toBe(false);

    // After the lease, two retries race and exactly one proceeds.
    const afterLease = new Date(Date.now() + 1_000);
    const results = await Promise.all([claim(404, afterLease), claim(404, afterLease)]);
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(results.find((r) => r.claimed)?.reClaimed).toBe(true);
  });

  it('keeps a completed update out of the reclaimable set', async () => {
    expect((await claim(505)).claimed).toBe(true);
    // Handler finished: the value is replaced with the completion marker.
    await raw!.unsafe(
      `UPDATE plugin_storage SET value = $1::jsonb
        WHERE key = '505' AND user_id = $2`,
      [{ processedAt: new Date().toISOString() }, USER_ID],
    );

    const retry = await claim(505, new Date(Date.now() + UPDATE_CLAIM_LEASE_MS * 10));
    expect(retry.claimed).toBe(false);
  });
});
