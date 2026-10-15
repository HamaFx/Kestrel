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
  estimateCostUsd,
  extractUserMessageText,
  reserveTurnBudget,
} from '@kestrel/ai';
import {
  CANONICAL_EVIDENCE_BLOCKED_MESSAGE,
  CanonicalEvidenceBlockedError,
  runMastraCanonicalChatStream,
  type ExecutionPlan,
  type MastraCanonicalChatStream,
  type RunMastraCanonicalChatArgs,
  type SemanticRoutingAccounting,
} from '@kestrel/ai/mastra';
import { listMessages } from '@kestrel/ai/persistence';
import { getUserWithSettings } from '@kestrel/db';
import { MemoryDegradedPartSchema, type ChatStreamEvent } from '@kestrel/shared';
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

    const liveToolEvents: ChatStreamEvent[] = [];
    const emittedToolCallIds = new Set<string>();

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
      onToolEvent: (ev) => {
        emittedToolCallIds.add(ev.toolCallId);
        liveToolEvents.push(ev);
      },
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
    const stream: MastraCanonicalChatStream = await runMastraCanonicalChatStream(aiArgs);
    const messageId = crypto.randomUUID();
    let terminalStatus: 'persisted' | 'persistence-failed' | 'interrupted' | 'failed' = 'failed';
    const postTextEvents: ChatStreamEvent[] = [];

    // Build a lazy stream iterable that yields live tool events and text chunks,
    // then persists tool parts + text + metadata once the stream completes.
    async function* text(): AsyncIterable<string | ChatStreamEvent> {
      let streamedAnyText = false;
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
          if (chunk.length > 0) {
            streamedAnyText = true;
            yield chunk;
          }
        }
        while (liveToolEvents.length > 0) {
          const ev = liveToolEvents.shift();
          if (ev) yield ev;
        }
        let completed: Awaited<MastraCanonicalChatStream['completion']>;
        try {
          completed = await stream.completion;
        } catch (error) {
          if (!(error instanceof CanonicalEvidenceBlockedError)) throw error;
          // Phase 2 (Q10): Do NOT concatenate refusal text onto already-streamed
          // unverified tokens. If no text had streamed yet, yield the refusal
          // string; otherwise emit `data-evidence-blocked` so the live UI
          // replaces the unverified text cleanly.
          if (!streamedAnyText) {
            yield CANONICAL_EVIDENCE_BLOCKED_MESSAGE;
          }
          postTextEvents.push({
            type: 'data-evidence-blocked',
            id: messageId,
            data: { message: CANONICAL_EVIDENCE_BLOCKED_MESSAGE, repaired: false },
          });
          const refusalMetaData = {
            engine: 'mastra',
            canonical: true,
            runId,
            executionOutcome: 'completed',
            answerOutcome: 'blocked',
            evidence: { ok: false, findings: [...error.findings] },
            terminalReason: 'canonical-evidence-blocked',
          };
          postTextEvents.push({
            type: 'data-multi-agent-meta',
            id: messageId,
            data: refusalMetaData,
          });
          const refusalMessage: UIMessage = {
            id: messageId,
            role: 'assistant',
            parts: [
              { type: 'text', text: CANONICAL_EVIDENCE_BLOCKED_MESSAGE },
              {
                type: 'data-multi-agent-meta',
                data: refusalMetaData,
              } as UIMessage['parts'][number],
            ],
          };
          try {
            await appendAssistantMessage(input.userId, input.threadId, refusalMessage, {
              idempotencyKey: `mastra-canonical:${input.threadId}:${input.userMessage.id}:assistant`,
            });
            terminalStatus = 'persisted';
          } catch {
            terminalStatus = 'persistence-failed';
          }
          await finalizer.complete(ledger.total());
          return;
        }

        // Emit any tool parts discovered from completion messages that were not
        // already emitted live (e.g. from self-correction or mocked responses).
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

        // If the silent self-correction pass rewrote the draft, instruct the
        // live UI to replace the streamed draft with the verified text.
        if (completed.repaired) {
          postTextEvents.push({
            type: 'data-evidence-blocked',
            id: messageId,
            data: { message: completed.text, repaired: true },
          });
        }

        // P2-06: title spend lands in the per-turn ledger, so await the
        // (bounded) title call before snapshotting the cost and settling the
        // budget. `maybeGenerateThreadTitle` never throws and persists the
        // deterministic fallback title on timeout, so this cannot strand the
        // stream tail.
        await maybeGenerateThreadTitle({
          userId: input.userId,
          threadId: input.threadId,
          firstUser: extractUserMessageText(input.userMessage),
          firstAssistant: completed.text,
          ledger,
          ledgerId: `title:${runId}`,
        });

        const observedCost = ledger.total();
        const memoryDegradedPart =
          completed.memoryMode === 'degraded'
            ? MemoryDegradedPartSchema.parse({
                type: 'data-memory-degraded',
                reason: 'Thread memory was unavailable; answered without semantic recall.',
                createdAt: Date.now(),
              })
            : null;
        if (memoryDegradedPart) {
          postTextEvents.push({
            type: 'data-memory-degraded',
            id: messageId,
            reason: memoryDegradedPart.reason,
            createdAt: memoryDegradedPart.createdAt,
          });
        }

        const metaData = {
          engine: 'mastra',
          canonical: true,
          runId,
          routingDomain: completed.routing.domain,
          modelId: completed.modelId,
          providerId: completed.providerId,
          observedCost,
          totalCostUsd: observedCost,
          totalLatencyMs: completed.totalLatencyMs,
          toolNames: completed.toolNames,
          evidence: completed.evidence,
          executionOutcome: 'completed',
          answerOutcome: completed.answerOutcome,
          memoryMode: completed.memoryMode,
          memoryBackfill: completed.memoryBackfill,
          modelSnapshot: completed.modelSnapshot,
          terminalReason: 'stream-completed',
        };
        postTextEvents.push({
          type: 'data-multi-agent-meta',
          id: messageId,
          data: metaData,
        });

        const assistantMessage: UIMessage = {
          id: messageId,
          role: 'assistant',
          parts: [
            ...(toolParts as unknown as UIMessage['parts']),
            { type: 'text', text: completed.text },
            ...(memoryDegradedPart
              ? [memoryDegradedPart as unknown as UIMessage['parts'][number]]
              : []),
            {
              type: 'data-multi-agent-meta',
              data: metaData,
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
      onAbort: async () => {
        terminalStatus = 'interrupted';
        await finalizer.abort();
      },
      onComplete: () => (terminalStatus === 'persisted' ? 'persisted' : terminalStatus),
    });
  } catch (error) {
    if (input.signal?.aborted) await finalizer.abort();
    else await finalizer.fail();
    throw error;
  }
}
