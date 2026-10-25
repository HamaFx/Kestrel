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

// Custom Agents persistence helpers.
//
// Every query filters by both tenant_id and user_id. RLS is the second line
// of defence; the explicit filters keep the helpers safe even when a caller
// runs on a privileged connection.

import { getDb, requireTenantIdForUser, type DbClient } from '@kestrel/db';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import {
  customAgentRuns,
  customAgents,
  type CustomAgentInsert,
  type CustomAgentRow,
  type CustomAgentRunInsert,
  type CustomAgentRunRow,
} from './tables';

export class AgentSlugTakenError extends Error {
  readonly code = 'AGENT_SLUG_TAKEN';
  constructor(slug: string) {
    super(`@${slug} is already used by one of your agents.`);
    this.name = 'AgentSlugTakenError';
  }
}

async function tenantFor(userId: string, db: DbClient): Promise<string> {
  return requireTenantIdForUser(userId, db);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505',
  );
}

export async function listCustomAgents(
  userId: string,
  db: DbClient = getDb(),
): Promise<CustomAgentRow[]> {
  const tenantId = await tenantFor(userId, db);
  return db
    .select()
    .from(customAgents)
    .where(and(eq(customAgents.userId, userId), eq(customAgents.tenantId, tenantId)))
    .orderBy(desc(customAgents.updatedAt));
}

export async function countCustomAgents(userId: string, db: DbClient = getDb()): Promise<number> {
  const tenantId = await tenantFor(userId, db);
  const rows = await db
    .select({ value: count() })
    .from(customAgents)
    .where(and(eq(customAgents.userId, userId), eq(customAgents.tenantId, tenantId)));
  return Number(rows[0]?.value ?? 0);
}

export async function getCustomAgentBySlug(
  userId: string,
  slug: string,
  db: DbClient = getDb(),
): Promise<CustomAgentRow | undefined> {
  const tenantId = await tenantFor(userId, db);
  const rows = await db
    .select()
    .from(customAgents)
    .where(
      and(
        eq(customAgents.userId, userId),
        eq(customAgents.tenantId, tenantId),
        eq(customAgents.slug, slug),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function getCustomAgentById(
  userId: string,
  id: string,
  db: DbClient = getDb(),
): Promise<CustomAgentRow | undefined> {
  const tenantId = await tenantFor(userId, db);
  const rows = await db
    .select()
    .from(customAgents)
    .where(
      and(
        eq(customAgents.userId, userId),
        eq(customAgents.tenantId, tenantId),
        eq(customAgents.id, id),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function createCustomAgent(
  input: Omit<CustomAgentInsert, 'tenantId'>,
  db: DbClient = getDb(),
): Promise<CustomAgentRow> {
  const tenantId = await tenantFor(input.userId, db);
  try {
    const rows = await db
      .insert(customAgents)
      .values({ ...input, tenantId })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('[custom-agents] create returned no row');
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AgentSlugTakenError(input.slug);
    throw error;
  }
}

export interface CustomAgentPatch {
  slug?: string;
  name?: string;
  description?: string;
  instructions?: string;
  model?: string | null;
  tools?: string[];
  skills?: CustomAgentRow['skills'];
  skillRefs?: CustomAgentRow['skillRefs'];
  mcpServers?: CustomAgentRow['mcpServers'];
  delegatable?: boolean;
}

export async function updateCustomAgent(
  userId: string,
  id: string,
  patch: CustomAgentPatch,
  db: DbClient = getDb(),
): Promise<CustomAgentRow | undefined> {
  const tenantId = await tenantFor(userId, db);
  try {
    const rows = await db
      .update(customAgents)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(customAgents.userId, userId),
          eq(customAgents.tenantId, tenantId),
          eq(customAgents.id, id),
        ),
      )
      .returning();
    return rows[0];
  } catch (error) {
    if (isUniqueViolation(error) && patch.slug) throw new AgentSlugTakenError(patch.slug);
    throw error;
  }
}

export async function deleteCustomAgent(
  userId: string,
  id: string,
  db: DbClient = getDb(),
): Promise<boolean> {
  const tenantId = await tenantFor(userId, db);
  const rows = await db
    .delete(customAgents)
    .where(
      and(
        eq(customAgents.userId, userId),
        eq(customAgents.tenantId, tenantId),
        eq(customAgents.id, id),
      ),
    )
    .returning({ id: customAgents.id });
  return rows.length > 0;
}

export async function deleteAllCustomAgents(userId: string, db: DbClient = getDb()): Promise<void> {
  const tenantId = await tenantFor(userId, db);
  await db
    .delete(customAgents)
    .where(and(eq(customAgents.userId, userId), eq(customAgents.tenantId, tenantId)));
}

/** Idempotent template seed: an existing handle is left untouched. */
export async function seedCustomAgent(
  input: Omit<CustomAgentInsert, 'tenantId'>,
  db: DbClient = getDb(),
): Promise<CustomAgentRow> {
  const tenantId = await tenantFor(input.userId, db);
  const rows = await db
    .insert(customAgents)
    .values({ ...input, tenantId })
    .onConflictDoNothing({ target: [customAgents.userId, customAgents.slug] })
    .returning();
  if (rows[0]) return rows[0];
  const existing = await getCustomAgentBySlug(input.userId, input.slug, db);
  if (!existing) throw new AgentSlugTakenError(input.slug);
  return existing;
}

export async function markCustomAgentRun(
  userId: string,
  id: string,
  _status: 'succeeded' | 'failed' | 'cancelled',
  db: DbClient = getDb(),
): Promise<void> {
  const tenantId = await tenantFor(userId, db);
  await db
    .update(customAgents)
    .set({
      runCount: sql`${customAgents.runCount} + 1`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customAgents.userId, userId),
        eq(customAgents.tenantId, tenantId),
        eq(customAgents.id, id),
      ),
    );
}

/** Append one bounded run-history row. */
export async function insertCustomAgentRun(
  input: Omit<CustomAgentRunInsert, 'tenantId'>,
  db: DbClient = getDb(),
): Promise<CustomAgentRunRow> {
  const tenantId = await tenantFor(input.userId, db);
  const rows = await db
    .insert(customAgentRuns)
    .values({ ...input, tenantId })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[custom-agents] run insert returned no row');

  // Keep the per-agent history bounded (the card only needs the latest 200).
  await db.execute(sql`
    DELETE FROM plg_custom_agents_runs
    WHERE user_id = ${input.userId}
      AND agent_id = ${input.agentId}
      AND id NOT IN (
        SELECT id FROM plg_custom_agents_runs
        WHERE user_id = ${input.userId}
          AND agent_id = ${input.agentId}
        ORDER BY created_at DESC
        LIMIT 200
      )
  `);
  return row;
}

export async function listCustomAgentRuns(
  userId: string,
  agentId: string,
  limit = 20,
  db: DbClient = getDb(),
): Promise<CustomAgentRunRow[]> {
  const tenantId = await tenantFor(userId, db);
  return db
    .select()
    .from(customAgentRuns)
    .where(
      and(
        eq(customAgentRuns.userId, userId),
        eq(customAgentRuns.tenantId, tenantId),
        eq(customAgentRuns.agentId, agentId),
      ),
    )
    .orderBy(desc(customAgentRuns.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
}
