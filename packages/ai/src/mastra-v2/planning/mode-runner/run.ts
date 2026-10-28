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

/**
 * Mode runner (Phase 2) — delegates Quick/Standard/Full committee analysis
 * to the shared committee workflow (see `../committee/workflow.ts`). This
 * module owns the pieces
 * Kestrel must keep: BYOK model resolution, telemetry, per-call memory, the
 * result contract (opinions + packet + stats), and the strict Full-mode
 * failure mapping. The committee itself (specialist steps, per-step retries,
 * verify, fusion) lives in the workflow so repair/verification behavior is
 * observable as workflow run snapshots.
 */

import { assetClassForSymbol, metrics } from '@kestrel/shared';

import { rememberMarketRegime } from '@ai/memory/memory-index';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';

import { logWorkflowError } from '../../logger';
import { kestrelMemoryOptions } from '../../memory';
import { prepareResearchRunContext } from '../../research-context';
import { beginMastraRun, finishMastraRun, mastraOutcomeForError } from '../../shared/telemetry';
import { assertExecutionPlanRoute } from '../execution-plan';
import { startModeWorkflow } from './committee-run';
import { committeeModelResolver, resolveMastraModeModel } from './model-resolution';
import { mapBlockedResult, mapReadyResult, type ModeWorkflowOutput } from './results';
import { expectedModeExecutionPlanRoute } from './route';
import { buildToolContext } from './run-context';
import type { MastraModeResult, RunMastraModeArgs } from './types';

