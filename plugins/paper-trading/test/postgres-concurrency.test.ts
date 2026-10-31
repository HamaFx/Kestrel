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

// Audit 2026-10-31 (R6) — the paper broker's races, against real PostgreSQL.
//
// Provisions a disposable database, applies the real Drizzle migrations, then
// runs genuinely concurrent operations through two independent tenant
// transactions and asserts the invariants the read-modify-write bugs broke:
//
//   - total closed quantity never exceeds the position size,
//   - exactly one fill per successful close and the balance credited once,
//   - realised P&L is never overwritten,
//   - two fills cannot both pass a margin cap that should reject the second,
//   - two placements cannot both pass a position cap that should reject one,
//   - a gapped stop wipes the balance but never drives it negative.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (same gate
// as the packages/db PostgreSQL suites).

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb, withTenantDbFresh } from '@kestrel/db';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccount, getPosition } from '../src/db/queries';
import { PlaceOrderInputSchema } from '../src/schemas';
import { processQuotesForUser } from '../src/services/fill-engine';
import { applyClose } from '../src/services/position-lifecycle';
import { placeOrderForUser } from '../src/services/trading';
import { normaliseSettings } from '../src/settings';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

// Deterministic quotes: quote acquisition is not the code under test.
const fixtures = vi.hoisted(() => {
  const tick = { symbol: 'XAUUSD', bid: 1999.5, ask: 2000, mid: 1999.75, ts: 1_790_000_000_000 };
  return { tick };
});

vi.mock('../src/services/pricing', () => ({
  spreadFor: () => 0,
  slippageFor: () => 0,
  isTickTradable: () => ({ ok: true }),
  loadTick: async () => fixtures.tick,
  loadTicks: async () => new Map([['XAUUSD', fixtures.tick]]),
}));

const USER_ID = 'paper-concurrency-user';
// The user-insert trigger provisions a personal organization whose id equals
// the user id, so the tenant is the user id.
const TENANT_ID = USER_ID;
const ACCOUNT_ID = randomUUID();
const POSITION_ID = randomUUID();
const ORDER_A = randomUUID();
const ORDER_B = randomUUID();

const previousEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  DB_DISABLE_SSL: process.env.DB_DISABLE_SSL,
  NODE_ENV: process.env.NODE_ENV,
  DB_POOL_MAX: process.env.DB_POOL_MAX,
};

type Raw = ReturnType<typeof postgres>;
let admin: Raw | null = null;
let raw: Raw | null = null;
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

/**
 * Run work inside its own tenant transaction — exactly what the API route
 * boundary (`withTenantDbFresh`) and the worker tick subscriber do. Two of
 * these in `Promise.all` are two real database connections writing the same
 * rows.
 */
function inTenant<T>(work: () => Promise<T>): Promise<T> {
  return withTenantDbFresh(TENANT_ID, work, { userId: USER_ID });
}

async function seedAccount(args: { balance?: number; leverage?: number } = {}): Promise<void> {
  const balance = args.balance ?? 10_000;
  const leverage = args.leverage ?? 30;
  await raw!.unsafe(
    `INSERT INTO plg_paper_trading_accounts
       (id, tenant_id, user_id, name, mode, currency, initial_balance, balance, leverage,
        risk_per_trade_pct, status, seeded)
     VALUES ($1, $2, $3, 'Concurrency account', 'confirm', 'USD', $4, $4, $5, 1, 'active', true)
     ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance, leverage = EXCLUDED.leverage`,
    [ACCOUNT_ID, TENANT_ID, USER_ID, balance, leverage],
  );
}

