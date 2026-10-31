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

// Paper Trading plugin tables.
//
// Follows the createPluginTable() contract (plg_ prefix, tenant columns, RLS)
// but is declared explicitly so Drizzle keeps full column inference.
//
// Money columns are `numeric(20, 8)` (audit R2, migration 0121), not
// `double precision`: balances, P&L and fees accumulate, so they must be exact
// in the database. `mode: 'number'` keeps the inferred TS type `number`; the
// accumulation itself stays in SQL (`balance = balance + $1`,
// `quantity = quantity - $1`) — see claimPositionClose and
// incrementAccountBalance.
//
// Migration: packages/db/drizzle/0109_paper_trading_plugin_tables.sql
//            packages/db/drizzle/0121_money_columns_to_numeric.sql

import { schema } from '@kestrel/db';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const { organization, users } = schema;

function tenantColumn() {
  return text('tenant_id')
    .notNull()
    .default(sql`current_setting('app.current_tenant', true)`)
    .references(() => organization.id, { onDelete: 'cascade' });
}

function tenantIsolation() {
  return pgPolicy('tenant_isolation', {
    for: 'all',
    using: sql`tenant_id = current_setting('app.current_tenant', true)`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant', true)`,
  });
}

/** Exact money / price / size column. See the 0121 migration header. */
function moneyColumn(name: string) {
  return numeric(name, { precision: 20, scale: 8, mode: 'number' });
}

function baseColumns() {
  return {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}

export const paperAccounts = pgTable(
  'plg_paper_trading_accounts',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    /** 'confirm' (personal) | 'autonomous_sandbox' (agent). */
    mode: text('mode').notNull(),
    currency: text('currency').notNull().default('USD'),
    initialBalance: moneyColumn('initial_balance').notNull(),
    /** Realised cash. Equity is derived from balance + open positions. */
    balance: moneyColumn('balance').notNull(),
    leverage: moneyColumn('leverage').notNull().default(30),
    riskPerTradePct: moneyColumn('risk_per_trade_pct').notNull().default(1),
    /** 'active' | 'archived'. */
    status: text('status').notNull().default('active'),
    seeded: boolean('seeded').notNull().default(false),
  },
  (t) => [
    index('plg_paper_trading_accounts_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_paper_trading_accounts_user_mode_idx').on(t.userId, t.mode),
    tenantIsolation(),
  ],
).enableRLS();

export const paperPositions = pgTable(
  'plg_paper_trading_positions',
  {
    ...baseColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    /** 'long' | 'short'. */
    side: text('side').notNull(),
    /** 'open' | 'closed'. */
    status: text('status').notNull().default('open'),
    quantity: moneyColumn('quantity').notNull(),
    initialQuantity: moneyColumn('initial_quantity').notNull(),
    entryPrice: moneyColumn('entry_price').notNull(),
    entryTime: timestamp('entry_time', { withTimezone: true }).notNull(),
    stopLoss: moneyColumn('stop_loss'),
    takeProfit: moneyColumn('take_profit'),
    trailingStopDistance: moneyColumn('trailing_stop_distance'),
    trailingStopPrice: moneyColumn('trailing_stop_price'),
    breakEvenAtR: moneyColumn('break_even_at_r'),
    initialRiskAmount: moneyColumn('initial_risk_amount').notNull().default(0),
    unrealizedPnl: moneyColumn('unrealized_pnl').notNull().default(0),
    realizedPnl: moneyColumn('realized_pnl').notNull().default(0),
    entryFee: moneyColumn('entry_fee').notNull().default(0),
    exitFee: moneyColumn('exit_fee').notNull().default(0),
    closePrice: moneyColumn('close_price'),
    closeTime: timestamp('close_time', { withTimezone: true }),
    /** 'manual' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'account_reset'. */
    closeReason: text('close_reason'),
    /** 'agent' | 'manual' | 'api'. */
    source: text('source').notNull().default('agent'),
    notes: text('notes'),
    journalEntryId: uuid('journal_entry_id'),
  },
  (t) => [
    index('plg_paper_trading_positions_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_paper_trading_positions_account_status_idx').on(t.accountId, t.status),
    index('plg_paper_trading_positions_user_symbol_idx').on(t.userId, t.symbol, t.status),
    tenantIsolation(),
  ],
).enableRLS();

