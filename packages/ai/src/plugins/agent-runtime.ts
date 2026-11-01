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

// Streaming and buffered runs for standalone user-authored agents.

import type { UserSettingsRow } from '@kestrel/db/schema';
import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai';

import { estimateCostUsd } from '@ai/budget/cost';
import {
  MAX_TURN_FALLBACKS,
  resolveFallbackChain,
  runWithModelFallback,
  type FallbackPartPayload,
} from '@ai/models/model';
import type { GenerationLedger } from '@ai/persistence/generation-ledger';
import { withRetry } from '@ai/runtime/retry';
import { withToolContext } from '@ai/runtime/tool-context';

import { latestUserModelMessages } from '../mastra-v2/agents/canonical/prompts';
import {
  extractToolPartsFromMessages,
  type MastraToolInvocationPart,
  type MastraToolStreamEvent,
} from '../mastra-v2/agents/xauusd/legacy-tool-adapter';
import { KESTREL_MEMORY_LAST_MESSAGES } from '../mastra-v2/memory';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from '../mastra-v2/shared/telemetry';
import { runTracingOptions } from '../mastra-v2/telemetry';
import {
  buildCustomAgent,
  type CustomAgentEnv,
  type CustomAgentPreferences,
} from './agent-builder';
import type { CustomAgentDescriptor } from './agent-catalog';
import type { InstalledPluginRuntime } from './runtime';

async function messageHistory(
  history: readonly UIMessage[],
  latest: UIMessage,
): Promise<ModelMessage[]> {
  const source = history.some((message) => message.id === latest.id)
    ? history
    : [...history, latest];
  const sliced = source.slice(-KESTREL_MEMORY_LAST_MESSAGES);
  let totalChars = 0;
  const bounded: UIMessage[] = [];
  for (let i = sliced.length - 1; i >= 0; i--) {
    const msg = sliced[i]!;
    const charCount = msg.parts ? JSON.stringify(msg.parts).length : 0;
    if (bounded.length > 0 && totalChars + charCount > 60_000) break;
    totalChars += charCount;
    bounded.unshift(msg);
  }
  // R7: references stay unresolved; the provider-boundary middleware inlines
  // them, so Mastra never persists the bytes.
  return await convertToModelMessages(
    bounded.map((message) => ({ id: message.id, role: message.role, parts: message.parts })),
  );
}

export interface CustomAgentStreamArgs {
  runtime: InstalledPluginRuntime;
  descriptor: CustomAgentDescriptor;
  settings: UserSettingsRow;
  env: CustomAgentEnv;
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  history: readonly UIMessage[];
  /** Prompt with any leading `@handle` stripped. */
  prompt: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  excludeMessageIdempotencyKey?: string;
  ledger?: GenerationLedger;
  preferences?: CustomAgentPreferences;
  /** Shared run id from the web service (telemetry + persisted meta). */
  runId?: string;
  onToolEvent?: (event: MastraToolStreamEvent) => void;
}

export interface CustomAgentStreamResult {
  text: AsyncIterable<string>;
  completion: Promise<{
    text: string;
    stats: ReturnType<typeof getMastraGenerationStats>;
    toolNames: string[];
    toolParts: MastraToolInvocationPart[];
    modelId: string;
    providerId: string;
    totalCostUsd: number;
    totalLatencyMs: number;
    /** `data-fallback` parts emitted when a mid-turn provider switch happened (R14). */
    fallbackParts?: FallbackPartPayload[];
    memoryMode: 'native' | 'degraded';
    memoryBackfill: boolean;
    modelSnapshot: { providerId: string; bareModelId: string };
  }>;
}

