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

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger, logErrorContext } from '@kestrel/shared/logger';
import { flushMetrics } from '@kestrel/shared/metrics-export';

import { estimateKnownCostUsd } from '../../budget/cost';
import { completeStep, recordError, recordStep } from '../../diagnostics';
import { recordModelFailure, recordModelSuccess } from '../../models/circuit-breaker';
import { recordTelemetry } from '../../persistence';
import { flushLangfuse } from '../../runtime/instrumentation';
import { getKestrelMastra } from '../instance';
import { flushMastraObservability } from '../telemetry';
import { MASTRA_XAUUSD_AGENT_ID, MASTRA_XAUUSD_AGENT_VERSION } from './constants';
import type { MastraAnswerOutcome, MastraRunOutcome } from './stats';

const mlog = createCategorizedLogger('ai', {
  component: 'mastra:xauusd-run',
  agent: MASTRA_XAUUSD_AGENT_ID,
  agentVersion: MASTRA_XAUUSD_AGENT_VERSION,
});

let telemetryDegraded = false;

export function isMastraTelemetryDegraded(): boolean {
  return telemetryDegraded;
}

export function resetMastraTelemetryHealth(): void {
  telemetryDegraded = false;
}

/**
 * Memory execution mode for a run. `degraded` (Phase 9) means the request
 * completed with native memory but preparation partially failed (seed or
 * backfill) — answer semantics are unchanged, but the degradation is
 * surfaced in telemetry and UI metadata so it is never silent.
 */
export type MastraMemoryMode = 'native' | 'explicit-history' | 'degraded' | 'disabled';

export interface MastraRunObservation {
  userId: string;
  threadId: string;
  runId: string;
  model: string;
  providerId: string;
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  steps: number;
  outcome: MastraRunOutcome;
  /** Whether an answer was ready, blocked by evidence, or degraded. */
  answerOutcome?: MastraAnswerOutcome;
  /** Memory execution mode used by this run. */
  memoryMode?: MastraMemoryMode;
  /** Whether native memory preparation attempted legacy history backfill. */
  memoryBackfill?: boolean;
  /** Immutable resolved model identity used for this run. */
  modelSnapshot?: { providerId: string; bareModelId: string };
  /** Identifies the run type for telemetry breakdown. */
  telemetryKind?:
    | 'mastra_xauusd_research'
    | 'mastra_xauusd_poc'
    | 'mastra_mode'
    | 'mastra_full_job'
    | 'mastra_worker_task'
    | 'mastra_canonical_chat'
    | 'mastra_custom_agent';
  error?: unknown;
}

/**
 * P-03 (audit 2026-10-18) — normalize legacy telemetry kinds to their
 * footprint-neutral names. `mastra_xauusd_poc` is accepted for one release
 * (old clients / queued payloads) and written as `mastra_xauusd_research`.
 */
function canonicalTelemetryKind(
  kind: MastraRunObservation['telemetryKind'],
): NonNullable<MastraRunObservation['telemetryKind']> {
  return kind === 'mastra_xauusd_poc' || kind === undefined ? 'mastra_xauusd_research' : kind;
}

/**
 * Phase 1 (observability roadmap) — attribute run metrics to the actual route
 * instead of tagging every run `kestrel-xauusd-research-poc`. XAUUSD research
 * (and the legacy `*_poc` alias / omitted kind) keeps the historical agent id
 * so existing dashboards and telemetry tests keep resolving.
 */
export function agentLabelForTelemetryKind(
  kind?: MastraRunObservation['telemetryKind'],
): string {
  switch (kind) {
    case 'mastra_canonical_chat':
      return 'kestrel-mastra-canonical-chat';
    case 'mastra_mode':
      return 'kestrel-committee-mode';
    case 'mastra_full_job':
      return 'kestrel-committee-full-job';
    case 'mastra_worker_task':
      return 'kestrel-worker-task';
    case 'mastra_custom_agent':
      return 'kestrel-custom-agent';
    default:
      return MASTRA_XAUUSD_AGENT_ID;
  }
}

