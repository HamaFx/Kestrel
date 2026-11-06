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
// Defined in @kestrel/db so Drizzle Kit, the migration reconciler, and the
// runtime schema barrel all see the `plg_paper_trading_*` tables.
//
// Money columns are `numeric(20, 8)` (audit R2, migration 0121), not
// `double precision`: balances, P&L and fees accumulate, so they must be
// exact in the database. `mode: 'number'` keeps the inferred TS type `number`;
// the accumulation itself stays in SQL (`balance = balance + $1`,
// `quantity = quantity - $1`) — see claimPositionClose and
// incrementAccountBalance.
//
// Migration: packages/db/drizzle/0109_paper_trading_plugin_tables.sql
//            packages/db/drizzle/0113_paper_strategy_runs.sql
//            packages/db/drizzle/0121_money_columns_to_numeric.sql

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { pluginBaseColumns, pluginMoneyColumn, pluginTenantIsolation } from '../ops/plugins';

export const paperAccounts = pgTable(
  'plg_paper_trading_accounts',
  {
    ...pluginBaseColumns(),
    name: text('name').notNull(),
    /** 'confirm' (personal) | 'autonomous_sandbox' (agent). */
    mode: text('mode').notNull(),
    currency: text('currency').notNull().default('USD'),
    initialBalance: pluginMoneyColumn('initial_balance').notNull(),
    /** Realised cash. Equity is derived from balance + open positions. */
    balance: pluginMoneyColumn('balance').notNull(),
    leverage: pluginMoneyColumn('leverage').notNull().default(30),
    riskPerTradePct: pluginMoneyColumn('risk_per_trade_pct').notNull().default(1),
    /** 'active' | 'archived'. */
    status: text('status').notNull().default('active'),
    seeded: boolean('seeded').notNull().default(false),
  },
  (t) => [
    index('plg_paper_trading_accounts_tenant_user_idx').on(t.tenantId, t.userId),
    // One account per (user, mode). 0109 created this as a unique index;
    // the duplicate non-unique index was dropped in 0122.
    uniqueIndex('plg_paper_trading_accounts_user_mode_key').on(t.userId, t.mode),
    check(
      'plg_paper_trading_accounts_mode_check',
      sql`${t.mode} IN ('confirm', 'autonomous_sandbox')`,
    ),
    check('plg_paper_trading_accounts_status_check', sql`${t.status} IN ('active', 'archived')`),
    check('plg_paper_trading_accounts_initial_balance_check', sql`${t.initialBalance} > 0`),
    check('plg_paper_trading_accounts_balance_nonnegative_check', sql`${t.balance} >= 0`),
    pluginTenantIsolation(),
  ],
);

export const paperPositions = pgTable(
  'plg_paper_trading_positions',
  {
    ...pluginBaseColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    /** 'long' | 'short'. */
    side: text('side').notNull(),
    /** 'open' | 'closed'. */
    status: text('status').notNull().default('open'),
    quantity: pluginMoneyColumn('quantity').notNull(),
    initialQuantity: pluginMoneyColumn('initial_quantity').notNull(),
    entryPrice: pluginMoneyColumn('entry_price').notNull(),
    entryTime: timestamp('entry_time', { withTimezone: true }).notNull(),
    stopLoss: pluginMoneyColumn('stop_loss'),
    takeProfit: pluginMoneyColumn('take_profit'),
    trailingStopDistance: pluginMoneyColumn('trailing_stop_distance'),
    trailingStopPrice: pluginMoneyColumn('trailing_stop_price'),
    breakEvenAtR: pluginMoneyColumn('break_even_at_r'),
    initialRiskAmount: pluginMoneyColumn('initial_risk_amount').notNull().default(0),
    unrealizedPnl: pluginMoneyColumn('unrealized_pnl').notNull().default(0),
    realizedPnl: pluginMoneyColumn('realized_pnl').notNull().default(0),
    entryFee: pluginMoneyColumn('entry_fee').notNull().default(0),
    exitFee: pluginMoneyColumn('exit_fee').notNull().default(0),
    closePrice: pluginMoneyColumn('close_price'),
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
    check('plg_paper_trading_positions_side_check', sql`${t.side} IN ('long', 'short')`),
    check('plg_paper_trading_positions_status_check', sql`${t.status} IN ('open', 'closed')`),
    check(
      'plg_paper_trading_positions_close_reason_check',
      sql`${t.closeReason} IS NULL OR ${t.closeReason} IN ('manual', 'stop_loss', 'take_profit', 'trailing_stop', 'account_reset')`,
    ),
    check('plg_paper_trading_positions_quantity_check', sql`${t.quantity} >= 0`),
    pluginTenantIsolation(),
  ],
);