/** Stream one standalone-agent turn (chat / `@mention`). */
export async function runCustomAgentStream(
  args: CustomAgentStreamArgs,
): Promise<CustomAgentStreamResult> {
  const startedAt = Date.now();
  const built = await buildCustomAgent({
    runtime: args.runtime,
    descriptor: args.descriptor,
    settings: args.settings,
    env: args.env,
    userId: args.userId,
    threadId: args.threadId,
    ...(args.modelOverride !== undefined ? { modelOverride: args.modelOverride } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
    ...(args.excludeMessageIdempotencyKey
      ? { excludeMessageIdempotencyKey: args.excludeMessageIdempotencyKey }
      : {}),
    ...(args.preferences ? { preferences: args.preferences } : {}),
    ...(args.runId ? { runId: args.runId } : {}),
    memoryBackfill: true,
    ...(args.onToolEvent ? { onToolEvent: args.onToolEvent } : {}),
  });

  const runId = String(built.requestContext.get('runId') ?? crypto.randomUUID());
  beginMastraRun({
    runId,
    threadId: args.threadId,
    model: built.modelId,
    providerId: built.providerId,
  });

  built.toolContext.latestUserMessageText = args.prompt;
  // The stored prompt text replaces the raw text (@handle), but the turn's
  // attachments must still reach the provider (inlined at the model boundary).
  const latestUserMessage: UIMessage = {
    ...args.userMessage,
    parts: [
      { type: 'text', text: args.prompt },
      ...(args.userMessage.parts ?? []).filter((part) => part.type === 'file'),
    ],
  };
  const messages = built.callMemory
    ? await latestUserModelMessages(latestUserMessage)
    : await messageHistory(args.history, latestUserMessage);

  // R14 — custom agents previously had no retry and no mid-turn failover.
  // The chain is the user's configured providers; `built` owns the primary.
  const fallbackCandidates = resolveFallbackChain({
    settings: args.settings,
    env: args.env,
    domain: 'summary',
    primaryModelId: built.modelId,
  });
  // Attribute a terminal failure to the model whose attempt failed.
  let lastAttemptedResolution = built.resolution;
  const openAttempt = async () => {
    try {
      return await runWithModelFallback({
        primary: built.resolution,
        candidates: fallbackCandidates,
        signal: args.signal,
        maxFallbacks: MAX_TURN_FALLBACKS,
        onAttempt: (attempted) => {
          lastAttemptedResolution = attempted;
        },
        attempt: (candidate) =>
          withToolContext(built.toolContext, () =>
            withRetry(
              () =>
                built.agent.stream(messages, {
                  requestContext: built.requestContext,
                  // Per-call model keeps the one built agent; a provider failure
                  // switches provider without rebuilding tools/memory (R14).
                  model: candidate.model as never,
                  ...(built.callMemory ? { memory: built.callMemory } : {}),
                  toolChoice: 'auto',
                  maxSteps: 8,
                  ...(args.signal ? { abortSignal: args.signal } : {}),
                  tracingOptions: runTracingOptions({
                    runId,
                    userId: args.userId,
                    threadId: args.threadId,
                    kind: 'mastra_custom_agent',
                    capabilityId: 'canonical-chat',
                    tags: ['chat', 'custom-agent', args.descriptor.agent.slug],
                    memoryMode: built.memoryMode,
                    memoryBackfill: built.memoryBackfill,
                  }),
                }),
              { maxAttempts: 2, signal: args.signal },
            ),
          ),
      });
    } catch (error) {
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: lastAttemptedResolution.modelId,
        providerId: lastAttemptedResolution.providerId,
        startedAt,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        steps: 0,
        outcome: mastraOutcomeForError(error, args.signal),
        memoryMode: built.memoryMode,
        memoryBackfill: built.memoryBackfill,
        telemetryKind: 'mastra_custom_agent',
        error,
      });
      throw error;
    }
  };
  const { result: output, resolution: activeResolution, fallbackParts } = await openAttempt();

  async function* textIter(): AsyncIterable<string> {
    try {
      for await (const chunk of output.textStream) {
        if (args.signal?.aborted) {
          throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        if (chunk.length > 0) yield chunk;
      }
    } catch (error) {
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: activeResolution.modelId,
        providerId: activeResolution.providerId,
        startedAt,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        steps: 0,
        outcome: mastraOutcomeForError(error, args.signal),
        memoryMode: built.memoryMode,
        memoryBackfill: built.memoryBackfill,
        telemetryKind: 'mastra_custom_agent',
        error,
      });
      throw error;
    }
  }

  const completion = (async () => {
    try {
      const full = await output.getFullOutput();
      const stats = getMastraGenerationStats(full);
      const toolParts = extractToolPartsFromMessages(
        full.response?.messages,
        built.toolPartsBuffer,
      );
      const toolNames = [...new Set(toolParts.map((part) => part.toolName))];
      const cost = estimateCostUsd(activeResolution.modelId, stats.inputTokens, stats.outputTokens);
      args.ledger?.recordCost(`custom-agent:${runId}`, 'primary', cost);
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: activeResolution.modelId,
        providerId: activeResolution.providerId,
        startedAt,
        ...stats,
        outcome: 'success',
        answerOutcome: full.text.trim().length > 0 ? 'ready' : 'degraded',
        memoryMode: built.memoryMode,
        memoryBackfill: built.memoryBackfill,
        modelSnapshot: {
          providerId: activeResolution.providerId,
          bareModelId: activeResolution.bareModelId,
        },
        telemetryKind: 'mastra_custom_agent',
      });
      return {
        text: full.text.trim(),
        stats,
        toolNames,
        toolParts,
        modelId: activeResolution.modelId,
        providerId: activeResolution.providerId,
        totalCostUsd: cost,
        totalLatencyMs: Date.now() - startedAt,
        memoryMode: built.memoryMode,
        memoryBackfill: built.memoryBackfill,
        ...(fallbackParts.length > 0 ? { fallbackParts } : {}),
        modelSnapshot: {
          providerId: activeResolution.providerId,
          bareModelId: activeResolution.bareModelId,
        },
      };
    } catch (error) {
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: activeResolution.modelId,
        providerId: activeResolution.providerId,
        startedAt,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        steps: 0,
        outcome: mastraOutcomeForError(error, args.signal),
        memoryMode: built.memoryMode,
        memoryBackfill: built.memoryBackfill,
        telemetryKind: 'mastra_custom_agent',
        error,
      });
      throw error;
    }
  })();

  return { text: textIter(), completion };
}