async function seedPosition(args: {
  quantity: number;
  entryPrice?: number;
  entryFee?: number;
  balance?: number;
}): Promise<void> {
  await seedAccount({ balance: args.balance ?? 10_000 });
  await raw!.unsafe(
    `INSERT INTO plg_paper_trading_positions
       (id, tenant_id, user_id, account_id, symbol, side, status, quantity, initial_quantity,
        entry_price, entry_time, stop_loss, take_profit, trailing_stop_distance,
        trailing_stop_price, break_even_at_r, initial_risk_amount, unrealized_pnl,
        realized_pnl, entry_fee, exit_fee, source, notes)
     VALUES ($1, $2, $3, $4, 'XAUUSD', 'long', 'open', $5, $5, $6, now(), 1990, 2050,
             NULL, NULL, NULL, 0, 0, 0, $7, 0, 'test', NULL)`,
    [
      POSITION_ID,
      TENANT_ID,
      USER_ID,
      ACCOUNT_ID,
      args.quantity,
      args.entryPrice ?? 2000,
      args.entryFee ?? 0,
    ],
  );
}

async function seedLimitOrder(id: string, quantity: number): Promise<void> {
  await raw!.unsafe(
    `INSERT INTO plg_paper_trading_orders
       (id, tenant_id, user_id, account_id, symbol, side, type, status, quantity, risk_pct,
        limit_price, stop_price, stop_loss, take_profit, trailing_stop_distance,
        break_even_at_r, time_in_force)
     VALUES ($1, $2, $3, $4, 'XAUUSD', 'buy', 'limit', 'pending', $5, NULL, 2000, NULL, NULL,
             NULL, NULL, NULL, 'gtc')`,
    [id, TENANT_ID, USER_ID, ACCOUNT_ID, quantity],
  );
}

interface PositionDbRow {
  status: string;
  quantity: number;
  realized_pnl: number;
  entry_fee: number;
}

async function readPosition(): Promise<PositionDbRow> {
  const rows = await raw!.unsafe<PositionDbRow[]>(
    `SELECT status, quantity, realized_pnl, entry_fee
       FROM plg_paper_trading_positions WHERE id = $1`,
    [POSITION_ID],
  );
  return rows[0]!;
}

interface FillDbRow {
  kind: string;
  quantity: number;
  pnl: number;
}

async function readCloseFills(): Promise<FillDbRow[]> {
  return raw!.unsafe<FillDbRow[]>(
    `SELECT kind, quantity, pnl FROM plg_paper_trading_fills
      WHERE user_id = $1 AND position_id = $2 ORDER BY ts`,
    [USER_ID, POSITION_ID],
  );
}

async function readBalance(): Promise<number> {
  const rows = await raw!.unsafe<{ balance: number }[]>(
    `SELECT balance FROM plg_paper_trading_accounts WHERE id = $1`,
    [ACCOUNT_ID],
  );
  return rows[0]!.balance;
}

