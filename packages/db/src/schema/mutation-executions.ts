/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

/**
 * One committed business mutation per suspended workflow run.
 *
 * The run id is the idempotency boundary. A row is inserted and transitioned
 * to executed in the same database transaction as the business write and
 * audit record, so a committed row always represents a committed mutation.
 */
export const mutationExecutions = pgTable(
  'mutation_executions',
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
    mutation: text('mutation').notNull(),
    inputDigest: text('input_digest').notNull(),
    /** Immutable approval identity captured when the token is consumed. */
    approvalId: text('approval_id'),
    approvalExpiresAt: timestamp('approval_expires_at', { withTimezone: true }),
    status: text('status').notNull().default('executing'),
    resultId: text('result_id'),
    resultUrl: text('result_url'),
    result: jsonb('result'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }),
  },
  (table) => [
    index('mutation_executions_user_idx').on(table.userId, table.createdAt),
    index('mutation_executions_tenant_idx').on(table.tenantId, table.createdAt),
  ],
);

export type MutationExecutionRow = typeof mutationExecutions.$inferSelect;
export type MutationExecutionInsert = typeof mutationExecutions.$inferInsert;
