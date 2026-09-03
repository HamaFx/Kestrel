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
import { notFound } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { createMastraChatMeta } from '@/lib/mastra-chat-meta';
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
    });

    const messageId = crypto.randomUUID();
    assistantMessageId = messageId;
    let observedCost = 0;

    async function* text(): AsyncIterable<string> {
      try {
        yield* stream.text;
        const completed = await stream.completion;
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
        const assistantMessage: UIMessage = {
          id: messageId,
          role: 'assistant',
          parts: [
            { type: 'text', text: completed.result.text },
            { type: 'data-multi-agent-meta', data: meta } as UIMessage['parts'][number],
          ],
        };
        await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
          idempotencyKey: `mastra:${input.threadId}:${input.userMessage.id}:assistant`,
        });
        void maybeGenerateThreadTitle({
          userId: input.userId,
          threadId: input.threadId,
          firstUser: input.prompt,
          firstAssistant: completed.result.text,
          ledger,
          ledgerId: `title:${runId}`,
        });
        await finalizer.complete(observedCost);
      } catch (error) {
        if (input.signal?.aborted) await finalizer.abort();
        else await finalizer.fail();
        throw error;
      }
    }

    return mastraStreamResponse(text(), messageId, {
      meta: { id: messageId, data: { engine: 'mastra', agent: 'mastra-xauusd', runId } },
      signal: input.signal,
      onAbort: () => finalizer.abort(),
    });
  } catch (error) {
    if (input.signal?.aborted) await finalizer.abort();
    else await finalizer.fail();
    throw error;
  }
}
