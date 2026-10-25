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

// Buffered (Telegram / background) runs for standalone user-authored agents.

import type { UserSettingsRow } from '@kestrel/db/schema';

import { estimateCostUsd } from '@ai/budget/cost';
import { withToolContext } from '@ai/runtime/tool-context';

import { extractToolPartsFromMessages } from '../mastra-v2/agents/xauusd/legacy-tool-adapter';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from '../mastra-v2/shared/telemetry';
import { runTracingOptions } from '../mastra-v2/telemetry';
import { buildCustomAgent, type CustomAgentEnv } from './agent-builder';
import type { CustomAgentDescriptor } from './agent-catalog';
import type { InstalledPluginRuntime } from './runtime';

export interface CustomAgentTextArgs {
  runtime: InstalledPluginRuntime;
  descriptor: CustomAgentDescriptor;
  settings: UserSettingsRow;
  env: CustomAgentEnv;
  userId: string;
  threadId: string;
  prompt: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  /** Extra context prepended to the prompt (e.g. a Telegram market snapshot). */
  contextPrefix?: string;
}

export interface CustomAgentTextResult {
  text: string;
  modelId: string;
  providerId: string;
  toolNames: string[];
  totalCostUsd: number;
  totalLatencyMs: number;
  stats: ReturnType<typeof getMastraGenerationStats>;
}

/** Non-streaming standalone-agent turn (Telegram / background use). */
export async function runCustomAgentText(
  args: CustomAgentTextArgs,
): Promise<CustomAgentTextResult> {
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
    readOnlyOnly: true,
    includeMcp: true,
    memoryBackfill: false,
  });
  const runId = String(built.requestContext.get('runId') ?? crypto.randomUUID());
  const prompt = args.contextPrefix ? `${args.prompt}\n\n${args.contextPrefix}` : args.prompt;
  built.toolContext.latestUserMessageText = prompt;

  beginMastraRun({
    runId,
    threadId: args.threadId,
    model: built.modelId,
    providerId: built.providerId,
  });
  try {
    const result = await withToolContext(built.toolContext, () =>
      built.agent.generate(prompt, {
        requestContext: built.requestContext,
        ...(built.callMemory ? { memory: built.callMemory } : {}),
        toolChoice: 'auto',
        maxSteps: 6,
        ...(args.signal ? { abortSignal: args.signal } : {}),
        tracingOptions: runTracingOptions({
          runId,
          userId: args.userId,
          threadId: args.threadId,
          kind: 'mastra_custom_agent',
          capabilityId: 'canonical-chat',
          tags: ['bot', 'custom-agent', args.descriptor.agent.slug],
          memoryMode: built.memoryMode,
          memoryBackfill: built.memoryBackfill,
        }),
      }),
    );
    const stats = getMastraGenerationStats(result);
    const toolParts = extractToolPartsFromMessages(
      result.response?.messages,
      built.toolPartsBuffer,
    );
    const toolNames = [...new Set(toolParts.map((part) => part.toolName))];
    const cost = estimateCostUsd(built.modelId, stats.inputTokens, stats.outputTokens);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId,
      model: built.modelId,
      providerId: built.providerId,
      startedAt,
      ...stats,
      outcome: 'success',
      answerOutcome: result.text.trim().length > 0 ? 'ready' : 'degraded',
      memoryMode: built.memoryMode,
      memoryBackfill: built.memoryBackfill,
      modelSnapshot: built.modelSnapshot,
      telemetryKind: 'mastra_custom_agent',
    });
    return {
      text: result.text.trim(),
      modelId: built.modelId,
      providerId: built.providerId,
      toolNames,
      totalCostUsd: cost,
      totalLatencyMs: Date.now() - startedAt,
      stats,
    };
  } catch (error) {
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId,
      model: built.modelId,
      providerId: built.providerId,
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
