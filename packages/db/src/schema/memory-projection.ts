/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export type MemoryProjectionStatus = 'pending' | 'projected' | 'failed';

/** Durable checkpoint for the Drizzle → Mastra derived memory projection. */
export const memoryProjectionState = pgTable(
  'memory_projection_state',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    tenantId: text('tenant_id').notNull().default(sql`current_setting('app.current_tenant', true)`).references(() => organization.id, { onDelete: 'cascade' }),
    lastProjectedMessageId: text('last_projected_message_id'),
    status: text('status').$type<MemoryProjectionStatus>().notNull().default('pending'),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    projectedAt: timestamp('projected_at', { withTimezone: true }),
  },
  (table) => [
    unique('memory_projection_state_user_thread_uk').on(table.userId, table.threadId),
    index('memory_projection_state_status_idx').on(table.status, table.updatedAt),
    index('memory_projection_state_tenant_idx').on(table.tenantId, table.updatedAt),
  ],
);

export type MemoryProjectionStateRow = typeof memoryProjectionState.$inferSelect;
