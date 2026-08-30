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

// PF-01 — Thread query helpers.
//
// Encapsulates common thread + message queries previously inlined
// across @kestrel/ai consumers. Using these helpers instead of
// importing `schema` directly decouples callers from Drizzle ORM
// internals and makes the query patterns consistent.

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

// ── Types ──────────────────────────────────────────────────────────────

export interface ThreadRow {
  id: string;
  userId: string;
  tenantId?: string;
  title: string | null;
  pinnedSymbol: string | null;
  modelOverride: string | null;
  titleSource: string | null;
  isBriefings: boolean;
  analysisMode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  threadId: string;
  role: string;
  content: string;
  parts: unknown;
  createdAt: Date;
}

export interface CreateThreadInput {
  userId: string;
  title?: string | null;
  pinnedSymbol?: string | null;
  modelOverride?: string | null;
  analysisMode?: string | null;
  isBriefings?: boolean;
}

export interface CreateMessageInput {
  threadId: string;
  role: string;
  content: string;
  parts?: unknown;
}

// ── Thread queries ──────────────────────────────────────────────────────

/**
 * Get a single thread by ID, scoped to the user.
 */
export async function getThread(userId: string, threadId: string): Promise<ThreadRow | null> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select()
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * List threads for a user, ordered by most recently updated.
 */
export async function listThreads(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<ThreadRow[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  return db
    .select()
    .from(schema.chatThreads)
    .where(and(eq(schema.chatThreads.userId, userId), eq(schema.chatThreads.tenantId, tenantId)))
    .orderBy(desc(schema.chatThreads.updatedAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Create a new chat thread.
 */
export async function createThread(input: CreateThreadInput): Promise<ThreadRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(schema.chatThreads)
    .values({
      userId: input.userId,
      tenantId,
      title: input.title ?? null,
      pinnedSymbol: input.pinnedSymbol ?? null,
      modelOverride: input.modelOverride ?? null,
      analysisMode: input.analysisMode ?? null,
      isBriefings: input.isBriefings ?? false,
    })
    .returning();
  return rows[0]!;
}

/**
 * Update a thread's title and title source.
 */
export async function updateThreadTitle(
  userId: string,
  threadId: string,
  title: string,
  titleSource: string,
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .update(schema.chatThreads)
    .set({ title, titleSource, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .returning({ id: schema.chatThreads.id });
  return rows.length > 0;
}

/**
 * Update a thread's pinned symbol.
 */
export async function updateThreadPinnedSymbol(
  userId: string,
  threadId: string,
  pinnedSymbol: string | null,
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .update(schema.chatThreads)
    .set({ pinnedSymbol, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .returning({ id: schema.chatThreads.id });
  return rows.length > 0;
}

/**
 * Delete a thread by ID, scoped to the user.
 */
export async function deleteThread(userId: string, threadId: string): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db
    .delete(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    );
}

/**
 * Batch-delete multiple threads for a user. Returns the deleted thread IDs.
 * Threads not belonging to the user are silently skipped.
 */
export async function batchDeleteThreads(userId: string, ids: string[]): Promise<{ id: string }[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  return db
    .delete(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
        inArray(schema.chatThreads.id, ids),
      ),
    )
    .returning({ id: schema.chatThreads.id });
}

// ── Message queries ────────────────────────────────────────────────────

/**
 * List messages for a thread, oldest first. The user predicate is required
 * because this legacy repository API is also imported by server callers.
 */
export async function listMessages(
  userId: string,
  threadId: string,
  limit: number = 100,
): Promise<MessageRow[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  return db
    .select({
      id: schema.chatMessages.id,
      threadId: schema.chatMessages.threadId,
      role: schema.chatMessages.role,
      content: schema.chatMessages.content,
      parts: schema.chatMessages.parts,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .innerJoin(schema.chatThreads, eq(schema.chatMessages.threadId, schema.chatThreads.id))
    .where(
      and(
        eq(schema.chatMessages.threadId, threadId),
        eq(schema.chatMessages.tenantId, tenantId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .orderBy(schema.chatMessages.createdAt)
    .limit(limit);
}

/**
 * Append a user message to a thread.
 */
export async function appendUserMessage(
  userId: string,
  threadId: string,
  content: string,
  parts?: unknown,
): Promise<MessageRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const [thread] = await db
    .select({ id: schema.chatThreads.id })
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!thread) throw new Error(`thread not found: ${threadId}`);
  const rows = await db
    .insert(schema.chatMessages)
    .values({
      threadId,
      tenantId,
      role: 'user',
      content,
      ...(parts ? { parts } : {}),
    })
    .returning();
  return rows[0]!;
}

/**
 * Append an assistant message to a thread.
 */
export async function appendAssistantMessage(
  userId: string,
  threadId: string,
  content: string,
  parts?: unknown,
): Promise<MessageRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const [thread] = await db
    .select({ id: schema.chatThreads.id })
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!thread) throw new Error(`thread not found: ${threadId}`);
  const rows = await db
    .insert(schema.chatMessages)
    .values({
      threadId,
      tenantId,
      role: 'assistant',
      content,
      ...(parts ? { parts } : {}),
    })
    .returning();
  return rows[0]!;
}

/**
 * Count messages in a thread.
 */
export async function countThreadMessages(userId: string, threadId: string): Promise<number> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.chatMessages)
    .innerJoin(schema.chatThreads, eq(schema.chatMessages.threadId, schema.chatThreads.id))
    .where(
      and(
        eq(schema.chatMessages.threadId, threadId),
        eq(schema.chatMessages.tenantId, tenantId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    );
  return Number(result[0]?.count ?? 0);
}