/** Diagnostic step name for a run type (start/finish must agree). */
function stepNameForTelemetryKind(kind?: MastraRunObservation['telemetryKind']): string {
  switch (kind) {
    case 'mastra_canonical_chat':
      return 'mastra_canonical_chat_run';
    case 'mastra_mode':
      return 'mastra_mode_run';
    case 'mastra_full_job':
      return 'mastra_full_job_run';
    case 'mastra_custom_agent':
      return 'mastra_custom_agent_run';
    default:
      return 'mastra_xauusd_run';
  }
}

export function beginMastraRun(
  args: Pick<MastraRunObservation, 'runId' | 'threadId' | 'model' | 'providerId'> & {
    telemetryKind?: MastraRunObservation['telemetryKind'];
  },
): void {
  const agentLabel = agentLabelForTelemetryKind(args.telemetryKind);
  const stepName = stepNameForTelemetryKind(args.telemetryKind);
  recordStep(stepName, {
    agent: agentLabel,
    agentVersion: MASTRA_XAUUSD_AGENT_VERSION,
    runId: args.runId,
    model: args.model,
    providerId: args.providerId,
  });
  mlog.info('Mastra run started', {
    runId: args.runId,
    threadId: args.threadId,
    agent: agentLabel,
    telemetryKind: args.telemetryKind ?? 'mastra_xauusd_research',
    model: args.model,
    providerId: args.providerId,
  });
}

/**
 * Finish one Mastra run. Observability failures are deliberately swallowed so
 * a Grafana/DB/Langfuse outage cannot change the result of the AI run.
 */
export function createMastraRunFinalizer(): (args: MastraRunObservation) => Promise<void> {
  let terminalPromise: Promise<void> | null = null;
  return (args) => {
    if (terminalPromise) return terminalPromise;
    terminalPromise = finishMastraRun(args);
    return terminalPromise;
  };
}

