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

// Fork: copy a thread up to (and including) one edited user message into a
// new thread whose first message carries the replacement text.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import type { ForkThreadInput, ForkThreadResult } from './types';

export function deriveForkedTitle(newText: string): string {
  const trimmed = newText.trim();
  if (trimmed.length === 0) return 'New chat';
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 79).trimEnd() + '…';
}

const MAX_FORK_MESSAGES = 1000;

export async function forkThread(input: ForkThreadInput): Promise<ForkThreadResult> {
  const { userId, sourceThreadId, atMessageId, newText } = input;
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);

  const [source] = await db
    .select()
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, sourceThreadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!source) throw new Error(`thread not found: ${sourceThreadId}`);

  const sourceMessages = await db
    .select()
    .from(schema.chatMessages)
    .innerJoin(
      schema.chatThreads,
      and(
        eq(schema.chatMessages.threadId, schema.chatThreads.id),
        eq(schema.chatMessages.tenantId, tenantId),
        eq(schema.chatThreads.id, sourceThreadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .orderBy(asc(schema.chatMessages.createdAt), asc(schema.chatMessages.id))
    .limit(MAX_FORK_MESSAGES + 1)
    .then((rows) => rows.map(({ chat_messages }) => chat_messages));
  if (sourceMessages.length > MAX_FORK_MESSAGES) {
    throw new Error(`thread is too long to fork (maximum ${MAX_FORK_MESSAGES} messages)`);
  }

  // Persisted messages use a UUID primary key, but a newly submitted
  // `useChat` message is identified in the browser by `msg_...`. The default
  // user-message idempotency key is `ui:${message.id}`, so resolve either
  // representation within this already ownership-scoped thread.
  const editIdx = sourceMessages.findIndex(
    (m) => m.id === atMessageId || m.idempotencyKey === `ui:${atMessageId}`,
  );
  if (editIdx === -1) throw new Error(`message not found: ${atMessageId}`);
  const target = sourceMessages[editIdx]!;
  if (target.role !== 'user')
    throw new Error(`can only edit user messages, got role=${target.role}`);

  const newTitle = deriveForkedTitle(newText);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.chatThreads)
      .values({
        userId,
        tenantId,
        title: newTitle,
        pinnedSymbol: source.pinnedSymbol ?? null,
        analysisMode: null,
      })
      .returning({ id: schema.chatThreads.id });
    const newThreadId = created!.id;

    const cut = sourceMessages.slice(0, editIdx + 1);
    const rows = cut.map((m, i) => ({
      threadId: newThreadId,
      tenantId,
      role: m.role,
      content: i === editIdx ? newText : m.content,
      parts: m.parts ?? null,
      createdAt: m.createdAt,
    }));
    const inserted = await tx.insert(schema.chatMessages).values(rows).returning({
      id: schema.chatMessages.id,
      role: schema.chatMessages.role,
      content: schema.chatMessages.content,
    });
    const targetInserted = inserted[editIdx];
    if (!targetInserted || targetInserted.role !== 'user') {
      throw new Error('fork did not return the replacement user message');
    }
    await tx
      .update(schema.chatThreads)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(schema.chatThreads.id, newThreadId),
          eq(schema.chatThreads.userId, userId),
          eq(schema.chatThreads.tenantId, tenantId),
        ),
      );

    return {
      newThreadId,
      firstMessage: { id: targetInserted.id, role: 'user' as const, content: newText },
    };
  });
}
