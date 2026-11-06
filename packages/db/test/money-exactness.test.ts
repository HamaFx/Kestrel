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

// money columns are exact, not IEEE-754.
//
// Migration 0121 converted every cost/balance/P&L/fee/size/journal-level
// column to `numeric(20, 8)`. This suite proves the contract on a disposable
// database that was migrated from scratch, because "it is numeric in the DDL"
// is not the same as "accumulating it is exact":
//
//   - the column catalog: every converted column is numeric(20, 8), while the
//     market-data columns deliberately stay `double precision`/`real`,
//   - accumulation: crediting 0.1 ten times lands on exactly 1.0,
//   - aggregation: SUM(est_cost_usd) of 0.1 + 0.2 + 0.3 is exactly 0.6 and
//     compares equal to 0.6, while the float path is 0.6000000000000001,
//   - round-trip: a 17-significant-digit value survives storage verbatim, and
//     the Drizzle `mode: 'number'` mapping still hands JS a `number`,
//   - migration safety: re-running the 0121 USING cast over an existing
//     `double precision` row preserves it,
//   - the new floor: a negative balance write is rejected.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (same gate
// as the sibling PostgreSQL suites).

import { randomUUID } from 'node:crypto';

import { createMigratedTestDatabase, type MigratedTestDatabase } from '@kestrel/test-utils';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

const USER_ID = 'money-exactness-user';
// The user-insert trigger provisions a personal organization whose id equals
// the user id, so the tenant is the user id.
const TENANT_ID = USER_ID;
const ACCOUNT_ID = randomUUID();

/**
 * Every column migration 0121 should have converted, grouped by table. If a
 * future schema edit reintroduces a float here, this list fails the suite.
 */
const MONEY_COLUMNS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['chat_telemetry', ['est_cost_usd']],
  ['agent_opinions', ['cost_usd']],
  ['plg_paper_trading_accounts', ['initial_balance', 'balance', 'leverage', 'risk_per_trade_pct']],
  [
    'plg_paper_trading_positions',
    [
      'quantity',
      'initial_quantity',
      'entry_price',
      'stop_loss',
      'take_profit',
      'trailing_stop_distance',
      'trailing_stop_price',
      'break_even_at_r',
      'initial_risk_amount',
      'unrealized_pnl',
      'realized_pnl',
      'entry_fee',
      'exit_fee',
      'close_price',
    ],
  ],
  [
    'plg_paper_trading_orders',
    [
      'quantity',
      'risk_pct',
      'limit_price',
      'stop_price',
      'stop_loss',
      'take_profit',
      'trailing_stop_distance',
      'break_even_at_r',
      'filled_price',
    ],
  ],
  ['plg_paper_trading_fills', ['price', 'quantity', 'pnl', 'fees']],
  ['plg_paper_trading_strategy_runs', ['risk_pct']],
  ['journal_entries', ['entry', 'stop', 'target', 'exit', 'size', 'r_multiple']],
  ['plg_backtesting_runs', ['initial_balance', 'final_equity']],
  ['plg_backtesting_sweeps', ['initial_balance', 'risk_pct', 'best_score']],
];

type Raw = ReturnType<typeof postgres>;
let raw: Raw | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let testDb: MigratedTestDatabase | null = null;

