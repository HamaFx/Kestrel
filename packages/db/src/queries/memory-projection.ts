/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { and, eq, sql } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../client';

export async function markMemoryProjectionPending(userId: string, threadId: string, db: DbClient = getDb()): Promise<void> {
  await db.insert(schema.memoryProjectionState).values({ userId, threadId, status: 'pending' }).onConflictDoUpdate({
    target: [schema.memoryProjectionState.userId, schema.memoryProjectionState.threadId],
    set: { status: 'pending', updatedAt: new Date() },
  });
}

export async function markMemoryProjectionProjected(userId: string, threadId: string, messageId: string, db: DbClient = getDb()): Promise<void> {
  await db.insert(schema.memoryProjectionState).values({
    userId,
    threadId,
    status: 'projected',
    lastProjectedMessageId: messageId,
    projectedAt: new Date(),
  }).onConflictDoUpdate({
    target: [schema.memoryProjectionState.userId, schema.memoryProjectionState.threadId],
    set: { status: 'projected', lastProjectedMessageId: messageId, lastError: null, projectedAt: new Date(), updatedAt: new Date() },
  });
}

export async function markMemoryProjectionFailed(userId: string, threadId: string, error: unknown, db: DbClient = getDb()): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  await db.insert(schema.memoryProjectionState).values({ userId, threadId, status: 'failed', lastError: message }).onConflictDoUpdate({
    target: [schema.memoryProjectionState.userId, schema.memoryProjectionState.threadId],
    set: { status: 'failed', lastError: message, updatedAt: new Date() },
  });
}

export async function getMemoryProjectionState(userId: string, threadId: string, db: DbClient = getDb()) {
  const [row] = await db.select().from(schema.memoryProjectionState).where(and(eq(schema.memoryProjectionState.userId, userId), eq(schema.memoryProjectionState.threadId, threadId))).limit(1);
  return row ?? null;
}
