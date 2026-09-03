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

// Durable full-analysis worker. The web writes a pending database queue row
// and a Mastra projection; this job atomically claims the DB row, executes the
// Full workflow under the runId, and projects terminal state after a lease-
// conditional queue transition. No stale worker may overwrite a requeued run.

import {
  appendAssistantMessage,
  appendUserMessage,
  createExecutionLifecycle,
  createGenerationLedger,
  DEFAULT_MAX_DAILY_USD,
  getDb,
  reserveTurnBudget,
  resolveMastraModel,
  restoreGenerationLedger,
  resumeTurnBudget,
  withDiagnostics,
  type BudgetHandle,
  type GenerationLedgerSnapshot,
} from '@kestrel/ai';
import {
  claimNextFullAnalysisRun,
  completeFullAnalysisRun,
  extractSymbolFromPrompt,
  failFullAnalysisRun,
  FULL_ANALYSIS_ESTIMATE_USD,
  FULL_ANALYSIS_WORKFLOW_ID,
  FullAnalysisBudgetAdmissionError,
  FullAnalysisHeartbeatError,
  FullAnalysisLeaseLostError,
  FullAnalysisQuotaExceededError,
  fullAnalysisRetryAction,
  isSafeSymbolResearchPrompt,
  maybeGenerateThreadTitle,
  parseExecutionPlan,
  purgeOldFullAnalysisRuns,
  recoverStaleFullAnalysisRuns,
  requeueFullAnalysisRun,
  runMastraMode,
  touchFullAnalysisRun,
  updateFullAnalysisProgress,
  validateFullAnalysisPlanIdentity,
  type FullAnalysisPayload,
} from '@kestrel/ai/mastra';
import { schema } from '@kestrel/db';
import { pickAiEnv } from '@kestrel/shared';
import { traceIdStorage } from '@kestrel/shared/logger';
import type { UIMessage } from 'ai';
import { and, eq } from 'drizzle-orm';

import { createFullAnalysisCoordinator } from './full-analysis-coordinator.js';
import type { JobContext, JobResult } from './types.js';

const MAX_JOBS_PER_RUN = 3;
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_ANALYSIS_ATTEMPTS = 3;
const HEARTBEAT_MS = 30_000;
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isBudgetExceededError(error: unknown): error is { spent: number; max: number } {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === 'BUDGET_EXCEEDED' &&
    Number.isFinite((error as { spent?: unknown }).spent) &&
    Number.isFinite((error as { max?: unknown }).max)
  );
}

function resolveSnapshotModel(
  settings: Parameters<typeof resolveMastraModel>[0]['settings'],
  env: Parameters<typeof resolveMastraModel>[0]['env'],
  snapshot: NonNullable<FullAnalysisPayload['modelSnapshot']>,
) {
  return resolveMastraModel({
    purpose: 'worker',
    settings,
    env,
    domain: 'technical',
    snapshot,
  });
}

function userMessageFromPayload(payload: FullAnalysisPayload): UIMessage {
  const storedParts = Array.isArray(payload.userMessageParts) ? payload.userMessageParts : [];
  const hasTextPart = storedParts.some(
    (part) =>
      typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text',
  );
  const parts = hasTextPart
    ? storedParts
    : [...storedParts, { type: 'text', text: payload.userMessageText }];
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: parts as UIMessage['parts'],
  } as UIMessage;
}

/**
 * Application-level durable research boundary (Phase 2 target naming):
 * claim, execute, and settle one queued Full-mode workflow job.
 */
export function runDurableResearchJob(ctx: JobContext): Promise<JobResult> {
  return runMultiAgentAnalysis(ctx);
}

