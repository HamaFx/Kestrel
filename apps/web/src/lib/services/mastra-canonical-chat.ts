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

import { createGenerationLedger, DEFAULT_MAX_DAILY_USD, reserveTurnBudget } from '@kestrel/ai';
import {
  runMastraCanonicalChat,
  type ExecutionPlan,
  type MastraCanonicalChatResult,
} from '@kestrel/ai/mastra';
import { listMessages } from '@kestrel/ai/persistence';
import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';

import { runBufferedExecution } from './mastra-chat-service-lifecycle';

export interface RunMastraCanonicalChatInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  customInstructions?: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  executionPlan?: ExecutionPlan;
}

export async function runMastraCanonicalChatService(
  input: RunMastraCanonicalChatInput,
): Promise<MastraCanonicalChatResult & { runId: string; observedCost: number; messageId: string }> {
  const { settings, user } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
  });
  const ledger = createGenerationLedger();
  const execution = await runBufferedExecution<MastraCanonicalChatResult>({
    budget,
    userId: input.userId,
    threadId: input.threadId,
    userMessage: input.userMessage,
    userMessageIdempotencyKey: `ui:${input.userMessage.id}`,
    assistantMessageIdempotencyKey: `mastra-canonical:${input.threadId}:${input.userMessage.id}:assistant`,
    execute: async () => {
      const historyRows = await listMessages(input.userId, input.threadId, 60);
      const currentUserKey = `ui:${input.userMessage.id}`;
      const history: UIMessage[] = historyRows
        // The current user message was persisted above. Exclude that exact
        // idempotency row so canonical-chat receives it once via `latest`, not
        // once from history and once from the request body.
        .filter((row) => row.idempotencyKey !== currentUserKey)
        .map((row) => ({
          id: row.id,
          role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
          parts:
            Array.isArray(row.parts) && row.parts.length > 0
              ? (row.parts as UIMessage['parts'])
              : [{ type: 'text', text: row.content }],
        }));
      const runEnv = env;
      const result = await runMastraCanonicalChat({
        userId: input.userId,
        threadId: input.threadId,
        userMessage: input.userMessage,
        history,
        settings,
        plan: user?.plan ?? null,
        env: runEnv,
        ...(input.customInstructions ? { customInstructions: input.customInstructions } : {}),
        ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        backfillExcludeMessageIdempotencyKey: currentUserKey,
        runId,
        executionPlan: input.executionPlan,
        ledger,
      });
      const observedCost = result.totalCostUsd;
      const assistantMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [
          { type: 'text', text: result.text },
          {
            type: 'data-multi-agent-meta',
            data: {
              engine: 'mastra',
              canonical: true,
              executionOutcome: 'completed',
              answerOutcome: result.answerOutcome,
              memoryMode: result.memoryMode,
              memoryBackfill: result.memoryBackfill,
              modelSnapshot: result.modelSnapshot,
              terminalReason: 'buffered-completed',
              runId,
              routingDomain: result.routing.domain,
              modelId: result.modelId,
              providerId: result.providerId,
              observedCost,
              totalLatencyMs: result.totalLatencyMs,
              toolNames: result.toolNames,
            },
          } as UIMessage['parts'][number],
        ],
      };
      return { result, observedCost, assistantMessage };
    },
    buildAssistantMessage: ({ assistantMessage }) => assistantMessage!,
    isCancelled: () => input.signal?.aborted === true,
  });
  return {
    ...execution.result,
    runId,
    observedCost: execution.observedCost,
    messageId: execution.messageId,
  };
}
