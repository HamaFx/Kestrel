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
  reserveTurnBudget,
} from '@kestrel/ai';
import { runMastraMode, type MastraAnalysisMode, type MastraModeResult } from '@kestrel/ai/mastra';
import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra-thread-title';

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
}

export async function runMastraModeChat(
  input: RunMastraModeChatInput,
): Promise<MastraModeResult & { runId: string; observedCost: number }> {
  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
  });
  let result: MastraModeResult | null = null;
  let childCostUsd = 0;

  try {
    await appendUserMessage(input.userId, input.threadId, input.userMessage, {
      idempotencyKey: `mastra-mode:${input.threadId}:${input.userMessage.id}:user`,
    });
    result = await runMastraMode({
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
      onChildCost: (costUsd) => {
        childCostUsd += costUsd;
      },
    });

    const assistantMessage: UIMessage = {
      id: crypto.randomUUID(),
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
            agentOpinions: result.agentOpinions,
          },
        } as UIMessage['parts'][number],
      ],
    };
    const persisted = await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
      idempotencyKey: `mastra-mode:${input.threadId}:${input.userMessage.id}:assistant`,
    });
    void maybeGenerateThreadTitle({
      userId: input.userId,
      threadId: input.threadId,
      firstUser: input.prompt,
      firstAssistant: result.finalText,
      accounting: {
        onComplete: (costUsd) => {
          // The mode workflow has already reconciled its aggregate cost. This
          // callback is retained for observability and future child-ledger
          // aggregation without changing the user-facing result.
          void costUsd;
        },
      },
    });
    const observedCost = result.totalCostUsd + childCostUsd;
    await budget.reconcile(observedCost);
    return { ...result, runId, observedCost, messageId: persisted.messageId };
  } catch (error) {
    if (result) await budget.reconcile(result.totalCostUsd);
    else await budget.release();
    throw error;
  }
}
