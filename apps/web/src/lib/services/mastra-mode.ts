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

// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import {
  createGenerationLedger,
  DEFAULT_MAX_DAILY_USD,
  reserveTurnBudget,
  terminalMetadata,
} from '@kestrel/ai';
import {
  committeeProgressSnapshot,
  runMastraMode,
  type ExecutionPlan,
  type MastraAnalysisMode,
  type MastraModeResult,
} from '@kestrel/ai/mastra';
import { getUserWithSettings } from '@kestrel/db';
import { ChatStreamEventSchema } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra-thread-title';

import { runBufferedExecution } from './mastra-chat-service-lifecycle';

/** SSE headers shared by every buffered/streamed Mastra response. */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

function encodeSse(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`);
}

export interface RunMastraModeChatInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  symbol: string;
  mode: MastraAnalysisMode;
  modelOverride?: string | null;
  signal?: AbortSignal;
  /** Prevent native memory backfill from duplicating this persisted request. */
  backfillExcludeMessageIdempotencyKey?: string;
  executionPlan?: ExecutionPlan;
}

/**
 * Audit plan §2.3 (P1-8) — streamed committee response for synchronous
 * single/full runs. The SSE response opens immediately; every committee
 * stage (`collect-packet → technical → … → fusion`) is forwarded to the
 * browser as a transient `data-agent-progress` event while the workflow
 * advances, then the verified final text + metadata + persisted turn
 * marker are emitted. Failure mid-stream surfaces as an `error` event plus
 * a `turn-complete` with `failed` status — no partial answer (Q3).
 */
export async function runMastraModeChatStream(input: RunMastraModeChatInput): Promise<Response> {
  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
  });
  const ledger = createGenerationLedger();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: unknown) => controller.enqueue(encodeSse(event));
      try {
        const execution = await runBufferedExecution<MastraModeResult>({
          budget,
          userId: input.userId,
          threadId: input.threadId,
          userMessage: input.userMessage,
          userMessageIdempotencyKey: `mastra-mode:${input.threadId}:${input.userMessage.id}:user`,
          assistantMessageIdempotencyKey: `mastra-mode:${input.threadId}:${input.userMessage.id}:assistant`,
          execute: async () => {
            const result = await runMastraMode({
              prompt: input.prompt,
              symbol: input.symbol,
              userId: input.userId,
              threadId: input.threadId,
              runId,
              mode: input.mode,
              ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
              settings,
              env,
              ...(input.signal ? { signal: input.signal } : {}),
              backfillExcludeMessageIdempotencyKey: input.backfillExcludeMessageIdempotencyKey,
              telemetryKind: 'mastra_mode',
              executionPlan: input.executionPlan,
              ledger,
              onProgress: (step) => {
                // §2.3: live committee progress — the UI renders the desk
                // pipeline while the specialists run instead of a spinner.
                emit({
                  type: 'data-agent-progress',
                  data: committeeProgressSnapshot(input.mode, step),
                });
              },
            });

            const assistantMessage: UIMessage = {
              id: messageId,
              role: 'assistant',
              parts: [
                { type: 'text', text: result.finalText },
                {
                  type: 'data-multi-agent-meta',
                  data: {
                    engine: 'mastra',
                    runId,
                    mode: result.mode,
                    symbol: result.symbol,
                    packetId: result.packet.packetId,
                    dataQuality: result.packet.dataQuality,
                    totalCostUsd: result.totalCostUsd,
                    totalLatencyMs: result.totalLatencyMs,
                    answerOutcome: result.answerOutcome,
                    memoryMode: result.memoryMode,
                    memoryBackfill: result.memoryBackfill,
                    modelSnapshot: result.modelSnapshot,
                    agentOpinions: result.agentOpinions,
                  },
                } as UIMessage['parts'][number],
              ],
            };
            return { result, observedCost: result.totalCostUsd, assistantMessage };
          },
          buildAssistantMessage: ({ assistantMessage }) => assistantMessage!,
          isCancelled: () => input.signal?.aborted === true,
        });

        const result = execution.result;
        void maybeGenerateThreadTitle({
          userId: input.userId,
          threadId: input.threadId,
          firstUser: input.prompt,
          firstAssistant: result.finalText,
          ledger,
          ledgerId: `title:${runId}`,
        });

        emit({ type: 'text-start', id: messageId });
        emit({ type: 'text-delta', id: messageId, delta: result.finalText });
        emit({
          type: 'data-agent-progress',
          data: committeeProgressSnapshot(input.mode, 'fusion', 'complete'),
        });
        emit({
          type: 'data-multi-agent-meta',
          id: messageId,
          data: {
            ...terminalMetadata('completed', result.answerOutcome, 'buffered-completed'),
            engine: 'mastra',
            runId,
            mode: result.mode,
            symbol: result.symbol,
            packetId: result.packet.packetId,
            dataQuality: result.packet.dataQuality,
            observedCost: execution.observedCost,
            totalCostUsd: result.totalCostUsd,
            totalLatencyMs: result.totalLatencyMs,
            answerOutcome: result.answerOutcome,
            memoryMode: result.memoryMode,
            memoryBackfill: result.memoryBackfill,
            modelSnapshot: result.modelSnapshot,
            agentOpinions: result.agentOpinions,
            messageId: execution.messageId,
          },
        });
        emit({ type: 'text-end', id: messageId });
        emit({ type: 'turn-complete', id: messageId, status: 'persisted' });
      } catch (error) {
        const errorText =
          process.env.NODE_ENV === 'production'
            ? 'Mastra could not complete this request. Please try again.'
            : error instanceof Error
              ? error.message
              : String(error);
        emit({
          type: 'data-agent-progress',
          data: { ...committeeProgressSnapshot(input.mode, 'verify'), status: 'failed' as const },
        });
        emit({ type: 'error', errorText });
        emit({ type: 'turn-complete', id: messageId, status: 'failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