describe.skipIf(!enabled || !adminUrl)('money columns are exact numeric — real PostgreSQL', () => {
  beforeAll(async () => {
    testDb = await createMigratedTestDatabase(adminUrl!, 'kestrel_money_exactness');
    const isolatedUrl = testDb.connectionString;

    raw = postgres(isolatedUrl, { max: 1, prepare: false });

    // Seed the owner of the probe account (and, via the trigger, its tenant).
    await raw.unsafe(
      `INSERT INTO "user" ("id","email") VALUES ('${USER_ID}','money-exactness@example.com')`,
    );
    await raw.unsafe(
      `INSERT INTO plg_paper_trading_accounts
         (id, tenant_id, user_id, name, mode, currency, initial_balance, balance, leverage,
          risk_per_trade_pct, status, seeded)
       VALUES ($1, $2, $3, 'Exactness account', 'confirm', 'USD', 10000, 0, 30, 1, 'active', true)`,
      [ACCOUNT_ID, TENANT_ID, USER_ID],
    );
    db = drizzle(raw, { schema });
  });

  afterAll(async () => {
    await raw?.end({ timeout: 5 });
    await testDb?.drop();
  });

  it('types every converted column numeric(20, 8) and leaves market data float', async () => {
    const rows = await raw!.unsafe<
      Array<{
        table_name: string;
        column_name: string;
        data_type: string;
        numeric_precision: number | null;
        numeric_scale: number | null;
      }>
    >(
      `SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
         FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );
    const byName = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));

    for (const [table, columns] of MONEY_COLUMNS) {
      for (const column of columns) {
        const found = byName.get(`${table}.${column}`);
        expect(found, `${table}.${column} must exist`).toBeDefined();
        expect(
          {
            data_type: found!.data_type,
            numeric_precision: found!.numeric_precision,
            numeric_scale: found!.numeric_scale,
          },
          `${table}.${column} must be numeric(20, 8)`,
        ).toEqual({ data_type: 'numeric', numeric_precision: 20, numeric_scale: 8 });
      }
    }

    // Out of scope by design: OHLC/tick prices stay IEEE-754 (industry
    // standard), and `pip_size` is symbol metadata, not accumulated money.
    expect(byName.get('candles_1m.c')?.data_type).toBe('double precision');
    expect(byName.get('live_ticks.bid')?.data_type).toBe('double precision');
    expect(byName.get('symbol_catalog.pip_size')?.data_type).toBe('real');

    // And the integer-cent AI ledger is untouched.
    expect(byName.get('daily_ai_spend.total_usd_cents')?.data_type).toBe('bigint');
  });

  it('credits 0.1 ten times and lands on exactly 1.0', async () => {
    await raw!.unsafe(`UPDATE plg_paper_trading_accounts SET balance = 0 WHERE id = $1`, [
      ACCOUNT_ID,
    ]);
    for (let i = 0; i < 10; i += 1) {
      // The exact shape of incrementAccountBalance after the R6 fix:
      // accumulation in SQL, floored at zero.
      await raw!.unsafe(
        `UPDATE plg_paper_trading_accounts
            SET balance = GREATEST(balance + $1, 0)
          WHERE id = $2`,
        [0.1, ACCOUNT_ID],
      );
    }

    const [row] = await raw!.unsafe<{ balance: string; balance_text: string }[]>(
      `SELECT balance, balance::text AS balance_text
         FROM plg_paper_trading_accounts WHERE id = $1`,
      [ACCOUNT_ID],
    );
    expect(row!.balance_text).toBe('1.00000000');
    expect(Number(row!.balance)).toBe(1);
    // For contrast: the IEEE-754 path this replaced drifts on the same kind of
    // addition (0.1 + 0.2 + 0.3 as float8 is 0.6000000000000001).
    const [floatDrift] = await raw!.unsafe<{ drifted: string }[]>(
      `SELECT (0.1::float8 + 0.2::float8 + 0.3::float8)::text AS drifted`,
    );
    expect(floatDrift!.drifted).toBe('0.6000000000000001');
  });

  it('sums est_cost_usd exactly and compares it exactly', async () => {
    await raw!.unsafe(`DELETE FROM chat_telemetry WHERE user_id = $1`, [USER_ID]);

    // Through Drizzle, which is what the writers use: 0.1 / 0.2 / 0.3 in the
    // classic drift order.
    await db!.insert(schema.chatTelemetry).values(
      [0.1, 0.2, 0.3].map((estCostUsd) => ({
        userId: USER_ID,
        tenantId: TENANT_ID,
        model: 'money-exactness/probe',
        estCostUsd,
      })),
    );

    const [sumRow] = await db!
      .select({ total: sql<string>`sum(${schema.chatTelemetry.estCostUsd})::text` })
      .from(schema.chatTelemetry)
      .where(eq(schema.chatTelemetry.userId, USER_ID));
    expect(sumRow?.total).toBe('0.60000000');

    const [comparison] = await raw!.unsafe<{ exact: boolean }[]>(
      `SELECT sum(est_cost_usd) = 0.6::numeric AS exact
         FROM chat_telemetry WHERE user_id = $1`,
      [USER_ID],
    );
    expect(comparison!.exact).toBe(true);

    // The Drizzle `mode: 'number'` mapping still hands the app a JS number.
    const [readBack] = await db!
      .select({ cost: schema.chatTelemetry.estCostUsd })
      .from(schema.chatTelemetry)
      .where(eq(schema.chatTelemetry.userId, USER_ID))
      .limit(1);
    expect(typeof readBack?.cost).toBe('number');
    expect(readBack?.cost).toBe(0.1);
  });

  it('stores a value that needs more than float8 precision verbatim', async () => {
    const journalId = randomUUID();
    // 17 significant digits — cannot survive a double precision column.
    await raw!.unsafe(
      `INSERT INTO journal_entries
         (id, user_id, tenant_id, symbol, side, opened_at, closed_at, entry, stop, target, exit,
          size, outcome, r_multiple)
       VALUES ($1, $2, $3, 'XAUUSD', 'long', now(), now(), '123456789.12345678', '123456700.5',
               '123456999.25', '123456789.12345678', '0.33333333', 'win', '-1.23456789')`,
      [journalId, USER_ID, TENANT_ID],
    );

    const [row] = await raw!.unsafe<
      Array<{ entry: string; stop: string; size: string; r_multiple: string }>
    >(
      `SELECT entry::text AS entry, stop::text AS stop, size::text AS size,
              r_multiple::text AS r_multiple
         FROM journal_entries WHERE id = $1`,
      [journalId],
    );
    expect(row).toEqual({
      entry: '123456789.12345678',
      stop: '123456700.50000000',
      size: '0.33333333',
      r_multiple: '-1.23456789',
    });

    // The same row read through Drizzle: still a `number` to the app.
    const [mapped] = await db!
      .select({ entry: schema.journalEntries.entry, rMultiple: schema.journalEntries.rMultiple })
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, journalId));
    expect(typeof mapped?.entry).toBe('number');
    expect(mapped?.entry).toBe(123456789.12345678);
    expect(mapped?.rMultiple).toBe(-1.23456789);
  });

  it('preserves an existing float row through the 0121 USING cast', async () => {
    // Recreate the pre-migration state for one column, write a row, then run
    // the exact ALTER COLUMN ... USING statement from 0121.
    await raw!.unsafe(
      `ALTER TABLE plg_paper_trading_fills
         ALTER COLUMN fees TYPE double precision USING fees::double precision`,
    );
    await raw!.unsafe(
      `INSERT INTO plg_paper_trading_fills
         (tenant_id, user_id, account_id, kind, price, quantity, pnl, fees)
       VALUES ($1, $2, $3, 'open', 2000, 0.1, 0, 12.34)`,
      [TENANT_ID, USER_ID, ACCOUNT_ID],
    );
    await raw!.unsafe(
      `ALTER TABLE plg_paper_trading_fills
         ALTER COLUMN fees TYPE numeric(20, 8) USING fees::numeric(20, 8)`,
    );

    const [row] = await raw!.unsafe<{ fees: string }[]>(
      `SELECT fees::text AS fees FROM plg_paper_trading_fills
        WHERE user_id = $1 AND fees <> 0 ORDER BY ts DESC LIMIT 1`,
      [USER_ID],
    );
    expect(row!.fees).toBe('12.34000000');
  });

  it('rejects a negative balance now that the floor is a constraint', async () => {
    await expect(
      raw!.unsafe(`UPDATE plg_paper_trading_accounts SET balance = -0.01 WHERE id = $1`, [
        ACCOUNT_ID,
      ]),
    ).rejects.toThrow(/plg_paper_trading_accounts_balance_nonnegative_check/);
  });
});
