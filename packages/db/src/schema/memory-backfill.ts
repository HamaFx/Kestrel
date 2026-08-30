/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

/** Durable coordination state for the legacy Drizzle → Mastra memory projection. */
export const memoryBackfillState = pgTable(
  'memory_backfill_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    copiedThroughCreatedAt: timestamp('copied_through_created_at', { withTimezone: true }),
    copiedCount: integer('copied_count').notNull().default(0),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    unique('memory_backfill_state_user_thread_uk').on(table.userId, table.threadId),
    index('memory_backfill_state_tenant_idx').on(table.tenantId, table.updatedAt),
  ],
);

export type MemoryBackfillStateRow = typeof memoryBackfillState.$inferSelect;
export type MemoryBackfillStateInsert = typeof memoryBackfillState.$inferInsert;
