/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export type FullAnalysisQueueStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked';

/**
 * Database-owned queue and lease ledger for durable Full-analysis work.
 * Mastra workflow snapshots are a projection for execution observability;
 * this row is the source of truth for ownership and idempotency.
 */
export const fullAnalysisQueue = pgTable(
  'full_analysis_queue',
  {
    runId: text('run_id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').$type<FullAnalysisQueueStatus>().notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    workerRunId: text('worker_run_id'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('full_analysis_queue_user_idempotency_uk').on(table.userId, table.idempotencyKey),
    index('full_analysis_queue_pending_idx').on(table.status, table.createdAt),
    index('full_analysis_queue_lease_idx').on(table.status, table.leaseExpiresAt),
    index('full_analysis_queue_tenant_idx').on(table.tenantId, table.status, table.createdAt),
    index('full_analysis_queue_terminal_completed_idx')
      .on(table.completedAt)
      .where(sql`${table.status} IN ('succeeded', 'failed', 'cancelled', 'blocked') AND ${table.completedAt} IS NOT NULL`),
  ],
);

export type FullAnalysisQueueRow = typeof fullAnalysisQueue.$inferSelect;
export type FullAnalysisQueueInsert = typeof fullAnalysisQueue.$inferInsert;
