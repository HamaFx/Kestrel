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

// Execution of one claimed Full-analysis run: per-user admission, budget
// reservation, the Mastra Full workflow under the runId, assistant/title
// projection, and coordinator completion. Lease bookkeeping lives in the
// caller; this module owns the work that happens under that lease.

import {
  appendAssistantMessage,
  appendUserMessage,
  createExecutionLifecycle,
  createGenerationLedger,
  DEFAULT_MAX_DAILY_USD,
  reserveTurnBudget,
  restoreGenerationLedger,
  resumeTurnBudget,
  withDiagnostics,
  type BudgetHandle,
  type GenerationLedgerSnapshot,
} from '@kestrel/ai';
import {
  completeFullAnalysisRun,
  extractSymbolFromPrompt,
  failFullAnalysisRun,
  FULL_ANALYSIS_ESTIMATE_USD,
  FULL_ANALYSIS_WORKFLOW_ID,
  FullAnalysisBudgetAdmissionError,
  FullAnalysisCancelledError,
  FullAnalysisLeaseLostError,
  FullAnalysisQuotaExceededError,
  fullAnalysisRetryAction,
  isSafeSymbolResearchPrompt,
  maybeGenerateThreadTitle,
  parseExecutionPlan,
  requeueFullAnalysisRun,
  runMastraMode,
  touchFullAnalysisRun,
  updateFullAnalysisProgress,
  validateFullAnalysisPlanIdentity,
  type FullAnalysisPayload,
} from '@kestrel/ai/mastra-v2';
import { schema, type DbClient } from '@kestrel/db';
import { parseServerEnv, pickAiEnv } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { and, eq } from 'drizzle-orm';

import { createFullAnalysisCoordinator } from '../full-analysis-coordinator.js';
import type { JobContext } from '../types.js';
import { MAX_ANALYSIS_ATTEMPTS } from './constants.js';
import { isBudgetExceededError, resolveSnapshotModel, userMessageFromPayload } from './payload.js';

export interface AttemptState {
  leaseLost: boolean;
  cancelled: boolean;
  // Captured by the inner catch so a retryable failure can persist the exact
  // child generations already completed into the queue payload (Phase 8).
  retryLedgerSnapshot: GenerationLedgerSnapshot | null;
}

export interface ExecuteClaimedRunInput {
  ctx: JobContext;
  db: DbClient;
  workerRunId: string;
  runId: string;
  tenantId: string;
  payload: FullAnalysisPayload;
  state: AttemptState;
  leaseAbort: AbortController;
}