export const paperOrders = pgTable(
  'plg_paper_trading_orders',
  {
    ...pluginBaseColumns(),
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
    quantity: pluginMoneyColumn('quantity').notNull(),
    riskPct: pluginMoneyColumn('risk_pct'),
    limitPrice: pluginMoneyColumn('limit_price'),
    stopPrice: pluginMoneyColumn('stop_price'),
    stopLoss: pluginMoneyColumn('stop_loss'),
    takeProfit: pluginMoneyColumn('take_profit'),
    trailingStopDistance: pluginMoneyColumn('trailing_stop_distance'),
    breakEvenAtR: pluginMoneyColumn('break_even_at_r'),
    /** 'gtc' | 'day'. */
    timeInForce: text('time_in_force').notNull().default('gtc'),
    filledPrice: pluginMoneyColumn('filled_price'),
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
    check('plg_paper_trading_orders_side_check', sql`${t.side} IN ('buy', 'sell')`),
    check('plg_paper_trading_orders_type_check', sql`${t.type} IN ('market', 'limit', 'stop')`),
    check(
      'plg_paper_trading_orders_status_check',
      sql`${t.status} IN ('pending', 'filled', 'cancelled', 'rejected', 'expired')`,
    ),
    check('plg_paper_trading_orders_time_in_force_check', sql`${t.timeInForce} IN ('gtc', 'day')`),
    check(
      'plg_paper_trading_orders_trigger_check',
      sql`${t.type} = 'market' OR ${t.limitPrice} IS NOT NULL OR ${t.stopPrice} IS NOT NULL`,
    ),
    pluginTenantIsolation(),
  ],
);

export const paperFills = pgTable(
  'plg_paper_trading_fills',
  {
    ...pluginBaseColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id'),
    orderId: uuid('order_id'),
    /** 'open' | 'close' | 'partial_close' | 'stop_loss' | 'take_profit' | 'trailing_stop'. */
    kind: text('kind').notNull(),
    price: pluginMoneyColumn('price').notNull(),
    quantity: pluginMoneyColumn('quantity').notNull(),
    pnl: pluginMoneyColumn('pnl').notNull().default(0),
    fees: pluginMoneyColumn('fees').notNull().default(0),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('plg_paper_trading_fills_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_paper_trading_fills_account_ts_idx').on(t.accountId, t.ts.desc()),
    pluginTenantIsolation(),
  ],
);

export const paperStrategyRuns = pgTable(
  'plg_paper_trading_strategy_runs',
  {
    ...pluginBaseColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => paperAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    strategyId: text('strategy_id'),
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(),
    source: text('source').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    riskPct: pluginMoneyColumn('risk_pct').notNull().default(1),
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
    check(
      'plg_paper_trading_strategy_runs_status_check',
      sql`${t.status} IN ('active', 'paused', 'stopped', 'error')`,
    ),
    check(
      'plg_paper_trading_strategy_runs_signal_check',
      sql`${t.lastSignal} IS NULL OR ${t.lastSignal} IN ('long', 'short')`,
    ),
    check(
      'plg_paper_trading_strategy_runs_risk_check',
      sql`${t.riskPct} > 0 AND ${t.riskPct} <= 20`,
    ),
    pluginTenantIsolation(),
  ],
);

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
