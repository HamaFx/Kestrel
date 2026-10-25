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

// Custom Agents plugin table.
//
// Follows the createPluginTable() contract (plg_ prefix, tenant columns, RLS)
// but is declared explicitly so Drizzle keeps full column inference.
//
// Migration: packages/db/drizzle/0110_custom_agents_plugin_tables.sql

import { schema } from '@kestrel/db';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { CustomSkill, SkillRef } from '../schemas';

const { organization, users } = schema;

export interface StoredMcpServer {
  id: string;
  url: string;
  /** `enc:v1:` ciphertext; never returned to the browser. */
  authorization?: string;
}

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

export const customAgents = pgTable(
  'plg_custom_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    instructions: text('instructions').notNull(),
    /** Pinned `provider:model`, or null for the user's chat model. */
    model: text('model'),
    tools: jsonb('tools').$type<string[]>().notNull().default([]),
    skills: jsonb('skills').$type<CustomSkill[]>().notNull().default([]),
    skillRefs: jsonb('skill_refs').$type<SkillRef[]>().notNull().default([]),
    mcpServers: jsonb('mcp_servers').$type<StoredMcpServer[]>().notNull().default([]),
    delegatable: boolean('delegatable').notNull().default(false),
    starterTemplate: text('starter_template'),
    runCount: integer('run_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('plg_custom_agents_tenant_user_idx').on(t.tenantId, t.userId),
    uniqueIndex('plg_custom_agents_user_slug_key').on(t.userId, t.slug),
    tenantIsolation(),
  ],
).enableRLS();

export type CustomAgentRow = typeof customAgents.$inferSelect;
export type CustomAgentInsert = typeof customAgents.$inferInsert;
