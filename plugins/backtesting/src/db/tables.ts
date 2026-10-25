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

// Backtesting plugin tables.
//
// These follow the `createPluginTable()` contract from @kestrel/db (same
// physical prefix, tenant columns, RLS policy, and index), but are declared
// explicitly so Drizzle retains full column inference for query builders.
//
// Migration: packages/db/drizzle/0108_backtesting_plugin_tables.sql

import { schema } from '@kestrel/db';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { BacktestMetrics, BacktestTrade, EquityPoint, RejectedSignal } from '../engine/types';

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

export const backtestRuns = pgTable(
  'plg_backtesting_runs',
  {
    ...baseColumns(),
    /** Human label, e.g. "London killzone sweep". */
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(),
    /** The exact agent-authored JS source that produced this run. */
    source: text('source').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('completed'),
    engineVersion: text('engine_version').notNull(),
    bars: integer('bars').notNull().default(0),
    fromTs: timestamp('from_ts', { withTimezone: true }),
    toTs: timestamp('to_ts', { withTimezone: true }),
    initialBalance: doublePrecision('initial_balance').notNull(),
    finalEquity: doublePrecision('final_equity').notNull(),
    metrics: jsonb('metrics').$type<BacktestMetrics>().notNull(),
    equityCurve: jsonb('equity_curve').$type<EquityPoint[]>().notNull(),
    trades: jsonb('trades').$type<BacktestTrade[]>().notNull(),
    rejectedSignals: jsonb('rejected_signals').$type<RejectedSignal[]>().notNull().default([]),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    logs: jsonb('logs').$type<string[]>().notNull().default([]),
    durationMs: integer('duration_ms').notNull().default(0),
    error: text('error'),
  },
  (t) => [
    index('plg_backtesting_runs_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_backtesting_runs_user_created_idx').on(t.userId, t.createdAt),
    tenantIsolation(),
  ],
).enableRLS();

export const backtestStrategies = pgTable(
  'plg_backtesting_strategies',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    /** Stable per-user slug used by tools and the UI. */
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    source: text('source').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    favorite: boolean('favorite').notNull().default(false),
  },
  (t) => [
    index('plg_backtesting_strategies_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_backtesting_strategies_user_slug_idx').on(t.userId, t.slug),
    tenantIsolation(),
  ],
).enableRLS();

export const backtestSweeps = pgTable(
  'plg_backtesting_sweeps',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    strategyId: text('strategy_id'),
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(),
    source: text('source').notNull(),
    baseParams: jsonb('base_params').$type<Record<string, unknown>>().notNull().default({}),
    parameterSpace: jsonb('parameter_space')
      .$type<Array<{ name: string; values: Array<string | number | boolean> }>>()
      .notNull()
      .default([]),
    objective: text('objective').notNull(),
    count: integer('count').notNull().default(1000),
    initialBalance: doublePrecision('initial_balance').notNull().default(10_000),
    riskPct: doublePrecision('risk_pct').notNull().default(1),
    minTrades: integer('min_trades').notNull().default(5),
    persistRuns: boolean('persist_runs').notNull().default(false),
    status: text('status').notNull().default('queued'),
    total: integer('total').notNull().default(0),
    completed: integer('completed').notNull().default(0),
    bestParams: jsonb('best_params').$type<Record<string, unknown> | null>(),
    bestMetrics: jsonb('best_metrics').$type<Record<string, unknown> | null>(),
    bestScore: doublePrecision('best_score'),
    results: jsonb('results').$type<Array<Record<string, unknown>>>().notNull().default([]),
    error: text('error'),
  },
  (t) => [
    index('plg_backtesting_sweeps_tenant_user_idx').on(t.tenantId, t.userId),
    index('plg_backtesting_sweeps_user_created_idx').on(t.userId, t.createdAt),
    tenantIsolation(),
  ],
).enableRLS();

export type BacktestRunRow = typeof backtestRuns.$inferSelect;
export type BacktestRunInsert = typeof backtestRuns.$inferInsert;
export type BacktestStrategyRow = typeof backtestStrategies.$inferSelect;
export type BacktestStrategyInsert = typeof backtestStrategies.$inferInsert;
export type BacktestSweepRow = typeof backtestSweeps.$inferSelect;
export type BacktestSweepInsert = typeof backtestSweeps.$inferInsert;
