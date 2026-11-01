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

// R14 — bounded failover/retry for the streaming XAUUSD conversation, plus
// the blocked-packet result builder. Extracted from `conversation-stream.ts`
// to keep both modules under the maintainability limit.

import {
  MAX_TURN_FALLBACKS,
  resolveFallbackChain,
  runWithModelFallback,
  type ChatModelResolution,
  type FallbackPartPayload,
} from '@ai/models/model';
import { withRetry } from '@ai/runtime/retry';

import type { XauusdResearchPacket } from '../../packets/research-types';
import type { MastraGenerationStats } from '../../shared/stats';
import { finishMastraRun } from '../../shared/telemetry';
import type { RunXauusdMastraArgs, XauusdMastraConversationStream } from './run-types';

export interface OpenXauusdConversationStreamArgs<T> {
  run: RunXauusdMastraArgs;
  primary: ChatModelResolution;
  /** One generation attempt on the given model (retry policy stays here). */
  stream: (candidate: ChatModelResolution) => Promise<T>;
  /** Called with every attempted resolution before it starts. */
  onAttempt?: (resolution: ChatModelResolution) => void;
}

/**
 * Run the streaming conversation on the primary model, then on the user's
 * next configured model for a classified recoverable failure. Each attempt
 * gets one bounded retry, matching the canonical chat path.
 */
export async function openXauusdConversationStream<T>(
  args: OpenXauusdConversationStreamArgs<T>,
): Promise<{
  output: T;
  resolution: ChatModelResolution;
  fallbackParts: FallbackPartPayload[];
}> {
  const fallback = await runWithModelFallback({
    primary: args.primary,
    candidates: args.run.executionPlan?.model
      ? []
      : resolveFallbackChain({
          settings: args.run.settings,
          env: args.run.env,
          domain: 'technical',
          primaryModelId: args.primary.modelId,
        }),
    signal: args.run.signal,
    maxFallbacks: MAX_TURN_FALLBACKS,
    ...(args.onAttempt ? { onAttempt: args.onAttempt } : {}),
    attempt: (candidate) =>
      withRetry(() => args.stream(candidate), { maxAttempts: 2, signal: args.run.signal }),
  });
  return {
    output: fallback.result,
    resolution: fallback.resolution,
    fallbackParts: fallback.fallbackParts,
  };
}

/** Build the deterministic blocked-packet response and its terminal record. */
export async function blockedConversationStream(args: {
  run: RunXauusdMastraArgs;
  packet: XauusdResearchPacket;
  resolution: ChatModelResolution;
  startedAt: number;
  stats: MastraGenerationStats;
  text: string;
  memoryDegraded: boolean;
  backfillAttempted: boolean;
}): Promise<XauusdMastraConversationStream> {
  const { run } = args;
  await finishMastraRun({
    userId: run.userId,
    threadId: run.threadId,
    runId: run.runId,
    model: args.resolution.modelId,
    providerId: args.resolution.providerId,
    startedAt: args.startedAt,
    ...args.stats,
    outcome: 'success',
    memoryMode: args.memoryDegraded ? 'degraded' : 'native',
    memoryBackfill: args.backfillAttempted,
    ...(run.telemetryKind ? { telemetryKind: run.telemetryKind } : {}),
  });
  return {
    text: (async function* () {
      yield args.text;
    })(),
    completion: Promise.resolve({
      result: { text: args.text },
      packet: args.packet,
      modelId: args.resolution.modelId,
      providerId: args.resolution.providerId,
      bareModelId: args.resolution.bareModelId,
      stats: args.stats,
      toolParts: [],
      totalCostUsd: 0,
      answerOutcome: 'blocked' as const,
      modelSnapshot: {
        providerId: args.resolution.providerId,
        bareModelId: args.resolution.bareModelId,
      },
      memoryMode: (args.memoryDegraded ? 'degraded' : 'native') as 'native' | 'degraded',
      memoryBackfill: args.backfillAttempted,
    }),
  };
}
