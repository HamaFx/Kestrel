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

// Phase 5 — bounded persistence outbox replay.

import { randomUUID } from 'node:crypto';

import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { UIMessage } from 'ai';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from './db';
import { persistTraceStrict } from './diagnostics/trace-persistence';
import { saveAgentOpinions } from './multi-agent/persistence';
import { appendAssistantMessage, appendUserMessage } from './persistence/message-persistence';
import { recordTelemetry, recordToolTelemetry } from './persistence/telemetry-persistence';

const rlog = createCategorizedLogger('ai', { component: 'persistence-recovery' });
const LOCK_TTL_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

interface ClaimedFailure {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  lockToken: string;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

const StoredMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    parts: z.array(z.unknown()).max(100),
  })
  .strict();

const MessageReplaySchema = z
  .object({
    userId: z.string().min(1),
    threadId: z.string().min(1),
    message: StoredMessageSchema,
    idempotencyKey: z.string().min(1),
  })
  .strict();

const OpinionsReplaySchema = z
  .object({
    userId: z.string().min(1),
    threadId: z.string().min(1),
    messageId: z.string().min(1),
    analysisMode: z.string().min(1),
    opinions: z
      .array(
        z
          .object({
            agentName: z.string().min(1),
            bias: z.string(),
            confidence: z.number().finite(),
            reasoning: z.string(),
            rawData: z.record(z.unknown()),
            model: z.string().min(1),
            costUsd: z.number().finite().nonnegative(),
            latencyMs: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

const TelemetryKindSchema = z.enum([
  'title_generated',
  'title_failed',
  'title_skipped_budget',
  'routing_fundamental',
  'routing_technical',
  'routing_summary',
  'routing_vision',
  'routing_generic',
  'plan_generated',
  'plan_skipped_budget',
  'plan_failed',
  'multi_specialist_technical',
  'multi_specialist_fundamental',
  'multi_specialist_risk',
  'multi_specialist_sentiment',
  'multi_specialist_technical_failed',
  'multi_specialist_fundamental_failed',
  'multi_specialist_risk_failed',
  'multi_specialist_sentiment_failed',
  'multi_specialist_decision',
  'multi_agent_turn',
  'mastra_xauusd_poc',
  'mastra_xauusd_poc_failed',
  'mastra_mode',
  'mastra_mode_failed',
  'mastra_full_job',
  'mastra_full_job_failed',
  'mastra_worker_task',
  'mastra_worker_task_failed',
  'mastra_canonical_chat',
  'mastra_canonical_chat_failed',
  'turn_failed',
]);

const TelemetryReplaySchema = z
  .object({
    threadId: z.string().min(1),
    userId: z.string().nullable(),
    messageId: z.string().nullable(),
    traceId: z.string().nullable().default(null),
    runId: z.string().nullable().default(null),
    jobId: z.string().nullable().default(null),
    idempotencyKey: z.string().nullable().default(null),
    model: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    ms: z.number().int().nonnegative(),
    usageKnown: z.boolean().optional().default(true),
    kind: TelemetryKindSchema.nullable().default(null),
  })
  .strict();

const ToolTelemetryReplaySchema = z
  .object({
    threadId: z.string().nullable(),
    userId: z.string().nullable(),
    messageId: z.string().nullable(),
    traceId: z.string().nullable().default(null),
    runId: z.string().nullable().default(null),
    jobId: z.string().nullable().default(null),
    idempotencyKey: z.string().nullable().default(null),
    tool: z.string().min(1),
    ms: z.number().int().nonnegative(),
    ok: z.boolean(),
    errorCode: z.string().nullable(),
    outputChars: z.number().int().nonnegative().nullable(),
  })
  .strict();

const TraceReplaySchema = z
  .object({
    traceId: z.string().min(1),
    userId: z.string().min(1),
    threadId: z.string().min(1),
    startedAt: z.number().finite(),
    durationMs: z.number().finite().nonnegative(),
    stepCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    status: z.enum(['completed', 'failed']),
    trace: z.record(z.unknown()),
  })
  .strict();

function parseReplay<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new Error(`Invalid ${operation} outbox payload: ${parsed.error.message}`);
  return parsed.data;
}

async function claimOne(): Promise<ClaimedFailure | null> {
  const lockToken = randomUUID();
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  return getDb().transaction(async (tx) => {
    const rows = resultRows<{
      id: string;
      operation: string;
      payload: Record<string, unknown>;
      attempt_count: number | string;
      max_attempts: number | string;
    }>(
      await tx.execute(sql`
      SELECT id, operation, payload, attempt_count, max_attempts
      FROM persistence_outbox
      WHERE (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND locked_until < now())
        )
        AND next_attempt_at <= now()
        AND attempt_count < max_attempts
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `),
    );
    const row = rows[0];
    if (!row) return null;

    const nextAttempt = Number(row.attempt_count) + 1;
    const updated = resultRows<{ id: string }>(
      await tx.execute(sql`
      UPDATE persistence_outbox
      SET status = 'processing',
          attempt_count = ${nextAttempt},
          locked_until = ${lockedUntil},
          lock_token = ${lockToken},
          updated_at = now()
      WHERE id = ${row.id}
        AND (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND locked_until < now())
        )
      RETURNING id
    `),
    );
    if (updated.length === 0) return null;

    return {
      id: row.id,
      operation: row.operation,
      payload: row.payload,
      attemptCount: nextAttempt,
      maxAttempts: Number(row.max_attempts),
      lockToken,
    };
  });
}

async function markCompleted(item: ClaimedFailure): Promise<void> {
  await getDb().execute(sql`
    UPDATE persistence_outbox
    SET status = 'completed',
        locked_until = NULL,
        lock_token = NULL,
        last_error = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE id = ${item.id} AND status = 'processing' AND lock_token = ${item.lockToken}
  `);
}

async function markFailed(item: ClaimedFailure, error: unknown): Promise<void> {
  const invalidPayload = error instanceof Error && error.message.startsWith('Invalid ');
  const delayMs = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(item.attemptCount - 1, 10));
  const nextAttemptAt = new Date(Date.now() + delayMs);
  const message = error instanceof Error ? error.message : String(error);
  // Payload/schema failures are permanent and should not burn all retry
  // attempts or keep resurfacing as noisy transient failures.
  const nextStatus = invalidPayload || item.attemptCount >= item.maxAttempts ? 'dead' : 'failed';
  await getDb().execute(sql`
    UPDATE persistence_outbox
    SET status = ${nextStatus},
        locked_until = NULL,
        lock_token = NULL,
        last_error = ${message.slice(0, 2_000)},
        next_attempt_at = ${nextAttemptAt},
        updated_at = now()
    WHERE id = ${item.id} AND status = 'processing' AND lock_token = ${item.lockToken}
  `);
}

async function replayOne(item: ClaimedFailure): Promise<void> {
  const payload = item.payload;
  switch (item.operation) {
    case 'message.user': {
      const input = parseReplay(MessageReplaySchema, payload, item.operation);
      await appendUserMessage(input.userId, input.threadId, input.message as unknown as UIMessage, {
        idempotencyKey: input.idempotencyKey,
      });
      return;
    }
    case 'message.assistant': {
      const input = parseReplay(MessageReplaySchema, payload, item.operation);
      await appendAssistantMessage(
        input.userId,
        input.threadId,
        input.message as unknown as UIMessage,
        { idempotencyKey: input.idempotencyKey },
      );
      return;
    }
    case 'agent.opinions':
      await saveAgentOpinions(parseReplay(OpinionsReplaySchema, payload, item.operation));
      return;
    case 'telemetry.turn': {
      const input = parseReplay(TelemetryReplaySchema, payload, item.operation);
      await recordTelemetry({
        threadId: input.threadId,
        userId: input.userId ?? null,
        messageId: input.messageId,
        traceId: input.traceId ?? null,
        runId: input.runId ?? null,
        jobId: input.jobId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        toolCalls: input.toolCalls,
        ms: input.ms,
        ...(input.usageKnown === undefined ? {} : { usageKnown: input.usageKnown }),
        ...(input.kind ? { kind: input.kind } : {}),
      });
      return;
    }
    case 'telemetry.tool': {
      const input = parseReplay(ToolTelemetryReplaySchema, payload, item.operation);
      if (
        !(await recordToolTelemetry({
          threadId: input.threadId,
          userId: input.userId ?? null,
          messageId: input.messageId,
          traceId: input.traceId ?? null,
          runId: input.runId ?? null,
          jobId: input.jobId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          tool: input.tool,
          ms: input.ms,
          ok: input.ok,
          errorCode: input.errorCode ?? null,
          outputChars: input.outputChars ?? null,
        }))
      ) {
        throw new Error('tool telemetry replay returned false');
      }
      return;
    }
    case 'diagnostic.trace':
      await persistTraceStrict(parseReplay(TraceReplaySchema, payload, item.operation));
      return;
    default:
      throw new Error(`unsupported persistence outbox operation: ${item.operation}`);
  }
}

/** Process at most `limit` replay records and return terminal counters. */
export async function replayPersistenceFailures(limit = 25): Promise<{
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
}> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let dead = 0;

  for (let i = 0; i < boundedLimit; i++) {
    const item = await claimOne();
    if (!item) break;
    claimed += 1;
    try {
      await replayOne(item);
      await markCompleted(item);
      completed += 1;
    } catch (err) {
      await markFailed(item, err);
      if (
        item.attemptCount >= item.maxAttempts ||
        (err instanceof Error && err.message.startsWith('Invalid '))
      )
        dead += 1;
      else failed += 1;
      rlog.error('persistence outbox replay failed', {
        outboxId: item.id,
        operation: item.operation,
        attempt: item.attemptCount,
        maxAttempts: item.maxAttempts,
        err: String(err),
      });
    }
  }

  return { claimed, completed, failed, dead };
}
