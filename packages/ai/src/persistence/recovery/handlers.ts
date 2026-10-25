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

// Phase 5 — per-operation replay handlers (DEC-05 split of recovery.ts).
// Payloads are validated against the same shapes the live writers emit, so a
// replayed row produces exactly the same write as the original call.

import type { UIMessage } from 'ai';
import { z } from 'zod';

import { persistTraceStrict } from '../../diagnostics/trace-persistence';
import { saveAgentOpinions } from '../../multi-agent/persistence';
import { appendAssistantMessage, appendUserMessage } from '../message-persistence';
import {
  recordTelemetry,
  recordToolTelemetry,
  TELEMETRY_KINDS,
  type TelemetryInput,
} from '../telemetry-persistence';
import type { ClaimedFailure } from './claim';

const StoredMessageSchema = z.strictObject({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  parts: z.array(z.unknown()).max(100),
});

const MessageReplaySchema = z.strictObject({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  message: StoredMessageSchema,
  idempotencyKey: z.string().min(1),
});

const OpinionsReplaySchema = z.strictObject({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  messageId: z.string().min(1),
  analysisMode: z.string().min(1),
  opinions: z
    .array(
      z.strictObject({
        agentName: z.string().min(1),
        bias: z.string(),
        confidence: z.number().finite(),
        reasoning: z.string(),
        rawData: z.record(z.string(), z.unknown()),
        model: z.string().min(1),
        costUsd: z.number().finite().nonnegative(),
        latencyMs: z.number().finite().nonnegative(),
      }),
    )
    .max(20),
});

// Audit v2 §4.5 — the replay schema deliberately accepts a SUPERSET of the
// emitted vocabulary (`TELEMETRY_KINDS`): it is `.strict()`, so kinds that
// were removed from the live writers (the pre-Mastra `title_*` kinds) must
// stay enumerable here or historical queued payloads would become
// permanently unreplayable.
const TelemetryKindSchema = z.enum([
  'title_generated',
  'title_failed',
  'title_skipped_budget',
  ...TELEMETRY_KINDS,
]);

const TelemetryReplaySchema = z.strictObject({
  threadId: z.string().min(1),
  userId: z.string().nullable(),
  messageId: z.string().nullable(),
  traceId: z.string().nullable().default(null),
  runId: z.string().nullable().default(null),
  jobId: z.string().nullable().default(null),
  idempotencyKey: z.string().nullable().default(null),
  model: z.string().min(1),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  toolCalls: z.int().nonnegative(),
  ms: z.int().nonnegative(),
  // Audit v2 §4.5 — `usageKnown` has no `chat_telemetry` column and is no
  // longer forwarded on replay. The field stays in this `.strict()` schema
  // so historical queued payloads carrying it still parse.
  usageKnown: z.boolean().optional().default(true),
  kind: TelemetryKindSchema.nullable().default(null),
});

const ToolTelemetryReplaySchema = z.strictObject({
  threadId: z.string().nullable(),
  userId: z.string().nullable(),
  messageId: z.string().nullable(),
  traceId: z.string().nullable().default(null),
  runId: z.string().nullable().default(null),
  jobId: z.string().nullable().default(null),
  idempotencyKey: z.string().nullable().default(null),
  tool: z.string().min(1),
  ms: z.int().nonnegative(),
  ok: z.boolean(),
  errorCode: z.string().nullable(),
  outputChars: z.int().nonnegative().nullable(),
});

const TraceReplaySchema = z.strictObject({
  traceId: z.string().min(1),
  userId: z.string().min(1),
  threadId: z.string().min(1),
  startedAt: z.number().finite(),
  durationMs: z.number().finite().nonnegative(),
  stepCount: z.int().nonnegative(),
  errorCount: z.int().nonnegative(),
  status: z.enum(['completed', 'failed']),
  trace: z.record(z.string(), z.unknown()),
});

function parseReplay<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new Error(`Invalid ${operation} outbox payload: ${parsed.error.message}`);
  return parsed.data;
}

export async function replayOne(item: ClaimedFailure): Promise<void> {
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
        // Audit v2 §4.5 — `usageKnown` is not forwarded (no DB column). A
        // legacy queued row may carry a historical kind the live writers no
        // longer emit; replay restores it verbatim — the `chat_telemetry`
        // column still accepts the stored vocabulary.
        ...(input.kind ? { kind: input.kind as NonNullable<TelemetryInput['kind']> } : {}),
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