export async function finishMastraRun(args: MastraRunObservation): Promise<void> {
  const durationMs = Math.max(0, Date.now() - args.startedAt);
  const status = args.outcome === 'success' ? 'completed' : 'failed';
  const agentLabel = agentLabelForTelemetryKind(args.telemetryKind);
  const stepName = stepNameForTelemetryKind(args.telemetryKind);

  // Audit plan §1.4 (P0-4) — feed the terminal run outcome into the
  // per-model circuit breaker, keyed by the resolved model id (the
  // qualified "<provider>/<model>" string, never the bare provider id).
  // `cancelled` is a user abort rather than a provider failure, and a run
  // whose model never resolved has no circuit to count against.
  const breakerModelId = args.model;
  if (breakerModelId && breakerModelId !== 'unresolved') {
    if (args.outcome === 'success') {
      recordModelSuccess(breakerModelId);
    } else if (args.outcome === 'failed') {
      recordModelFailure(breakerModelId);
    }
  }

  completeStep(stepName, status, durationMs, {
    outcome: args.outcome,
    answerOutcome: args.answerOutcome,
    memoryMode: args.memoryMode,
    memoryBackfill: args.memoryBackfill,
    modelSnapshot: args.modelSnapshot,
    model: args.model,
    providerId: args.providerId,
    toolCalls: args.toolCalls,
    steps: args.steps,
  });

  metrics.increment('mastra_run_total', {
    tags: { agent: agentLabel, outcome: args.outcome },
  });
  metrics.observe('total_latency_ms', durationMs, {
    tags: { agent: agentLabel },
  });

  if (args.outcome !== 'success') {
    metrics.increment('mastra_run_failed_total', {
      tags: { agent: agentLabel, outcome: args.outcome },
    });
    if (args.error !== undefined) recordError(args.error);
    logErrorContext(
      args.error ?? new Error(`Mastra run ended with ${args.outcome}`),
      stepName,
      {
        runId: args.runId,
        threadId: args.threadId,
        model: args.model,
        providerId: args.providerId,
        telemetryKind: args.telemetryKind ?? 'mastra_xauusd_research',
        outcome: args.outcome,
        answerOutcome: args.answerOutcome,
      },
      'ai',
    );
  } else {
    mlog.info('Mastra run completed', {
      runId: args.runId,
      threadId: args.threadId,
      agent: agentLabel,
      telemetryKind: args.telemetryKind ?? 'mastra_xauusd_research',
      model: args.model,
      providerId: args.providerId,
      durationMs,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      toolCalls: args.toolCalls,
      steps: args.steps,
    });
  }

  try {
    await recordTelemetry({
      userId: args.userId,
      threadId: args.threadId,
      messageId: null,
      runId: args.runId,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      toolCalls: args.toolCalls,
      ms: durationMs,
      // One run has one terminal ledger row regardless of whether the
      // callback was triggered by completion, failure, or abort.
      idempotencyKey: `mastra.run:${args.runId}`,
      kind:
        args.outcome === 'success'
          ? canonicalTelemetryKind(args.telemetryKind)
          : args.telemetryKind === 'mastra_mode'
            ? 'mastra_mode_failed'
            : args.telemetryKind === 'mastra_full_job'
              ? 'mastra_full_job_failed'
              : args.telemetryKind === 'mastra_worker_task'
                ? 'mastra_worker_task_failed'
                : args.telemetryKind === 'mastra_canonical_chat'
                  ? 'mastra_canonical_chat_failed'
                  : args.telemetryKind === 'mastra_custom_agent'
                    ? 'mastra_custom_agent_failed'
                    : 'mastra_xauusd_research_failed',
    });
  } catch (error) {
    telemetryDegraded = true;
    metrics.increment('metrics_flush_failed_total', {
      tags: { surface: 'database' },
    });
    mlog.error('Mastra run telemetry persistence failed', {
      runId: args.runId,
      threadId: args.threadId,
      err: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  let cost = 0;
  try {
    cost = estimateKnownCostUsd(args.model, args.inputTokens, args.outputTokens);
  } catch (error) {
    metrics.increment('mastra_unpriced_model_total', {
      tags: { agent: agentLabel },
    });
    mlog.warn('Mastra run completed with unpriced model', {
      runId: args.runId,
      model: args.model,
      err: error instanceof Error ? error.message : String(error),
    });
  }
  if (Number.isFinite(cost) && cost > 0) {
    metrics.observe('turn_cost_usd', cost, {
      tags: { agent: agentLabel },
    });
  }

  // Exporters are best-effort: an observability outage must not change the
  // already-computed research result or cause a second terminal run record.
  try {
    await flushLangfuse();
  } catch (error) {
    telemetryDegraded = true;
    metrics.increment('metrics_flush_failed_total', {
      tags: { surface: 'langfuse' },
    });
    mlog.warn('Mastra Langfuse flush failed', {
      runId: args.runId,
      err: error instanceof Error ? error.name : 'UnknownError',
    });
  }
  // Phase 8: flush the Mastra observability exporters (Langfuse) so the
  // run's spans land promptly at the request boundary.
  try {
    await flushMastraObservability(getKestrelMastra().instance);
  } catch (error) {
    telemetryDegraded = true;
    metrics.increment('metrics_flush_failed_total', {
      tags: { surface: 'mastra-observability' },
    });
    mlog.warn('Mastra observability flush failed', {
      runId: args.runId,
      err: error instanceof Error ? error.name : 'UnknownError',
    });
  }
  try {
    await flushMetrics();
  } catch (error) {
    telemetryDegraded = true;
    metrics.increment('metrics_flush_failed_total', {
      tags: { surface: 'metrics' },
    });
    mlog.warn('Mastra metrics flush failed', {
      runId: args.runId,
      err: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
