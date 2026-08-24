/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { and, eq, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';

const LEASE_MS = 5 * 60 * 1000;

export interface MemoryBackfillClaim {
  userId: string;
  threadId: string;
  claimed: boolean;
}

/** Atomically claim a thread migration across all application processes. */
export async function claimMemoryBackfill(
  userId: string,
  threadId: string,
  db = getDb(),
): Promise<MemoryBackfillClaim> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const rows = await db
    .insert(schema.memoryBackfillState)
    .values({
      userId,
      threadId,
      status: 'running',
      updatedAt: leaseUntil,
    })
    .onConflictDoUpdate({
      target: [schema.memoryBackfillState.userId, schema.memoryBackfillState.threadId],
      set: { status: 'running', updatedAt: leaseUntil, lastError: null },
      where: sql`(
        ${schema.memoryBackfillState.status} IN ('pending', 'failed')
        OR (${schema.memoryBackfillState.status} = 'running' AND ${schema.memoryBackfillState.updatedAt} < ${now})
      )`,
    })
    .returning({ userId: schema.memoryBackfillState.userId });
  return { userId, threadId, claimed: rows.length > 0 };
}

export async function completeMemoryBackfill(
  userId: string,
  threadId: string,
  copiedCount: number,
  copiedThroughCreatedAt: Date | null,
  db = getDb(),
): Promise<void> {
  await db
    .update(schema.memoryBackfillState)
    .set({
      status: 'complete',
      copiedCount,
      copiedThroughCreatedAt,
      lastError: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.memoryBackfillState.userId, userId), eq(schema.memoryBackfillState.threadId, threadId)));
}

export async function failMemoryBackfill(
  userId: string,
  threadId: string,
  error: unknown,
  db = getDb(),
): Promise<void> {
  await db
    .update(schema.memoryBackfillState)
    .set({
      status: 'pending',
      lastError: (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.memoryBackfillState.userId, userId), eq(schema.memoryBackfillState.threadId, threadId)));
}

export async function getMemoryBackfillState(
  userId: string,
  threadId: string,
  db = getDb(),
) {
  const [row] = await db
    .select()
    .from(schema.memoryBackfillState)
    .where(and(eq(schema.memoryBackfillState.userId, userId), eq(schema.memoryBackfillState.threadId, threadId)))
    .limit(1);
  return row ?? null;
}
