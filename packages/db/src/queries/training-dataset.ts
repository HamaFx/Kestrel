/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';

/** Reviewer-approved feedback joined to the persisted prompt + answer text. */
export interface ReviewedTrainingPair {
  messageId: string;
  threadId: string;
  userId: string;
  prompt: string;
  assistantText: string;
  rating: 'positive' | 'negative';
  reviewerLabel: 'pass' | 'fail' | 'needs_review' | null;
  issueCodes: string[] | null;
  reviewerNote: string | null;
  userNote: string | null;
  reviewedAt: Date | null;
  /**
   * Decision 3A — real tool names invoked during the reviewed turn, joined
   * live from `chat_tool_telemetry` (never a hardcoded empty list). `[]` when
   * the turn ran no tools (or the telemetry rows have aged out).
   */
  toolNames?: string[];
}

export interface ListReviewedTrainingPairsOptions {
  limit?: number;
  offset?: number;
}

/**
 * Pull reviewer-approved feedback rows for the dataset assembly job.
 *
 * Only rows a reviewer explicitly labelled (`reviewed` + non-null
 * `reviewerLabel`) are returned. Each row is joined to:
 *  - the assistant message it belongs to (`chat_messages.content`), and
 *  - the nearest preceding user message in the same thread (the prompt).
 *
 * The prompt lookup uses a correlated subquery so the whole batch comes back
 * in one round-trip; threads keep the standard (thread_id, created_at) index.
 */
export async function listReviewedTrainingPairs(
  options: ListReviewedTrainingPairsOptions = {},
): Promise<ReviewedTrainingPair[]> {
  const db = getDb();
  const { limit = 500, offset = 0 } = options;
  const feedback = schema.aiMessageFeedback;
  const assistant = schema.chatMessages;

  // The inner table is aliased (`p`) so `chat_messages` in the WHERE clause
  // resolves to the OUTER row; an unaliased subquery would shadow itself and
  // the correlation would be self-referential (always empty).
  const promptSql = sql<string>`(
    SELECT p.content FROM chat_messages p
    WHERE p.thread_id = ${assistant.threadId}
      AND p.tenant_id = ${feedback.tenantId}
      AND p.role = 'user'
      AND p.created_at < ${assistant.createdAt}
    ORDER BY p.created_at DESC
    LIMIT 1
  )`;

  // Decision 3A — the exact tool names used in the reviewed turn, joined from
  // the persisted tool telemetry: same thread + tenant, matched by the
  // assistant message id or the turn's trace id, successful calls only.
  const toolNamesSql = sql<string[]>`COALESCE((
    SELECT array_agg(DISTINCT t.tool ORDER BY t.tool)
    FROM chat_tool_telemetry t
    WHERE t.thread_id = ${assistant.threadId}
      AND t.tenant_id = ${feedback.tenantId}
      AND (t.message_id = ${assistant.id} OR t.trace_id = ${feedback.traceId})
      AND t.ok = true
  ), ARRAY[]::text[])`;

  const rows = await db
    .select({
      messageId: feedback.messageId,
      threadId: feedback.threadId,
      userId: feedback.userId,
      rating: feedback.rating,
      reviewerLabel: feedback.reviewerLabel,
      issueCodes: feedback.issueCodes,
      reviewerNote: feedback.reviewerNote,
      userNote: feedback.userNote,
      reviewedAt: feedback.reviewedAt,
      assistantText: assistant.content,
      prompt: promptSql,
      toolNames: toolNamesSql,
    })
    .from(feedback)
    .innerJoin(
      assistant,
      and(
        eq(assistant.id, feedback.messageId),
        eq(assistant.threadId, feedback.threadId),
        eq(assistant.tenantId, feedback.tenantId),
      ),
    )
    .innerJoin(
      schema.chatThreads,
      and(
        eq(schema.chatThreads.id, feedback.threadId),
        eq(schema.chatThreads.userId, feedback.userId),
        eq(schema.chatThreads.tenantId, feedback.tenantId),
      ),
    )
    .where(and(eq(feedback.reviewStatus, 'reviewed'), isNotNull(feedback.reviewerLabel)))
    .orderBy(desc(feedback.reviewedAt))
    .limit(Math.min(5000, Math.max(1, limit)))
    .offset(Math.max(0, offset));

  // Normalize a driver that returns a Postgres string literal instead of a
  // decoded text[] (defensive: production postgres-js decodes arrays).
  return rows.map((row) => ({
    ...row,
    toolNames: Array.isArray(row.toolNames) ? row.toolNames : [],
  }));
}
