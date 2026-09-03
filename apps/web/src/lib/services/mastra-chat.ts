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
  estimateCostUsd,
  reserveTurnBudget,
} from '@kestrel/ai';
import type {
  ExecutionPlan,
  XauusdMastraRunResult,
  XauusdResearchReport,
  XauusdTurnMode,
} from '@kestrel/ai/mastra';
import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { createMastraChatMeta } from '@/lib/mastra-chat-meta';

import { runBufferedExecution } from './mastra-chat-service-lifecycle';
import { maybeGenerateThreadTitle } from './mastra-thread-title';
import { runMastraXauusdConversation, runMastraXauusdResearch } from './mastra-xauusd';

export interface RunMastraXauusdChatInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  modelOverride?: string | null;
  kind?: 'research' | 'conversation';
  signal?: AbortSignal;
  /** Prevent native memory backfill from duplicating this persisted request. */
  backfillExcludeMessageIdempotencyKey?: string;
  /** Explicit turn mode (Phase 7): `followup` answers from the saved report. */
  turnMode?: XauusdTurnMode;
  priorReport?: XauusdResearchReport | null;
  executionPlan?: ExecutionPlan;
}

/**
 * Execute one feature-flagged Mastra turn using the same persistence and daily
 * budget guardrails as the legacy agent. The caller owns fallback policy.
 */
export async function runMastraXauusdChat(
  input: RunMastraXauusdChatInput,
): Promise<XauusdMastraRunResult & { runId: string; observedCost: number }> {
  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) {
    throw new Error('User settings not found. Please complete onboarding.');
  }

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
  });
  const runResearch = input.kind !== 'conversation';
  const ledger = createGenerationLedger();
  const execution = await runBufferedExecution<{
    run: XauusdMastraRunResult;
    assistantMessage: UIMessage;
  }>({
    budget,
    userId: input.userId,
    threadId: input.threadId,
    userMessage: input.userMessage,
    assistantMessageIdempotencyKey: `mastra:${input.threadId}:${input.userMessage.id}:assistant`,
    execute: async () => {
      const completedRun = await (
        runResearch ? runMastraXauusdResearch : runMastraXauusdConversation
      )({
        userId: input.userId,
        threadId: input.threadId,
        runId,
        prompt: input.prompt,
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
      const observedCost =
        completedRun.totalCostUsd ||
        estimateCostUsd(
          completedRun.modelId,
          completedRun.stats.inputTokens,
          completedRun.stats.outputTokens,
        );

      const meta = createMastraChatMeta({
        agent: 'mastra-xauusd',
        runId,
        modelId: completedRun.modelId,
        providerId: completedRun.providerId,
        researchStatus: completedRun.packet.status,
        dataQuality: completedRun.packet.dataQuality,
        packetId: completedRun.packet.packetId,
        observedCost,
        report: completedRun.report,
        executionOutcome: 'completed',
        answerOutcome: completedRun.report ? 'ready' : 'blocked',
        terminalReason: 'buffered-completed',
        memoryMode: completedRun.memoryMode,
        memoryBackfill: completedRun.memoryBackfill,
        modelSnapshot: { providerId: completedRun.providerId, bareModelId: completedRun.modelId },
      });
      const assistantMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [
          { type: 'text', text: completedRun.result.text },
          { type: 'data-multi-agent-meta', data: meta } as UIMessage['parts'][number],
        ],
      };
      return { result: { run: completedRun, assistantMessage }, observedCost };
    },
    buildAssistantMessage: ({ result }) => result.assistantMessage,
    isCancelled: () => input.signal?.aborted === true,
  });

  const completedRun = execution.result.run;
  const observedCost = execution.observedCost;

  void maybeGenerateThreadTitle({
    userId: input.userId,
    threadId: input.threadId,
    firstUser: input.prompt,
    firstAssistant: completedRun.result.text,
    ledger,
    ledgerId: `title:${runId}`,
  });
  return { ...completedRun, runId, observedCost };
}
