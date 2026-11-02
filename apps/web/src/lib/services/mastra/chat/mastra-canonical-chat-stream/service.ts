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

// Canonical Mastra chat streaming runner. Budget, persistence, live tool
// events, title, and abort/failure settlement live in `runMastraSseTurn`;
// this module owns only the canonical agent's stream factory and tail.

import 'server-only';

import { estimateCostUsd, extractUserMessageText } from '@kestrel/ai';
import {
  CANONICAL_EVIDENCE_BLOCKED_MESSAGE,
  CanonicalEvidenceBlockedError,
  runMastraCanonicalChatStream,
  type ExecutionPlan,
  type MastraCanonicalChatStream,
  type RunMastraCanonicalChatArgs,
  type SemanticRoutingAccounting,
} from '@kestrel/ai/mastra-v2';
import { listMessages } from '@kestrel/ai/persistence';
import type { UIMessage } from 'ai';

import { runMastraSseTurn } from '@/lib/services/mastra/stream/run-mastra-sse-turn';

import {
  buildCanonicalAssistantMessage,
  buildCanonicalMetaData,
  buildEvidenceBlockedArtifacts,
  buildMemoryDegradedPart,
} from './telemetry';

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
  return runMastraSseTurn<
    Awaited<MastraCanonicalChatStream['completion']>,
    MastraCanonicalChatStream
  >({
    userId: input.userId,
    threadId: input.threadId,
    userMessage: input.userMessage,
    idempotencyPrefix: 'mastra-canonical',
    ...(input.signal ? { signal: input.signal } : {}),
    openStream: async ({ runId, ledger, settings, env, emitToolEvent }) => {
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
        onToolEvent: (event) => emitToolEvent(event),
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
          },
        },
      };
      return runMastraCanonicalChatStream(aiArgs);
    },
    title: ({ completed }) => ({
      firstUser: extractUserMessageText(input.userMessage),
      firstAssistant: completed.text,
    }),
    // Phase 2 (Q10): when the evidence gate blocks a turn, do not concatenate
    // refusal text onto already-streamed unverified tokens. If no text had
    // streamed yet, the runner yields the refusal string; otherwise it emits
    // `data-evidence-blocked` so the live UI replaces the unverified text.
    recoverCompletion: async ({ error, streamedAnyText, runId, messageId, postTextEvents }) => {
      if (!(error instanceof CanonicalEvidenceBlockedError)) return null;
      const { events, refusalMessage } = buildEvidenceBlockedArtifacts(
        messageId,
        runId,
        error.findings,
      );
      postTextEvents.push(...events);
      return {
        ...(streamedAnyText ? {} : { yieldText: CANONICAL_EVIDENCE_BLOCKED_MESSAGE }),
        assistantMessage: refusalMessage,
      };
    },
    finalize: async ({ runId, messageId, postTextEvents, completed, observedCost }) => {
      // If the silent self-correction pass rewrote the draft, instruct the
      // live UI to replace the streamed draft with the verified text.
      if (completed.repaired) {
        postTextEvents.push({
          type: 'data-evidence-blocked',
          id: messageId,
          data: { message: completed.text, repaired: true },
        });
      }

      const memoryDegradedPart = buildMemoryDegradedPart(completed.memoryMode);
      if (memoryDegradedPart) {
        postTextEvents.push({
          type: 'data-memory-degraded',
          id: messageId,
          reason: memoryDegradedPart.reason,
          createdAt: memoryDegradedPart.createdAt,
        });
      }

      const metaData = buildCanonicalMetaData(completed, runId, observedCost);
      postTextEvents.push({
        type: 'data-multi-agent-meta',
        id: messageId,
        data: metaData,
      });

      return buildCanonicalAssistantMessage(
        messageId,
        completed.toolParts ?? [],
        completed.text,
        memoryDegradedPart,
        metaData,
        completed.fallbackParts ?? [],
      );
    },
  });
}
