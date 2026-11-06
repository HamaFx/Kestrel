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

// Buffered canonical chat turn.

import { metrics } from '@kestrel/shared';

import { getDiagnosticContext, withDiagnostics } from '@ai/diagnostics';
import { MAX_TURN_FALLBACKS, resolveFallbackChain, runWithModelFallback } from '@ai/models/model';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';
import { withRetry } from '@ai/runtime/retry';
import { withToolContext } from '@ai/runtime/tool-context';

import { manifestForCapability } from '../../capabilities';
import { beginMastraRun, finishMastraRun, mastraOutcomeForError } from '../../shared/telemetry';
import { runTracingOptions } from '../../telemetry';
import { setupCanonicalChat } from './setup';
import { finalizeCanonicalTurn } from './finalize';
import type { MastraCanonicalChatResult, RunMastraCanonicalChatArgs } from './types';

export async function runMastraCanonicalChat(
  args: RunMastraCanonicalChatArgs,
): Promise<MastraCanonicalChatResult> {
  const runId = args.runId ?? crypto.randomUUID();
  // Phase 1 (observability roadmap) — the buffered canonical turn owns its
  // diagnostic scope so every turn writes a durable `diagnostic_traces` row
  // correlated by `traceId`/`runId`. A caller that already opened a scope
  // (e.g. an outer orchestration) reuses it instead of double-persisting.
  if (getDiagnosticContext()) return executeCanonicalChat(args, runId);
  return withDiagnostics(args.userId, args.threadId, () => executeCanonicalChat(args, runId), {
    traceId: runId,
    runId,
  });
}

async function executeCanonicalChat(
  args: RunMastraCanonicalChatArgs,
  runId: string,
): Promise<MastraCanonicalChatResult> {
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
  // The resolution that actually produced the answer; a mid-turn provider
  // switch (R14) replaces it, and the catch path must report it too.
  let activeResolution = resolution;

  try {
    // R14 — identical failover policy to the streaming canonical turn: an
    // immutable execution-plan snapshot pins the model, otherwise a transient
    // failure continues on the user's next configured provider.
    const snapshotPinned = args.executionPlan?.model;
    const fallbackCandidates = snapshotPinned
      ? []
      : resolveFallbackChain({
          settings: args.settings,
          env: args.env,
          domain: routing.domain === 'generic' ? 'summary' : routing.domain,
          primaryModelId: resolution.modelId,
        });
    const {
      result,
      resolution: attemptedResolution,
      fallbackParts,
    } = await runWithModelFallback({
      primary: resolution,
      candidates: fallbackCandidates,
      signal: args.signal,
      maxFallbacks: MAX_TURN_FALLBACKS,
      onAttempt: (attempted) => {
        activeResolution = attempted;
      },
      attempt: (candidate) =>
        withToolContext(context, () =>
          withRetry(
            () =>
              agent.generate(messages, {
                requestContext,
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
            { maxAttempts: 2, signal: args.signal },
          ),
        ),
    });
    activeResolution = attemptedResolution;
    if (fallbackParts.length > 0) {
      metrics.increment('provider_fallback_total', {
        tags: { kind: 'mastra_canonical_chat', model: resolution.modelId },
      });
    }
    return finalizeCanonicalTurn({
      run: args,
      runId,
      startedAt,
      setup,
      activeResolution,
      generationLedger,
      output: result,
      fallbackParts,
      outcome: 'success',
      finishRun: finishMastraRun,
    });
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
      memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: setup.memoryBackfill,
      telemetryKind: 'mastra_canonical_chat',
      error,
    });
    throw error;
  }
}