export const paperOrders = pgTable(
  'plg_paper_trading_orders',
  {
    ...baseColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    /** 'buy' | 'sell'. */
    side: text('side').notNull(),
    /** 'market' | 'limit' | 'stop'. */
    type: text('type').notNull(),
    /** 'pending' | 'filled' | 'cancelled' | 'rejected' | 'expired'. */
    status: text('status').notNull().default('pending'),
    quantity: moneyColumn('quantity').notNull(),
    riskPct: moneyColumn('risk_pct'),
    limitPrice: moneyColumn('limit_price'),
    stopPrice: moneyColumn('stop_price'),
    stopLoss: moneyColumn('stop_loss'),
    takeProfit: moneyColumn('take_profit'),
    trailingStopDistance: moneyColumn('trailing_stop_distance'),
    breakEvenAtR: moneyColumn('break_even_at_r'),
    /** 'gtc' | 'day'. */
    timeInForce: text('time_in_force').notNull().default('gtc'),
    filledPrice: moneyColumn('filled_price'),
    filledAt: timestamp('filled_at', { withTimezone: true }),
    positionId: uuid('position_id'),
    reason: text('reason'),
    notes: text('notes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('plg_paper_trading_orders_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_paper_trading_orders_account_status_idx').on(t.accountId, t.status),
    index('plg_paper_trading_orders_symbol_status_idx').on(t.symbol, t.status),
    tenantIsolation(),
  ],
).enableRLS();

export const paperFills = pgTable(
  'plg_paper_trading_fills',
  {
    ...baseColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id'),
    orderId: uuid('order_id'),
    /** 'open' | 'close' | 'partial_close' | 'stop_loss' | 'take_profit' | 'trailing_stop'. */
    kind: text('kind').notNull(),
    price: moneyColumn('price').notNull(),
    quantity: moneyColumn('quantity').notNull(),
    pnl: moneyColumn('pnl').notNull().default(0),
    fees: moneyColumn('fees').notNull().default(0),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('plg_paper_trading_fills_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_paper_trading_fills_account_ts_idx').on(t.accountId, t.ts),
    tenantIsolation(),
  ],
).enableRLS();

export const paperStrategyRuns = pgTable(
  'plg_paper_trading_strategy_runs',
  {
    ...baseColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    strategyId: text('strategy_id'),
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(),
    source: text('source').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    riskPct: moneyColumn('risk_pct').notNull().default(1),
    /** 'active' | 'paused' | 'stopped' | 'error'. */
    status: text('status').notNull().default('active'),
    lastBarTime: timestamp('last_bar_time', { withTimezone: true }),
    /** 'long' | 'short' | null. */
    lastSignal: text('last_signal'),
    lastSignalAt: timestamp('last_signal_at', { withTimezone: true }),
    positionId: uuid('position_id'),
    signalCount: integer('signal_count').notNull().default(0),
    orderCount: integer('order_count').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('plg_paper_trading_strategy_runs_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_paper_trading_strategy_runs_status_idx').on(t.status, t.updatedAt),
    tenantIsolation(),
  ],
).enableRLS();

export type PaperAccountRow = typeof paperAccounts.$inferSelect;
export type PaperAccountInsert = typeof paperAccounts.$inferInsert;
export type PaperPositionRow = typeof paperPositions.$inferSelect;
export type PaperPositionInsert = typeof paperPositions.$inferInsert;
export type PaperOrderRow = typeof paperOrders.$inferSelect;
export type PaperOrderInsert = typeof paperOrders.$inferInsert;
export type PaperFillRow = typeof paperFills.$inferSelect;
export type PaperFillInsert = typeof paperFills.$inferInsert;
export type PaperStrategyRunRow = typeof paperStrategyRuns.$inferSelect;
export type PaperStrategyRunInsert = typeof paperStrategyRuns.$inferInsert;
