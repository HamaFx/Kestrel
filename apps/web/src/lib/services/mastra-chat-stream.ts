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
  appendAssistantMessage,
  appendUserMessage,
  createGenerationLedger,
  DEFAULT_MAX_DAILY_USD,
  reserveTurnBudget,
} from '@kestrel/ai';
import {
  runXauusdMastraConversationStream,
  type ExecutionPlan,
  type XauusdMastraConversationStream,
  type XauusdResearchReport,
  type XauusdTurnMode,
} from '@kestrel/ai/mastra';
import { getThread, getUserWithSettings } from '@kestrel/db';
import { notFound, type ChatStreamEvent } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { createMastraChatMeta } from '@/lib/mastra-chat-meta';
import { buildChatCreditOptions } from '@/lib/services/credit-options';
import { createMastraStreamFinalizer } from '@/lib/services/mastra-stream-finalizer';
import { mastraStreamResponse } from '@/lib/services/mastra-stream-response';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra-thread-title';

export interface RunMastraXauusdConversationStreamInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  /** Prevent native memory backfill from duplicating this persisted request. */
  backfillExcludeMessageIdempotencyKey?: string;
  /** Explicit turn mode (Phase 7): `followup` answers from the saved report. */
  turnMode?: XauusdTurnMode;
  priorReport?: XauusdResearchReport | null;
  executionPlan?: ExecutionPlan;
}

export async function runMastraXauusdConversationStreamChat(
  input: RunMastraXauusdConversationStreamInput,
): Promise<Response> {
  const thread = await getThread(input.userId, input.threadId);
  if (!thread) throw notFound('Thread not found');

  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
    credit: buildChatCreditOptions({
      settings,
      threadId: input.threadId,
      userMessageId: input.userMessage.id,
      runId,
      mode: 'single',
      executionPlan: input.executionPlan,
      modelOverride: input.modelOverride,
      defaultModel: env.AI_DEFAULT_MODEL,
    }),
  });
  let assistantMessageId = runId;
  const ledger = createGenerationLedger();

  const finalizer = createMastraStreamFinalizer({
    budget,
    onInterrupted: async () => {
      await appendAssistantMessage(
        input.userId,
        input.threadId,
        {
          id: assistantMessageId,
          role: 'assistant',
          parts: [{ type: 'text', text: '_Stream interrupted — please retry._' }],
        },
        { idempotencyKey: `mastra:${input.threadId}:${input.userMessage.id}:interrupted` },
      ).catch(() => undefined);
    },
  });

  try {
    await appendUserMessage(input.userId, input.threadId, input.userMessage);

    const liveToolEvents: ChatStreamEvent[] = [];
    const emittedToolCallIds = new Set<string>();

    const stream: XauusdMastraConversationStream = await runXauusdMastraConversationStream({
      prompt: input.prompt,
      userId: input.userId,
      threadId: input.threadId,
      runId,
      settings,
      env,
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.backfillExcludeMessageIdempotencyKey
        ? { backfillExcludeMessageIdempotencyKey: input.backfillExcludeMessageIdempotencyKey }
        : {}),
      ...(input.turnMode ? { turnMode: input.turnMode } : {}),
      ...(input.priorReport ? { priorReport: input.priorReport } : {}),
      ...(input.executionPlan ? { executionPlan: input.executionPlan } : {}),
      ledger,
      onToolEvent: (ev) => {
        emittedToolCallIds.add(ev.toolCallId);
        liveToolEvents.push(ev);
      },
    });

    const messageId = crypto.randomUUID();
    assistantMessageId = messageId;
    let observedCost = 0;
    const postTextEvents: ChatStreamEvent[] = [];

    async function* text(): AsyncIterable<string | ChatStreamEvent> {
      try {
        while (liveToolEvents.length > 0) {
          const ev = liveToolEvents.shift();
          if (ev) yield ev;
        }
        for await (const chunk of stream.text) {
          while (liveToolEvents.length > 0) {
            const ev = liveToolEvents.shift();
            if (ev) yield ev;
          }
          if (chunk.length > 0) yield chunk;
        }
        while (liveToolEvents.length > 0) {
          const ev = liveToolEvents.shift();
          if (ev) yield ev;
        }
        const completed = await stream.completion;
        const toolParts = completed.toolParts ?? [];
        for (const tp of toolParts) {
          if (!emittedToolCallIds.has(tp.toolCallId)) {
            emittedToolCallIds.add(tp.toolCallId);
            postTextEvents.push({
              type: 'tool-input-available',
              toolCallId: tp.toolCallId,
              toolName: tp.toolName,
              input: tp.input,
            });
            if (tp.state === 'output-available') {
              postTextEvents.push({
                type: 'tool-output-available',
                toolCallId: tp.toolCallId,
                output: tp.output ?? null,
              });
            } else if (tp.state === 'output-error') {
              postTextEvents.push({
                type: 'tool-output-error',
                toolCallId: tp.toolCallId,
                errorText: tp.errorText ?? 'Tool execution failed.',
              });
            }
          }
        }
        // P2-06: await the bounded title call before snapshotting cost so the
        // reservation settles the full turn spend (title call included) and
        // the persisted meta reports the true total.
        await maybeGenerateThreadTitle({
          userId: input.userId,
          threadId: input.threadId,
          firstUser: input.prompt,
          firstAssistant: completed.result.text,
          ledger,
          ledgerId: `title:${runId}`,
        });
        observedCost = ledger.total();
        const meta = createMastraChatMeta({
          runId,
          modelId: completed.modelId,
          providerId: completed.providerId,
          researchStatus: completed.packet.status,
          dataQuality: completed.packet.dataQuality,
          packetId: completed.packet.packetId,
          observedCost,
          report: null,
          executionOutcome: 'completed',
          answerOutcome: 'ready',
          memoryMode: completed.memoryMode,
          memoryBackfill: completed.memoryBackfill,
          modelSnapshot: undefined,
          terminalReason: 'stream-completed',
        });
        postTextEvents.push({
          type: 'data-multi-agent-meta',
          id: messageId,
          data: meta as unknown as Record<string, unknown>,
        });
        const assistantMessage: UIMessage = {
          id: messageId,
          role: 'assistant',
          parts: [
            ...(toolParts as unknown as UIMessage['parts']),
            { type: 'text', text: completed.result.text },
            { type: 'data-multi-agent-meta', data: meta } as UIMessage['parts'][number],
          ],
        };
        await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
          idempotencyKey: `mastra:${input.threadId}:${input.userMessage.id}:assistant`,
        });
        await finalizer.complete(observedCost);
      } catch (error) {
        if (input.signal?.aborted) await finalizer.abort();
        else await finalizer.fail();
        throw error;
      }
    }

    return mastraStreamResponse(text(), messageId, {
      afterTextEvents: () => postTextEvents,
      signal: input.signal,
      onAbort: () => finalizer.abort(),
    });
  } catch (error) {
    if (input.signal?.aborted) await finalizer.abort();
    else await finalizer.fail();
    throw error;
  }
}
