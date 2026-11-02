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
  runXauusdMastraConversationStream,
  type ExecutionPlan,
  type XauusdMastraConversationStream,
  type XauusdResearchReport,
  type XauusdTurnMode,
} from '@kestrel/ai/mastra-v2';
import { getThread } from '@kestrel/ai/persistence';
import { notFound } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { createMastraChatMeta } from '@/lib/services/mastra/meta';
import { runMastraSseTurn } from '@/lib/services/mastra/stream/run-mastra-sse-turn';

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
  return runMastraSseTurn<
    Awaited<XauusdMastraConversationStream['completion']>,
    XauusdMastraConversationStream
  >({
    userId: input.userId,
    threadId: input.threadId,
    userMessage: input.userMessage,
    idempotencyPrefix: 'mastra',
    ...(input.signal ? { signal: input.signal } : {}),
    prepare: async () => {
      const thread = await getThread(input.userId, input.threadId);
      if (!thread) throw notFound('Thread not found');
    },
    openStream: ({ runId, ledger, settings, env, emitToolEvent }) =>
      runXauusdMastraConversationStream({
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
        onToolEvent: (event) => emitToolEvent(event),
      }),
    title: ({ completed }) => ({
      firstUser: input.prompt,
      firstAssistant: completed.result.text,
    }),
    finalize: async ({ runId, messageId, postTextEvents, completed, observedCost }) => {
      const meta = {
        ...createMastraChatMeta({
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
        }),
        // R14 — honest answer metadata when a mid-turn provider switch happened.
        ...(completed.fallbackParts?.length
          ? { fallbacks: completed.fallbackParts, fallbackApplied: true }
          : { fallbackApplied: false }),
      };
      postTextEvents.push({
        type: 'data-multi-agent-meta',
        id: messageId,
        data: meta as unknown as Record<string, unknown>,
      });
      return {
        id: messageId,
        role: 'assistant',
        parts: [
          ...(completed.toolParts as unknown as UIMessage['parts']),
          { type: 'text', text: completed.result.text },
          ...((completed.fallbackParts ?? []) as unknown as UIMessage['parts']),
          { type: 'data-multi-agent-meta', data: meta } as UIMessage['parts'][number],
        ],
      };
    },
  });
}
