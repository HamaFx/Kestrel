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

// Streaming runner for a user-authored standalone agent (`@handle`).
//
// It mirrors the canonical chat lifecycle (budget reservation, persistence,
// tool parts, title generation, memory-degradation metadata) but deliberately
// skips the market-evidence gate: a custom agent is a general-purpose persona,
// not Kestrel's verified market-report path.

import 'server-only';

import {
  appendAssistantMessage,
  appendUserMessage,
  createGenerationLedger,
  DEFAULT_MAX_DAILY_USD,
  extractUserMessageText,
  reserveTurnBudget,
} from '@kestrel/ai';
import { listMessages } from '@kestrel/ai/persistence';
import {
  recordCustomAgentRun,
  runCustomAgentStream,
  type CustomAgentDescriptor,
  type CustomAgentStreamResult,
  type InstalledPluginRuntime,
} from '@kestrel/ai/plugins';
import { getUserWithSettings } from '@kestrel/db';
import { MemoryDegradedPartSchema, type ChatStreamEvent } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra/chat-orchestrator';
import {
  createMastraStreamFinalizer,
  mastraStreamResponse,
} from '@/lib/services/mastra/stream-adapter';

export interface RunCustomAgentStreamInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  /** Prompt with the leading `@handle` removed. */
  prompt: string;
  descriptor: CustomAgentDescriptor;
  runtime: InstalledPluginRuntime;
  customInstructions?: string;
  responseStyle?: 'default' | 'concise' | 'technical' | 'risk-first';
  citeSources?: boolean;
  modelOverride?: string | null;
  signal?: AbortSignal;
}

interface LiveToolEvent {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function toolEventToStreamEvent(event: LiveToolEvent): ChatStreamEvent | null {
  if (event.state === 'input-available' || event.state === 'input-streaming') {
    return {
      type: 'tool-input-available',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input ?? null,
    };
  }
  if (event.state === 'output-available') {
    return {
      type: 'tool-output-available',
      toolCallId: event.toolCallId,
      output: event.output ?? null,
    };
  }
  if (event.state === 'output-error') {
    return {
      type: 'tool-output-error',
      toolCallId: event.toolCallId,
      errorText: event.errorText ?? 'Tool execution failed.',
    };
  }
  return null;
}

export async function runCustomAgentStreamService(
  input: RunCustomAgentStreamInput,
): Promise<Response> {
  const { settings } = await getUserWithSettings(input.userId);
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
          idempotencyKey: `mastra-custom-agent:${input.threadId}:${input.userMessage.id}:interrupted`,
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

    const stream: CustomAgentStreamResult = await runCustomAgentStream({
      runtime: input.runtime,
      descriptor: input.descriptor,
      settings,
      env,
      userId: input.userId,
      threadId: input.threadId,
      userMessage: input.userMessage,
      history,
      prompt: input.prompt,
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      excludeMessageIdempotencyKey: currentUserKey,
      ledger,
      runId,
      ...(input.customInstructions ||
      input.responseStyle !== undefined ||
      input.citeSources !== undefined
        ? {
            preferences: {
              ...(input.customInstructions ? { customInstructions: input.customInstructions } : {}),
              ...(input.responseStyle ? { responseStyle: input.responseStyle } : {}),
              ...(input.citeSources !== undefined ? { citeSources: input.citeSources } : {}),
            },
          }
        : {}),
      onToolEvent: (event) => {
        const mapped = toolEventToStreamEvent(event as unknown as LiveToolEvent);
        if (mapped && mapped.type === 'tool-output-available') {
          emittedToolCallIds.add(event.toolCallId);
        }
        if (mapped) liveToolEvents.push(mapped);
      },
    });

    const messageId = crypto.randomUUID();
    let terminalStatus: 'persisted' | 'persistence-failed' | 'interrupted' | 'failed' = 'failed';
    const postTextEvents: ChatStreamEvent[] = [];
    const startedAt = Date.now();

    async function* text(): AsyncIterable<string | ChatStreamEvent> {
      try {
        while (liveToolEvents.length > 0) {
          const event = liveToolEvents.shift();
          if (event) yield event;
        }
        for await (const chunk of stream.text) {
          while (liveToolEvents.length > 0) {
            const event = liveToolEvents.shift();
            if (event) yield event;
          }
          if (chunk.length > 0) yield chunk;
        }
        while (liveToolEvents.length > 0) {
          const event = liveToolEvents.shift();
          if (event) yield event;
        }

        const completed = await stream.completion;

        for (const part of completed.toolParts) {
          if (emittedToolCallIds.has(part.toolCallId)) continue;
          emittedToolCallIds.add(part.toolCallId);
          postTextEvents.push({
            type: 'tool-input-available',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          });
          if (part.state === 'output-available') {
            postTextEvents.push({
              type: 'tool-output-available',
              toolCallId: part.toolCallId,
              output: part.output ?? null,
            });
          } else if (part.state === 'output-error') {
            postTextEvents.push({
              type: 'tool-output-error',
              toolCallId: part.toolCallId,
              errorText: part.errorText ?? 'Tool execution failed.',
            });
          }
        }

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
          canonical: false,
          customAgent: {
            id: input.descriptor.agent.id,
            slug: input.descriptor.agent.slug,
            name: input.descriptor.agent.name,
            pluginId: input.descriptor.pluginId,
          },
          runId,
          modelId: completed.modelId,
          providerId: completed.providerId,
          observedCost,
          totalCostUsd: observedCost,
          totalLatencyMs: completed.totalLatencyMs,
          toolNames: completed.toolNames,
          executionOutcome: 'completed',
          answerOutcome: completed.text.length > 0 ? 'ready' : 'degraded',
          memoryMode: completed.memoryMode,
          memoryBackfill: completed.memoryBackfill,
          modelSnapshot: completed.modelSnapshot,
          terminalReason: 'stream-completed',
        };
        postTextEvents.push({ type: 'data-multi-agent-meta', id: messageId, data: metaData });

        const assistantMessage: UIMessage = {
          id: messageId,
          role: 'assistant',
          parts: [
            ...(completed.toolParts as unknown as UIMessage['parts']),
            { type: 'text', text: completed.text },
            ...(memoryDegradedPart
              ? [memoryDegradedPart as unknown as UIMessage['parts'][number]]
              : []),
            { type: 'data-multi-agent-meta', data: metaData } as UIMessage['parts'][number],
          ],
        };
        try {
          await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
            idempotencyKey: `mastra-custom-agent:${input.threadId}:${input.userMessage.id}:assistant`,
          });
          terminalStatus = 'persisted';
        } catch (error) {
          terminalStatus = 'persistence-failed';
          throw error;
        }

        await recordCustomAgentRun({
          runtime: input.runtime,
          descriptor: input.descriptor,
          runId,
          threadId: input.threadId,
          status: 'succeeded',
          model: completed.modelId,
          latencyMs: Date.now() - startedAt,
          costUsd: observedCost,
          toolCalls: completed.stats.toolCalls,
          inputChars: input.prompt.length,
          outputChars: completed.text.length,
        });
        await finalizer.complete(observedCost);
      } catch (error) {
        if (input.signal?.aborted) await finalizer.abort();
        else await finalizer.fail();
        await recordCustomAgentRun({
          runtime: input.runtime,
          descriptor: input.descriptor,
          runId,
          threadId: input.threadId,
          status: input.signal?.aborted ? 'cancelled' : 'failed',
          model: input.descriptor.agent.model ?? null,
          latencyMs: Date.now() - startedAt,
          costUsd: ledger.total(),
          toolCalls: 0,
          inputChars: input.prompt.length,
          outputChars: 0,
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
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
