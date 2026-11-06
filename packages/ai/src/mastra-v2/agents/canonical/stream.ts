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

// Token-streaming canonical chat turn.

import { metrics } from '@kestrel/shared';

import { getDiagnosticContext, persistDiagnosticContext, withDiagnostics } from '@ai/diagnostics';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';
import { withToolContext } from '@ai/runtime/tool-context';

import { manifestForCapability } from '../../capabilities';
import {
  beginMastraRun,
  createMastraRunFinalizer,
  mastraOutcomeForError,
  type MastraRunObservation,
} from '../../shared/telemetry';
import { runTracingOptions } from '../../telemetry';
import { openCanonicalAttempt } from './attempt';
import { setupCanonicalChat } from './setup';
import { finalizeCanonicalTurn } from './finalize';
import type { MastraCanonicalChatStream, RunMastraCanonicalChatArgs } from './types';

export async function runMastraCanonicalChatStream(
  args: RunMastraCanonicalChatArgs,
): Promise<MastraCanonicalChatStream> {
  const runId = args.runId ?? crypto.randomUUID();
  // Phase 1 (observability roadmap) — the streaming turn owns its diagnostic
  // scope for its whole lifetime. `deferCompletion` keeps the trace from being
  // persisted when the HTTP response handle returns; the stream's terminal
  // finalizer persists it once the stream (or its error path) finishes.
  return withDiagnostics(
    args.userId,
    args.threadId,
    () => executeCanonicalChatStream(args, runId),
    { deferCompletion: true, traceId: runId, runId },
  );
}

async function executeCanonicalChatStream(
  args: RunMastraCanonicalChatArgs,
  runId: string,
): Promise<MastraCanonicalChatStream> {
  const diagCtx = getDiagnosticContext();
  const startedAt = Date.now();
  const setup = await setupCanonicalChat({ ...args, runId });
  const generationLedger = args.ledger ?? createGenerationLedger();
  const { agent, routing, resolution, callMemory, requestContext, context, messages, scorers } =
    setup;
  beginMastraRun({
    runId,
    threadId: args.threadId,
    model: resolution.modelId,
    providerId: resolution.providerId,
    telemetryKind: 'mastra_canonical_chat',
  });

  const finishMastra = createMastraRunFinalizer();
  let terminalPromise: Promise<void> | null = null;
  // One terminal finalizer for the stream: the run record and the diagnostic
  // trace land together, exactly once, when the stream completes or fails.
  const finishRun = (obs: MastraRunObservation): Promise<void> => {
    terminalPromise ??= (async () => {
      await finishMastra(obs);
      await persistDiagnosticContext(diagCtx, obs.outcome === 'success' ? 'completed' : 'failed');
    })();
    return terminalPromise;
  };

  // R14 — a rate limit or 5xx mid-turn continues on the user's next
  // configured model. The chain is empty when the plan pinned a snapshot or
  // the user has no other provider.
  const {
    output,
    resolution: activeResolution,
    fallbackParts,
  } = await openCanonicalAttempt({
    run: args,
    runId,
    primary: resolution,
    domain: routing.domain === 'generic' ? 'summary' : routing.domain,
    stream: (candidate) =>
      withToolContext(context, () =>
        agent.stream(messages, {
          requestContext,
          // Per-call model keeps one agent (tools, memory, guardrails)
          // while the provider behind it changes (R14).
          model: candidate.model as never,
          ...(callMemory ? { memory: callMemory } : {}),
          toolChoice: 'auto',
          maxSteps: Math.min(
            args.env.MAX_TOOL_ITERATIONS ?? manifestForCapability('canonical-chat').maxSteps,
            manifestForCapability('canonical-chat').maxSteps,
          ),
          ...(Object.keys(scorers.entries).length > 0 ? { scorers: scorers.entries } : {}),
          ...(args.signal ? { abortSignal: args.signal } : {}),
          tracingOptions: runTracingOptions({
            runId,
            userId: args.userId,
            threadId: args.threadId,
            kind: 'mastra_canonical_chat',
            capabilityId: 'canonical-chat',
            tags: ['chat'],
            memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
            memoryBackfill: setup.memoryBackfill,
          }),
        }),
      ),
    onFailure: async (failed, error) => {
      // The stream was never created: record exactly one terminal run for the
      // model whose attempt failed so the breaker learns about it.
      await finishRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: failed.modelId,
        providerId: failed.providerId,
        startedAt,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        steps: 0,
        outcome: mastraOutcomeForError(error, args.signal),
        memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: setup.memoryBackfill,
        telemetryKind: 'mastra_canonical_chat',
        error,
      });
    },
  });
  if (fallbackParts.length > 0) {
    metrics.increment('provider_fallback_total', {
      tags: { kind: 'mastra_canonical_chat', model: resolution.modelId },
    });
  }

  async function* textIter(): AsyncIterable<string> {
    try {
      for await (const chunk of output.textStream) {
        if (args.signal?.aborted) {
          throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        yield chunk;
      }
    } catch (error) {
      await finishRun({
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
        memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: setup.memoryBackfill,
        telemetryKind: 'mastra_canonical_chat',
        error,
      });
      throw error;
    }
  }

  const completion = (async () => {
    try {
      const full = await output.getFullOutput();
      return finalizeCanonicalTurn({
        run: args,
        runId,
        startedAt,
        setup,
        activeResolution,
        generationLedger,
        output: full,
        fallbackParts,
        outcome: args.signal?.aborted
          ? mastraOutcomeForError(args.signal.reason, args.signal)
          : 'success',
        finishRun,
      });
    } catch (error) {
      await finishRun({
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
        memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: setup.memoryBackfill,
        telemetryKind: 'mastra_canonical_chat',
        error,
      });
      throw error;
    }
  })();

  return { text: textIter(), completion };
}
