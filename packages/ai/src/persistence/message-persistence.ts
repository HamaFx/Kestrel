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

// P1 — Message persistence (SRP split from persistence.ts).
// Message CRUD + parts stripping. Thread and telemetry live in their own modules.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { getMessageText } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '../db';
import { getDiagnosticContext } from '../diagnostics/run-context';
import { enqueuePersistenceFailure } from '../persistence-outbox';

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface DbMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Vercel AI SDK v5 message-parts JSON (tool calls, tool results, etc.). */
  parts: unknown;
  createdAt: number;
  /** Original UI idempotency key when available. */
  idempotencyKey?: string | null;
}

export async function listMessages(
  userId: string,
  threadId: string,
  limit = 200,
): Promise<DbMessage[]> {
  // Enforce ownership in the message query itself. Keeping the owner
  // predicate on the joined thread prevents a future refactor from turning
  // the pre-check into a time-of-check/time-of-use authorization gap.
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({
      id: schema.chatMessages.id,
      threadId: schema.chatMessages.threadId,
      role: schema.chatMessages.role,
      content: schema.chatMessages.content,
      parts: schema.chatMessages.parts,
      idempotencyKey: schema.chatMessages.idempotencyKey,
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
    .orderBy(asc(schema.chatMessages.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    role: r.role as DbMessage['role'],
    content: r.content,
    parts: r.parts,
    createdAt: r.createdAt.getTime(),
    ...(r.idempotencyKey ? { idempotencyKey: r.idempotencyKey } : {}),
  }));
}

export async function appendUserMessage(
  userId: string,
  threadId: string,
  message: UIMessage,
  options?: { idempotencyKey?: string },
): Promise<void> {
  const text = extractText(message);
  const idempotencyKey = options?.idempotencyKey ?? `ui:${message.id}`;
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  try {
    await db.transaction(async (tx) => {
      const ownedThread = await tx
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
      if (ownedThread.length === 0) throw new Error(`thread not found: ${threadId}`);

      await tx
        .insert(schema.chatMessages)
        .values({
          threadId,
          tenantId,
          role: 'user',
          content: text,
          parts: stripPartsForStorage(message.parts ?? null),
          idempotencyKey,
        })
        .onConflictDoNothing({ target: schema.chatMessages.idempotencyKey });
      await tx
        .update(schema.chatThreads)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(schema.chatThreads.id, threadId),
            eq(schema.chatThreads.userId, userId),
            eq(schema.chatThreads.tenantId, tenantId),
          ),
        );
    });
  } catch (err) {
    const context = getDiagnosticContext();
    await enqueuePersistenceFailure({
      userId,
      operation: 'message.user',
      dedupeKey: `message.user:${idempotencyKey}`,
      threadId,
      messageId: message.id,
      traceId: context?.traceId,
      runId: context?.runId,
      jobId: context?.jobId,
      payload: {
        userId,
        threadId,
        message: {
          id: message.id,
          role: message.role,
          parts: stripPartsForStorage(message.parts ?? null),
        },
        idempotencyKey,
      },
      error: err,
    });
    throw err;
  }
}

export async function appendAssistantMessage(
  userId: string,
  threadId: string,
  message: UIMessage,
  options?: { idempotencyKey?: string },
): Promise<{ messageId: string }> {
  const text = extractText(message);
  const idempotencyKey = options?.idempotencyKey ?? `ui:${message.id}`;
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  try {
    return await db.transaction(async (tx) => {
      const ownedThread = await tx
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
      if (ownedThread.length === 0) throw new Error(`thread not found: ${threadId}`);

      const inserted = await tx
        .insert(schema.chatMessages)
        .values({
          threadId,
          tenantId,
          role: 'assistant',
          content: text,
          parts: stripPartsForStorage(message.parts ?? null),
          idempotencyKey,
        })
        .onConflictDoNothing({ target: schema.chatMessages.idempotencyKey })
        .returning({ id: schema.chatMessages.id });
      const messageRow = inserted[0];
      if (!messageRow) {
        const [existing] = await tx
          .select({ id: schema.chatMessages.id })
          .from(schema.chatMessages)
          .where(
            and(
              eq(schema.chatMessages.idempotencyKey, idempotencyKey),
              eq(schema.chatMessages.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (existing) return { messageId: existing.id };
        throw new Error(`assistant message insert returned no row: ${idempotencyKey}`);
      }
      await tx
        .update(schema.chatThreads)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(schema.chatThreads.id, threadId),
            eq(schema.chatThreads.userId, userId),
            eq(schema.chatThreads.tenantId, tenantId),
          ),
        );
      return { messageId: messageRow.id };
    });
  } catch (err) {
    const context = getDiagnosticContext();
    await enqueuePersistenceFailure({
      userId,
      operation: 'message.assistant',
      dedupeKey: `message.assistant:${idempotencyKey}`,
      threadId,
      messageId: message.id,
      traceId: context?.traceId,
      runId: context?.runId,
      jobId: context?.jobId,
      payload: {
        userId,
        threadId,
        message: {
          id: message.id,
          role: message.role,
          parts: stripPartsForStorage(message.parts ?? null),
        },
        idempotencyKey,
      },
      error: err,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Parts stripping
// ---------------------------------------------------------------------------

const STRIP_FIELDS: ReadonlySet<string> = new Set([
  'imageDataUrl',
  'image',
  'data',
  'candles',
  'rawResponse',
]);

function stripPartsForStorage(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts;
  return parts.map((p) => {
    if (p === null || typeof p !== 'object' || !('type' in (p as Record<string, unknown>)))
      return p;
    const part = p as { type: unknown; output?: unknown };
    if (part.type !== 'tool-result' || typeof part.output !== 'object' || part.output === null)
      return p;
    const output = part.output as Record<string, unknown>;
    let modified = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(output)) {
      if (STRIP_FIELDS.has(k)) {
        next[k] = '[stripped]';
        modified = true;
        continue;
      }
      next[k] = v;
    }
    return modified ? { ...part, output: next } : p;
  });
}

function extractText(m: UIMessage): string {
  return getMessageText(m);
}