export async function runMultiAgentAnalysis(ctx: JobContext): Promise<JobResult> {
  const db = getDb();
  const workerRunId = `${process.env.HOSTNAME ?? 'worker'}-${crypto.randomUUID()}`;
  let processed = 0;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const claimed = await claimNextFullAnalysisRun(workerRunId, (tenantId) =>
      ctx.tenantRouter.isMyTenant(tenantId),
    );
    if (!claimed) {
      ctx.log.info('No pending full-analysis runs — done.');
      break;
    }
    const { runId, tenantId, payload } = claimed;
    ctx.log.info('Claimed full-analysis run', {
      runId,
      userId: payload.userId,
      threadId: payload.threadId,
      traceId: payload.traceId,
      attempt: payload.attemptCount,
    });

    let leaseLost = false;
    // Captured by the inner catch so a retryable failure can persist the exact
    // child generations already completed into the queue payload (Phase 8).
    let retryLedgerSnapshot: GenerationLedgerSnapshot | null = null;
    const leaseAbort = new AbortController();
    const leaseHeartbeat = setInterval(() => {
      void touchFullAnalysisRun(runId, workerRunId).catch((error) => {
        if (error instanceof FullAnalysisLeaseLostError) {
          leaseLost = true;
          leaseAbort.abort(error);
          ctx.log.error('Full-analysis lease ownership lost', { err: String(error) });
        } else if (error instanceof FullAnalysisHeartbeatError) {
          ctx.log.warn('Full-analysis heartbeat infrastructure failure', { err: String(error) });
        } else {
          ctx.log.warn('Full-analysis heartbeat failed', { err: String(error) });
        }
      });
    }, HEARTBEAT_MS);
    leaseHeartbeat.unref();

    const processRun = async () => {
      let budget: BudgetHandle | null = null;
      let modeResult: Awaited<ReturnType<typeof runMastraMode>> | null = null;
      let observedCost = 0;
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

        const env = pickAiEnv(process.env as unknown as Parameters<typeof pickAiEnv>[0]);
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
          isLeaseLost: () => leaseLost,
          isCancelled: () => ctx.signal.aborted || leaseAbort.signal.aborted,
        });

        await appendUserMessage(payload.userId, payload.threadId, userMessage, {
          idempotencyKey: `analysis-job:${runId}:user`,
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
        if (leaseLost) throw new FullAnalysisLeaseLostError();

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

        void maybeGenerateThreadTitle({
          userId: payload.userId,
          threadId: payload.threadId,
          firstUser: userText,
          firstAssistant: modeResult.finalText,
          env,
          ledger,
          ledgerId: `title:${runId}`,
        });

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
        processed++;
        ctx.log.info('Full analysis job completed', {
          runId,
          symbol,
          costUsd: observedCost,
          latencyMs: modeResult.totalLatencyMs,
        });
      } catch (error) {
        retryLedgerSnapshot = ledger.snapshot();
        if (budget && lifecycle) {
          const decision = fullAnalysisRetryAction(error, {
            attemptCount: payload.attemptCount,
            maxAttempts: MAX_ANALYSIS_ATTEMPTS,
          });
          // A retryable outcome leaves the durable enqueue-time reservation
          // 'reserved' so the next attempt reconciles actual cost exactly once
          // (Phase 8). Lease loss is never settled here either; the reservation
          // and queue ownership belong to the surviving/requeued attempt.
          if (decision.action !== 'requeue' && !leaseLost) {
            if (coordinator) await coordinator.settleOnError(error);
          }
          budget = null;
        }
        throw error;
      }
    };

    try {
      try {
        if (payload.traceId) await traceIdStorage.run(payload.traceId, processRun);
        else await processRun();
      } catch (error) {
        const decision = fullAnalysisRetryAction(error, {
          attemptCount: payload.attemptCount,
          maxAttempts: MAX_ANALYSIS_ATTEMPTS,
        });
        if (decision.action === 'discard') {
          ctx.log.warn('Full-analysis result discarded after lease loss', { runId });
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        ctx.log.error('Full analysis job failed', {
          runId,
          err: message,
          category: decision.category,
          retryable: decision.action === 'requeue',
          attempt: payload.attemptCount,
        });
        if (decision.category === 'quota') {
          ctx.log.warn('Full-analysis run rejected by daily budget', {
            runId,
            spent: (error as { spent?: unknown }).spent,
            max: (error as { max?: unknown }).max,
          });
        }
        if (decision.action === 'requeue') {
          await requeueFullAnalysisRun(
            runId,
            workerRunId,
            `Attempt ${payload.attemptCount}/${MAX_ANALYSIS_ATTEMPTS} failed; retrying automatically.`,
            retryLedgerSnapshot ?? undefined,
          );
        } else {
          await failFullAnalysisRun(runId, workerRunId, error);
        }
        processed++;
      }
    } finally {
      clearInterval(leaseHeartbeat);
      leaseAbort.abort();
    }
  }

  const staleCutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
  const staleRecovery = await recoverStaleFullAnalysisRuns(staleCutoff, MAX_ANALYSIS_ATTEMPTS);
  if (staleRecovery.requeued > 0 || staleRecovery.failed > 0) {
    ctx.log.warn('Recovered stale full-analysis runs', {
      requeued: staleRecovery.requeued,
      failed: staleRecovery.failed,
      maxAttempts: MAX_ANALYSIS_ATTEMPTS,
    });
  }

  const retentionCutoff = new Date(Date.now() - RETENTION_WINDOW_MS);
  try {
    const purged = await purgeOldFullAnalysisRuns(retentionCutoff);
    if (purged > 0) ctx.log.info('Purged old full-analysis runs', { purged });
  } catch (error) {
    ctx.log.warn('Full-analysis run retention cleanup failed', { err: String(error) });
  }

  ctx.log.info('Full-analysis poll complete', { processed });
  return { processed, note: `processed=${processed}` };
}
