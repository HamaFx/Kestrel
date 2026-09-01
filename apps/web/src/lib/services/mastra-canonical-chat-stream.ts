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
  DEFAULT_MAX_DAILY_USD,
  estimateCostUsd,
  extractUserMessageText,
  reserveTurnBudget,
  createGenerationLedger,
} from '@kestrel/ai';
import {
  runMastraCanonicalChatStream,
  type MastraCanonicalChatStream,
  type RunMastraCanonicalChatArgs,
  type SemanticRoutingAccounting,
  type ExecutionPlan,
} from '@kestrel/ai/mastra';
import { listMessages } from '@kestrel/ai/persistence';
import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { createMastraStreamFinalizer } from '@/lib/services/mastra-stream-finalizer';
import { mastraStreamResponse } from '@/lib/services/mastra-stream-response';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra-thread-title';

export interface RunMastraCanonicalChatStreamInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  customInstructions?: string;
  responseStyle?: 'default' | 'concise' | 'technical' | 'risk-first';
  citeSources?: boolean;
  modelOverride?: string | null;
  signal?: AbortSignal;
  executionPlan?: ExecutionPlan;
}

export async function runMastraCanonicalChatStreamService(
  input: RunMastraCanonicalChatStreamInput,
): Promise<Response> {
  const { settings, user } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const ledger = createGenerationLedger();
  let auxiliaryCostUsd = 0;
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
  });

  const finalizer = createMastraStreamFinalizer({
    budget,
    onInterrupted: async () => {
      await appendAssistantMessage(
        input.userId,
        input.threadId,
        {
          id: runId,
          role: 'assistant',
          parts: [{ type: 'text', text: '_Stream interrupted — please retry._' }],
        },
        {
          idempotencyKey: `mastra-canonical:${input.threadId}:${input.userMessage.id}:interrupted`,
        },
      ).catch(() => undefined);
    },
  });

  try {
    await appendUserMessage(input.userId, input.threadId, input.userMessage);
    const historyRows = await listMessages(input.userId, input.threadId, 60);
    const currentUserKey = `ui:${input.userMessage.id}`;
    const history: UIMessage[] = historyRows
      .filter((row) => row.idempotencyKey !== currentUserKey)
      .map((row) => ({
        id: row.id,
        role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
        parts:
          Array.isArray(row.parts) && row.parts.length > 0
            ? (row.parts as UIMessage['parts'])
            : [{ type: 'text', text: row.content }],
      }));

    const aiArgs: RunMastraCanonicalChatArgs = {
      userId: input.userId,
      threadId: input.threadId,
      userMessage: input.userMessage,
      history,
      settings,
      plan: user?.plan ?? null,
      env,
      ...(input.customInstructions ? { customInstructions: input.customInstructions } : {}),
      responseStyle: input.responseStyle,
      citeSources: input.citeSources,
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      backfillExcludeMessageIdempotencyKey: currentUserKey,
      runId,
      executionPlan: input.executionPlan,
      ledger,
      auxiliaryAccounting: {
        onComplete: async ({
          modelId,
          inputChars,
          outputChars,
        }: Parameters<NonNullable<SemanticRoutingAccounting['onComplete']>>[0]) => {
          const auxiliaryCost = estimateCostUsd(
            modelId,
            Math.ceil(inputChars / 4),
            Math.ceil(outputChars / 4),
          );
          ledger.recordCost(`semantic-routing:${runId}`, 'semantic-routing', auxiliaryCost);
          auxiliaryCostUsd = ledger.total();
        },
      },
    };
    const stream: MastraCanonicalChatStream = await runMastraCanonicalChatStream(aiArgs);
    const messageId = crypto.randomUUID();
    let terminalStatus: 'persisted' | 'persistence-failed' | 'interrupted' | 'failed' = 'failed';

    // Build a lazy text iterable that yields chunks immediately, then
    // persists and emits metadata once the stream completes.
    async function* text(): AsyncIterable<string> {
      try {
        yield* stream.text;
        const completed = await stream.completion;
        const observedCost = ledger.total();
        const assistantMessage: UIMessage = {
          id: messageId,
          role: 'assistant',
          parts: [
            { type: 'text', text: completed.text },
            {
              type: 'data-multi-agent-meta',
              data: {
                engine: 'mastra',
                canonical: true,
                runId,
                routingDomain: completed.routing.domain,
                modelId: completed.modelId,
                providerId: completed.providerId,
                observedCost,
                totalLatencyMs: completed.totalLatencyMs,
                toolNames: completed.toolNames,
                evidence: completed.evidence,
                executionOutcome: 'completed',
                answerOutcome: completed.answerOutcome,
                memoryMode: completed.memoryMode,
                modelSnapshot: completed.modelSnapshot,
                terminalReason: 'stream-completed',
              },
            } as UIMessage['parts'][number],
          ],
        };
        try {
          await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
            idempotencyKey: `mastra-canonical:${input.threadId}:${input.userMessage.id}:assistant`,
          });
          terminalStatus = 'persisted';
        } catch (error) {
          terminalStatus = 'persistence-failed';
          throw error;
        }
        void maybeGenerateThreadTitle({
          userId: input.userId,
          threadId: input.threadId,
          firstUser: extractUserMessageText(input.userMessage),
          firstAssistant: completed.text,
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
      meta: { id: messageId, data: { engine: 'mastra', canonical: true, runId } },
      signal: input.signal,
      onAbort: async () => {
        terminalStatus = 'interrupted';
        await finalizer.abort();
      },
      onComplete: () => terminalStatus === 'persisted' ? 'persisted' : terminalStatus,
    });
  } catch (error) {
    if (input.signal?.aborted) await finalizer.abort();
    else await finalizer.fail();
    throw error;
  }
}