export async function executeClaimedFullAnalysisRun(input: ExecuteClaimedRunInput): Promise<void> {
  const { ctx, db, workerRunId, runId, tenantId, payload, state, leaseAbort } = input;

  let budget: BudgetHandle | null = null;
  let modeResult: Awaited<ReturnType<typeof runMastraMode>>;
  let observedCost: number;
  let lifecycle: ReturnType<typeof createExecutionLifecycle> | null = null;
  let coordinator: ReturnType<typeof createFullAnalysisCoordinator> | null = null;
  const ledger = payload.ledgerSnapshot
    ? restoreGenerationLedger(payload.ledgerSnapshot)
    : createGenerationLedger();
  try {
    const [[userSettings]] = await Promise.all([
      db
        .select()
        .from(schema.userSettings)
        .where(
          and(
            eq(schema.userSettings.userId, payload.userId),
            eq(schema.userSettings.tenantId, tenantId),
          ),
        ),
    ]);
    if (!userSettings) {
      throw new Error(`User settings not found for userId=${payload.userId}`);
    }
    if (!payload.modelSnapshot) {
      throw new Error('Full-analysis job is missing its enqueue-time model snapshot.');
    }

    const userMessage = userMessageFromPayload(payload);
    await appendUserMessage(payload.userId, payload.threadId, userMessage, {
      idempotencyKey: `analysis-job:${runId}:user`,
    });

    const executionPlan = payload.executionPlan
      ? parseExecutionPlan(payload.executionPlan)
      : undefined;
    const userText = payload.userMessageText;
    const symbol = extractSymbolFromPrompt(userText, userSettings.defaultSymbol ?? 'XAUUSD');
    if (!symbol || !isSafeSymbolResearchPrompt(userText)) {
      throw new Error(
        'Full analysis requires one supported symbol and a read-only research request.',
      );
    }
    if (executionPlan) {
      // The claim already validated route/snapshot/row identity; here the
      // plan must also match the run's tenant, symbol, and model snapshot
      // (Phase 8). Identity violations are permanent — never retried.
      validateFullAnalysisPlanIdentity(executionPlan, { tenantId, payload }, symbol);
    }

    const env = pickAiEnv(parseServerEnv(process.env));
    const expectedModel = `${payload.modelSnapshot.providerId}/${payload.modelSnapshot.bareModelId}`;
    const resolvedSnapshot = resolveSnapshotModel(userSettings, env, payload.modelSnapshot);
    if (resolvedSnapshot.modelId !== expectedModel) {
      throw new Error(
        `Enqueue-time model ${expectedModel} is unavailable; no provider failover is permitted.`,
      );
    }
    if (payload.budgetReservationId) {
      budget = resumeTurnBudget({
        userId: payload.userId,
        reservationId: payload.budgetReservationId,
        estimateUsd: FULL_ANALYSIS_ESTIMATE_USD,
        maxDailyUsd: userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
      });
    } else {
      try {
        budget = await reserveTurnBudget({
          userId: payload.userId,
          estimateUsd: FULL_ANALYSIS_ESTIMATE_USD,
          maxDailyUsd: userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
          correlation: { threadId: payload.threadId, runId },
          tenantId,
        });
      } catch (error) {
        if (isBudgetExceededError(error)) {
          throw new FullAnalysisQuotaExceededError(error.spent, error.max);
        }
        throw new FullAnalysisBudgetAdmissionError(error);
      }
    }
    lifecycle = createExecutionLifecycle(budget);
    coordinator = createFullAnalysisCoordinator({
      budget,
      transitions: {
        complete: (result) => completeFullAnalysisRun(runId, workerRunId, result),
        fail: (error) => failFullAnalysisRun(runId, workerRunId, error),
        requeue: (message) => requeueFullAnalysisRun(runId, workerRunId, message),
      },
      isLeaseLost: () => state.leaseLost,
      isCancelled: () => ctx.signal.aborted || leaseAbort.signal.aborted || state.cancelled,
    });

    modeResult = await withDiagnostics(
      payload.userId,
      payload.threadId,
      () =>
        runMastraMode({
          prompt: userText,
          symbol,
          userId: payload.userId,
          threadId: payload.threadId,
          runId,
          mode: 'full',
          modelOverride: `${payload.modelSnapshot?.providerId ?? ''}:${payload.modelSnapshot?.bareModelId ?? ''}`,
          workflowId: FULL_ANALYSIS_WORKFLOW_ID,
          settings: userSettings,
          env,
          signal: AbortSignal.any([ctx.signal, leaseAbort.signal]),
          backfillExcludeMessageIdempotencyKey: `analysis-job:${runId}:user`,
          telemetryKind: 'mastra_full_job',
          executionPlan,
          ledger,
          resumeExisting: true,
          onProgress: async (step) => {
            ctx.log.info('Full-analysis workflow progress', { runId, step });
            await updateFullAnalysisProgress(runId, workerRunId, step);
          },
        }),
      {
        ...(payload.traceId ? { traceId: payload.traceId } : {}),
        runId,
        jobId: runId,
      },
    );
    // The workflow stats already include every specialist and fusion
    // generation. Do not add child costs a second time.
    observedCost = ledger.total();
    coordinator?.markResult(observedCost);

    await touchFullAnalysisRun(runId, workerRunId);
    if (state.leaseLost) throw new FullAnalysisLeaseLostError();
    if (state.cancelled || leaseAbort.signal.aborted) throw new FullAnalysisCancelledError();

    const assistant: UIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [
        { type: 'text', text: modeResult.finalText },
        {
          type: 'data-multi-agent-meta',
          data: {
            engine: 'mastra',
            executionOutcome: 'completed',
            answerOutcome: modeResult.answerOutcome,
            memoryMode: modeResult.memoryMode,
            memoryBackfill: modeResult.memoryBackfill,
            modelSnapshot: modeResult.modelSnapshot,
            terminalReason: 'worker-completed',
            mode: modeResult.mode,
            symbol: modeResult.symbol,
            packetId: modeResult.packet.packetId,
            dataQuality: modeResult.packet.dataQuality,
            totalCostUsd: modeResult.totalCostUsd,
            totalLatencyMs: modeResult.totalLatencyMs,
            agentOpinions: modeResult.agentOpinions,
          },
        } as UIMessage['parts'][number],
      ],
    };
    const persistedAssistant = await appendAssistantMessage(
      payload.userId,
      payload.threadId,
      assistant,
      { idempotencyKey: `analysis-job:${runId}:assistant` },
    );

    try {
      await maybeGenerateThreadTitle({
        userId: payload.userId,
        threadId: payload.threadId,
        firstUser: userText,
        firstAssistant: modeResult.finalText,
        env,
        ledger,
        ledgerId: `title:${runId}`,
      });
    } catch (titleErr) {
      ctx.log.warn('Thread title generation failed (non-fatal)', {
        runId,
        err: String(titleErr),
      });
    }

    observedCost = ledger.total();
    coordinator?.markResult(observedCost);

    await coordinator!.complete({
      finalText: modeResult.finalText,
      agentOpinions: modeResult.agentOpinions,
      mode: modeResult.mode,
      totalCostUsd: observedCost,
      ledgerSnapshot: ledger.snapshot(),
      totalLatencyMs: modeResult.totalLatencyMs,
      messageId: persistedAssistant.messageId,
    });
    budget = null;
    ctx.log.info('Full analysis job completed', {
      runId,
      symbol,
      costUsd: observedCost,
      latencyMs: modeResult.totalLatencyMs,
    });
  } catch (error) {
    if (state.cancelled || error instanceof FullAnalysisCancelledError) {
      // A progress write racing the user's cancellation surfaces as
      // FullAnalysisCancelledError before the heartbeat observed the flag
      // (P2-05). Record it so settlement resolves to 'cancel' and this
      // attempt matches the heartbeat-detected cancellation path.
      state.cancelled = true;
      await appendAssistantMessage(
        payload.userId,
        payload.threadId,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: '_Stream interrupted — please retry._' }],
        },
        { idempotencyKey: `analysis-job:${runId}:interrupted` },
      ).catch((err) => {
        ctx.log.warn('Failed to append interrupted message', { err: String(err) });
      });
      if (coordinator) {
        await coordinator.settleOnError(error);
      }
      throw error;
    }
    state.retryLedgerSnapshot = ledger.snapshot();
    if (budget && lifecycle) {
      const decision = fullAnalysisRetryAction(error, {
        attemptCount: payload.attemptCount,
        maxAttempts: MAX_ANALYSIS_ATTEMPTS,
      });
      // A retryable outcome leaves the durable enqueue-time reservation
      // 'reserved' so the next attempt reconciles actual cost exactly once
      // (Phase 8). Lease loss is never settled here either; the reservation
      // and queue ownership belong to the surviving/requeued attempt.
      if (decision.action !== 'requeue' && !state.leaseLost) {
        if (coordinator) await coordinator.settleOnError(error);
      }
    }
    throw error;
  }
}