export async function runMastraMode(args: RunMastraModeArgs): Promise<MastraModeResult> {
  const comparisonSymbols = [...new Set(args.symbols ?? [])];
  const isComparison = comparisonSymbols.length >= 2;
  // C-02 (audit 2026-10-18) — per-asset-class telemetry so committee cost and
  // latency are attributable per asset class instead of XAUUSD-only.
  const assetClass = isComparison
    ? 'multi-symbol'
    : (assetClassForSymbol(args.symbol) ?? 'unknown');
  if (args.executionPlan) {
    assertExecutionPlanRoute(
      args.executionPlan,
      expectedModeExecutionPlanRoute(args.mode, isComparison),
    );
  }
  metrics.increment('committee_execution_total', {
    tags: { assetClass, mode: args.mode, route: isComparison ? 'comparison' : 'symbol' },
  });
  const startedAt = Date.now();
  const generationLedger = args.ledger ?? createGenerationLedger();
  const resolution = resolveMastraModeModel(
    args.settings,
    args.env,
    args.modelOverride,
    args.executionPlan,
  );
  // Until preparation succeeds, a memory-dependent run is degraded. This
  // prevents setup failures from being reported as healthy native memory.
  let memoryMode: 'native' | 'degraded' = 'degraded';
  let memoryBackfill = false;
  beginMastraRun({
    runId: args.runId,
    threadId: args.threadId,
    model: resolution.modelId,
    providerId: resolution.providerId,
  });

  try {
    // The worker's durable Full-mode path is long-lived, so observational
    // memory (background observation agents) is safe to enable there.
    // Vercel paths keep it off (short-lived functions).
    // Shared research-run context (Phase 7): native memory preparation plus
    // research guardrails/scorers, identical to the XAUUSD research paths.
    const memoryOptions =
      args.telemetryKind === 'mastra_full_job'
        ? kestrelMemoryOptions({
            env: args.env,
            forceObservationalMemory: true,
            // Capability-specific semantic recall from the execution plan
            // (Phase 9): the manifest default wins over the global gate.
            ...(args.executionPlan
              ? { semanticRecall: args.executionPlan.memoryPolicy.semanticRecall }
              : {}),
          })
        : undefined;
    const runContext = await prepareResearchRunContext({
      userId: args.userId,
      threadId: args.threadId,
      settings: {
        aiApiKeys: args.settings.aiApiKeys,
        chatModel: args.settings.chatModel ?? null,
        ...(args.settings.embeddingModel !== undefined
          ? { embeddingModel: args.settings.embeddingModel }
          : {}),
        defaultSymbol: args.settings.defaultSymbol ?? null,
        language: args.settings.language ?? null,
        timezone: args.settings.timezone ?? null,
      },
      env: args.env,
      includeResearchPolicies: true,
      // Audit plan §1.2: guardrail mode from the capability manifest.
      guardrailMode: args.executionPlan?.guardrail.mode ?? 'strict',
      // P2-03: reuse the resolved run model for the injection detector
      // instead of resolving the user's model a second time.
      guardrailModel: resolution.model,
      ...(memoryOptions ? { memoryOptions } : {}),
      ...(args.backfillExcludeMessageIdempotencyKey
        ? { backfillExcludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
        : {}),
    });
    const prepared = runContext.prepared;
    memoryMode = prepared.memoryDegraded ? 'degraded' : 'native';
    memoryBackfill = prepared.backfillAttempted;
    // §3.1: per-agent top-tier committee models when the user configured them.
    const resolveModelForAgent = committeeModelResolver(args.settings, args.env);
    const toolContext = buildToolContext(args, generationLedger);
    const result = await startModeWorkflow({
      args,
      runContext,
      isComparison,
      comparisonSymbols,
      assetClass,
      resolution,
      resolveModelForAgent,
      toolContext,
      generationLedger,
      startedAt,
    });

    const output = result.result as ModeWorkflowOutput;
    if (output.status === 'blocked' || !output.finalText) {
      const stats = output.stats ?? { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 };
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        ...stats,
        outcome: 'success',
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
        ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      });
      return mapBlockedResult({
        output,
        mode: args.mode,
        runSymbol: args.symbol,
        stats,
        isComparison,
        comparisonSymbols,
        resolution,
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
        startedAt,
      });
    }

    const workflowCostUsd = output.totalCostUsd ?? 0;
    if (generationLedger.total() === 0 && workflowCostUsd > 0) {
      generationLedger.recordCost(`workflow:${args.runId}`, 'fusion', workflowCostUsd);
    }
    const totalCostUsd = generationLedger.total();
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      ...output.stats,
      outcome: 'success',
      memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: prepared.backfillAttempted,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
    });

    // Phase 3 (Jev roadmap) — record the JEPA-style market-regime descriptor for
    // this run's packet so later recalls can compare similar regimes. Best-effort:
    // a memory failure is telemetry-only and never fails the answer path.
    try {
      await rememberMarketRegime({
        packet: output.packet,
        userId: args.userId,
        env: {
          ...(args.env.AI_GATEWAY_API_KEY
            ? { AI_GATEWAY_API_KEY: args.env.AI_GATEWAY_API_KEY }
            : {}),
          ...(args.env.GOOGLE_GENERATIVE_AI_API_KEY
            ? { GOOGLE_GENERATIVE_AI_API_KEY: args.env.GOOGLE_GENERATIVE_AI_API_KEY }
            : {}),
          ...(args.env.AI_EMBEDDING_MODEL
            ? { AI_EMBEDDING_MODEL: args.env.AI_EMBEDDING_MODEL }
            : {}),
        },
        userSettings: {
          aiApiKeys: args.settings.aiApiKeys,
          embeddingModel: args.settings.embeddingModel ?? null,
        },
        signal: args.signal ?? null,
      });
    } catch (error) {
      metrics.increment('market_regime_memory_failed_total', {
        tags: { reason: error instanceof Error ? error.name : 'unknown' },
      });
    }

    return mapReadyResult({
      output: output as ModeWorkflowOutput & { finalText: string },
      mode: args.mode,
      isComparison,
      comparisonSymbols,
      resolution,
      totalCostUsd,
      memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: prepared.backfillAttempted,
      startedAt,
    });
  } catch (error) {
    logWorkflowError({
      runId: args.runId,
      workflowId: args.workflowId ?? 'symbol-research',
      stepId: args.mode,
      startedAt,
      message: 'Symbol-research workflow run failed',
      meta: { mode: args.mode, symbol: args.symbol },
      error,
    });
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome: mastraOutcomeForError(error, args.signal),
      memoryMode,
      memoryBackfill,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}
