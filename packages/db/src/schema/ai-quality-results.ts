/**
 * Copyright 2026 Kestrel
 * Licensed under the Apache License, Version 2.0.
 */

import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organization, users } from './auth';

export const aiQualityResults = pgTable('ai_quality_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: text('thread_id'),
  tenantId: text('tenant_id').notNull().default(sql`current_setting('app.current_tenant', true)`).references(() => organization.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull(),
  passed: boolean('passed').notNull(),
  mandatoryPassed: boolean('mandatory_passed').notNull(),
  advisoryScore: doublePrecision('advisory_score'),
  failures: jsonb('failures').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('ai_quality_results_run_uk').on(table.runId),
  index('ai_quality_results_user_created_idx').on(table.userId, table.createdAt),
]);

export type AiQualityResultRow = typeof aiQualityResults.$inferSelect;
export type AiQualityResultInsert = typeof aiQualityResults.$inferInsert;