describe.skipIf(!enabled || !adminUrl)('paper trading money races — real PostgreSQL', () => {
  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 2, prepare: false });
    databaseName = `kestrel_paper_concurrency_${randomUUID().replaceAll('-', '_')}`;
    await admin.unsafe(`CREATE DATABASE ${databaseName}`);

    const url = new URL(adminUrl!);
    url.pathname = `/${databaseName}`;
    const isolatedUrl = url.toString();

    const migrateClient = postgres(isolatedUrl, { max: 1, prepare: false });
    await migrateClient.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await applyMigrations(migrateClient);
    await migrateClient.unsafe(
      `INSERT INTO "user" ("id","email") VALUES ('${USER_ID}','paper-concurrency@example.com')`,
    );
    await migrateClient.end({ timeout: 1 });

    raw = postgres(isolatedUrl, { max: 2, prepare: false });

    process.env.DATABASE_URL = isolatedUrl;
    process.env.DB_DISABLE_SSL = 'true';
    // @kestrel/db caps the pool at one connection under NODE_ENV=test; this
    // suite needs two connections to make the operations genuinely concurrent.
    process.env.NODE_ENV = 'development';
    process.env.DB_POOL_MAX = '4';
  });

  beforeEach(async () => {
    await raw!.unsafe(`DELETE FROM plg_paper_trading_fills WHERE user_id = $1`, [USER_ID]);
    await raw!.unsafe(`DELETE FROM plg_paper_trading_orders WHERE user_id = $1`, [USER_ID]);
    await raw!.unsafe(`DELETE FROM plg_paper_trading_positions WHERE user_id = $1`, [USER_ID]);
  });

  afterAll(async () => {
    await closeDb();
    if (previousEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousEnv.DATABASE_URL;
    if (previousEnv.DB_DISABLE_SSL === undefined) delete process.env.DB_DISABLE_SSL;
    else process.env.DB_DISABLE_SSL = previousEnv.DB_DISABLE_SSL;
    if (previousEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv.NODE_ENV;
    if (previousEnv.DB_POOL_MAX === undefined) delete process.env.DB_POOL_MAX;
    else process.env.DB_POOL_MAX = previousEnv.DB_POOL_MAX;
    await raw?.end({ timeout: 5 });
    if (admin && databaseName) {
      try {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  });

  it('two concurrent partial closes: one fill, one credit, size never over-closed', async () => {
    await seedPosition({ quantity: 10 });
    const position = (await inTenant(() => getPosition(USER_ID, POSITION_ID)))!;
    const account = (await inTenant(() => getAccount(USER_ID, ACCOUNT_ID)))!;
    const settings = normaliseSettings({ commissionPerUnit: 0, autoJournal: false });

    // Both callers read the same pre-close row, then race: exactly one guarded
    // claim may apply. 7 + 7 > 10, so the loser must not even partially stack.
    const run = (): ReturnType<typeof applyClose> =>
      inTenant(() =>
        applyClose({
          userId: USER_ID,
          position,
          account,
          exitPrice: 2010,
          quantity: 7,
          reason: 'manual',
          settings,
          source: 'test',
          now: new Date(),
        }),
      );

    const results = await Promise.all([run(), run()]);
    const applied = results.filter((result) => result.fill !== null);
    expect(applied).toHaveLength(1);

    const fills = await readCloseFills();
    expect(fills).toHaveLength(1);
    expect(fills.reduce((sum, fill) => sum + fill.quantity, 0)).toBeLessThanOrEqual(10);

    const row = await readPosition();
    expect(row.status).toBe('open');
    expect(row.quantity).toBeCloseTo(3, 9);
    expect(row.realized_pnl).toBeCloseTo(fills[0]!.pnl, 9);
    expect(await readBalance()).toBeCloseTo(10_000 + fills[0]!.pnl, 9);
  });

  it('two concurrent partial closes that both fit stack their arithmetic', async () => {
    await seedPosition({ quantity: 10, entryFee: 10 });
    const position = (await inTenant(() => getPosition(USER_ID, POSITION_ID)))!;
    const account = (await inTenant(() => getAccount(USER_ID, ACCOUNT_ID)))!;
    const settings = normaliseSettings({ commissionPerUnit: 1, autoJournal: false });

    const run = (): ReturnType<typeof applyClose> =>
      inTenant(() =>
        applyClose({
          userId: USER_ID,
          position,
          account,
          exitPrice: 2010,
          quantity: 3,
          reason: 'manual',
          settings,
          source: 'test',
          now: new Date(),
        }),
      );

    const results = await Promise.all([run(), run()]);
    expect(results.filter((result) => result.fill !== null)).toHaveLength(2);

    const fills = await readCloseFills();
    expect(fills).toHaveLength(2);
    expect(fills.reduce((sum, fill) => sum + fill.quantity, 0)).toBeCloseTo(6, 9);
    // Each slice releases 3 of the entry fee; 4 remains on the position.
    expect(fills.reduce((sum, fill) => sum + fill.pnl, 0)).toBeCloseTo(2 * (3000 - 3 - 3), 6);

    const row = await readPosition();
    expect(row.quantity).toBeCloseTo(4, 9);
    expect(row.entry_fee).toBeCloseTo(4, 9);
    expect(row.realized_pnl).toBeCloseTo(fills[0]!.pnl + fills[1]!.pnl, 6);
    expect(await readBalance()).toBeCloseTo(10_000 + fills[0]!.pnl + fills[1]!.pnl, 6);
  });

  it('a partial close racing a full close applies exactly one of them', async () => {
    await seedPosition({ quantity: 10 });
    const position = (await inTenant(() => getPosition(USER_ID, POSITION_ID)))!;
    const account = (await inTenant(() => getAccount(USER_ID, ACCOUNT_ID)))!;
    const settings = normaliseSettings({ commissionPerUnit: 0, autoJournal: false });

    const close = (quantity: number): ReturnType<typeof applyClose> =>
      inTenant(() =>
        applyClose({
          userId: USER_ID,
          position,
          account,
          exitPrice: 2010,
          quantity,
          reason: 'manual',
          settings,
          source: 'test',
          now: new Date(),
        }),
      );

    const results = await Promise.all([close(4), close(10)]);
    expect(results.filter((result) => result.fill !== null)).toHaveLength(1);

    const fills = await readCloseFills();
    expect(fills).toHaveLength(1);
    expect(fills.reduce((sum, fill) => sum + fill.quantity, 0)).toBeLessThanOrEqual(10);

    const row = await readPosition();
    expect(row.quantity).toBeGreaterThanOrEqual(0);
    expect(row.realized_pnl).toBeCloseTo(fills[0]!.pnl, 9);
    expect(await readBalance()).toBeCloseTo(10_000 + fills[0]!.pnl, 9);
    if (fills[0]!.quantity === 10) {
      expect(row.status).toBe('closed');
      expect(row.quantity).toBe(0);
    } else {
      expect(row.status).toBe('open');
      expect(row.quantity).toBeCloseTo(6, 9);
    }
  });

  it('floors a gapped stop at zero cash instead of driving the balance negative', async () => {
    await seedPosition({ quantity: 1, entryPrice: 2000, balance: 100 });
    const position = (await inTenant(() => getPosition(USER_ID, POSITION_ID)))!;
    const account = (await inTenant(() => getAccount(USER_ID, ACCOUNT_ID)))!;

    const result = await inTenant(() =>
      applyClose({
        userId: USER_ID,
        position,
        account,
        // Gapped far past the account: the loss is 100_000 against 100 cash.
        exitPrice: 1000,
        quantity: 1,
        reason: 'stop_loss',
        settings: normaliseSettings({ commissionPerUnit: 0, autoJournal: false }),
        source: 'tick',
        now: new Date(),
      }),
    );

    expect(result.closed).toBe(true);
    const row = await readPosition();
    expect(row.realized_pnl).toBeCloseTo(-100_000, 6);
    // The fill and position record the full loss; cash never goes below zero.
    expect(await readBalance()).toBe(0);
  });

  it('two triggered orders against one margin cap: only one position opens', async () => {
    // Each order needs 10_000 margin at leverage 100; the account has 15_000,
    // so only one fits. Both orders are triggered by the same tick.
    await seedAccount({ balance: 15_000, leverage: 100 });
    await seedLimitOrder(ORDER_A, 5);
    await seedLimitOrder(ORDER_B, 5);
    const settings = normaliseSettings({
      maxMarginUtilisationPct: 100,
      commissionPerUnit: 0,
      requireStopLoss: false,
      autoJournal: false,
    });

    const run = () =>
      inTenant(() =>
        processQuotesForUser({
          userId: USER_ID,
          ticksBySymbol: new Map([['XAUUSD', fixtures.tick]]),
          settings,
          source: 'test',
        }),
      );

    const [first, second] = await Promise.all([run(), run()]);
    expect(first.filled + second.filled).toBe(1);

    const positions = await raw!.unsafe<{ quantity: number; entry_price: number }[]>(
      `SELECT quantity, entry_price FROM plg_paper_trading_positions WHERE user_id = $1`,
      [USER_ID],
    );
    expect(positions).toHaveLength(1);
    const margin =
      (positions[0]!.quantity * positions[0]!.entry_price * 100) / 100; /* leverage 100 */
    expect(margin).toBeLessThanOrEqual(15_000 + 1e-6);

    const orders = await raw!.unsafe<{ status: string }[]>(
      `SELECT status FROM plg_paper_trading_orders WHERE user_id = $1`,
      [USER_ID],
    );
    expect(orders.filter((order) => order.status === 'filled')).toHaveLength(1);
    expect(orders.filter((order) => order.status === 'rejected')).toHaveLength(1);
  });

  it('re-reads margin after the account lock (deterministic barrier)', async () => {
    // This is the concurrent-fill interleaving with no reliance on scheduling:
    // another connection holds the account row lock and creates a competing
    // position, exactly as the winning racer would, while the fill waits.
    await seedAccount({ balance: 15_000, leverage: 100 });
    await seedLimitOrder(ORDER_A, 5);
    const settings = normaliseSettings({
      maxMarginUtilisationPct: 100,
      commissionPerUnit: 0,
      requireStopLoss: false,
      autoJournal: false,
    });

    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const holderWork = raw!.begin(async (tx) => {
      await tx.unsafe(`SELECT id FROM plg_paper_trading_accounts WHERE id = $1 FOR UPDATE`, [
        ACCOUNT_ID,
      ]);
      await tx.unsafe(
        `INSERT INTO plg_paper_trading_positions
           (id, tenant_id, user_id, account_id, symbol, side, status, quantity, initial_quantity,
            entry_price, entry_time, stop_loss, take_profit, trailing_stop_distance,
            trailing_stop_price, break_even_at_r, initial_risk_amount, unrealized_pnl,
            realized_pnl, entry_fee, exit_fee, source, notes)
         VALUES (gen_random_uuid(), $1, $2, $3, 'XAUUSD', 'long', 'open', 10, 10, 2000, now(),
                 1990, 2050, NULL, NULL, NULL, 0, 0, 0, 0, 0, 'test', NULL)`,
        [TENANT_ID, USER_ID, ACCOUNT_ID],
      );
      locked();
      await gate;
    });

    await lockTaken;
    const processing = inTenant(() =>
      processQuotesForUser({
        userId: USER_ID,
        ticksBySymbol: new Map([['XAUUSD', fixtures.tick]]),
        settings,
        source: 'test',
      }),
    );

    // Wait until the fill is actually blocked on our account lock, then let
    // the competing position commit.
    let blocked = false;
    try {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        const rows = await raw!.unsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query ILIKE '%plg_paper_trading_accounts%'`,
        );
        if ((rows[0]?.n ?? 0) > 0) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
    } finally {
      // Never leave the holder transaction wedged, even when the poll fails.
      release();
    }
    await holderWork;

    const result = await processing;
    expect(result.filled).toBe(0);
    const orders = await raw!.unsafe<{ status: string }[]>(
      `SELECT status FROM plg_paper_trading_orders WHERE user_id = $1`,
      [USER_ID],
    );
    expect(orders[0]?.status).toBe('rejected');
  });

  it('two concurrent market placements against a cap of one: one position', async () => {
    await seedAccount({ balance: 100_000, leverage: 30 });
    const settings = normaliseSettings({
      maxOpenPositions: 1,
      requireStopLoss: false,
      commissionPerUnit: 0,
      autoJournal: false,
    });
    const input = PlaceOrderInputSchema.parse({
      account: 'personal',
      symbol: 'XAUUSD',
      side: 'buy',
      type: 'market',
      quantity: 0.01,
    });

    const run = () =>
      inTenant(() => placeOrderForUser({ userId: USER_ID, input, settings, source: 'api' }));

    const results = await Promise.allSettled([run(), run()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const positions = await raw!.unsafe<{ id: string }[]>(
      `SELECT id FROM plg_paper_trading_positions WHERE user_id = $1`,
      [USER_ID],
    );
    expect(positions).toHaveLength(1);
  });
});
