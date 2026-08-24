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

import { estimateKnownCostUsd } from '../cost';
import { completeStep, recordError, recordStep } from '../diagnostics';
import { flushLangfuse } from '../instrumentation';
import { getKestrelMastra } from '../mastra-v2/instance';
import { flushMastraObservability } from '../mastra-v2/telemetry';
import { recordTelemetry } from '../persistence';
import { MASTRA_XAUUSD_AGENT_ID, MASTRA_XAUUSD_AGENT_VERSION } from './constants';
import type { MastraRunOutcome } from './stats';

const mlog = createCategorizedLogger('ai', {
  component: 'mastra-xauusd-run',
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

export interface MastraRunObservation {
  userId: string;
  threadId: string;
  runId: string;
  model: string;
  providerId: string;
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
  /** False when the provider failed before usage was available. */
  usageKnown?: boolean;
  toolCalls: number;
  steps: number;
  outcome: MastraRunOutcome;
  /** Identifies the run type for telemetry breakdown. */
  telemetryKind?:
    | 'mastra_xauusd_poc'
    | 'mastra_mode'
    | 'mastra_full_job'
    | 'mastra_worker_task'
    | 'mastra_canonical_chat';
  error?: unknown;
}

export function beginMastraRun(
  args: Pick<MastraRunObservation, 'runId' | 'threadId' | 'model' | 'providerId'>,
): void {
  recordStep('mastra_xauusd_run', {
    agent: MASTRA_XAUUSD_AGENT_ID,
    agentVersion: MASTRA_XAUUSD_AGENT_VERSION,
    runId: args.runId,
    model: args.model,
    providerId: args.providerId,
  });
  mlog.info('Mastra XAUUSD run started', {
    runId: args.runId,
    threadId: args.threadId,
    model: args.model,
    providerId: args.providerId,
  });
}

/**
 * Finish one Mastra run. Observability failures are deliberately swallowed so
 * a Grafana/DB/Langfuse outage cannot change the result of the AI run.
 */
export function createMastraRunFinalizer(): (
  args: MastraRunObservation,
) => Promise<void> {
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
  completeStep('mastra_xauusd_run', status, durationMs, {
    outcome: args.outcome,
    model: args.model,
    providerId: args.providerId,
    toolCalls: args.toolCalls,
    steps: args.steps,
  });

  metrics.increment('mastra_run_total', {
    tags: { agent: MASTRA_XAUUSD_AGENT_ID, outcome: args.outcome },
  });
  metrics.observe('total_latency_ms', durationMs, {
    tags: { agent: MASTRA_XAUUSD_AGENT_ID },
  });

  if (args.outcome !== 'success') {
    metrics.increment('mastra_run_failed_total', {
      tags: { agent: MASTRA_XAUUSD_AGENT_ID, outcome: args.outcome },
    });
    if (args.error !== undefined) recordError(args.error);
    logErrorContext(
      args.error ?? new Error(`Mastra run ended with ${args.outcome}`),
      'mastra_xauusd_run',
      {
        runId: args.runId,
        threadId: args.threadId,
        model: args.model,
        providerId: args.providerId,
        outcome: args.outcome,
      },
      'ai',
    );
  } else {
    mlog.info('Mastra XAUUSD run completed', {
      runId: args.runId,
      threadId: args.threadId,
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
      usageKnown: args.usageKnown ?? true,
      // One run has one terminal ledger row regardless of whether the
      // callback was triggered by completion, failure, or abort.
      idempotencyKey: `mastra.run:${args.runId}`,
      kind:
        args.outcome === 'success'
          ? (args.telemetryKind ?? 'mastra_xauusd_poc')
          : args.telemetryKind === 'mastra_mode'
            ? 'mastra_mode_failed'
            : args.telemetryKind === 'mastra_full_job'
              ? 'mastra_full_job_failed'
              : args.telemetryKind === 'mastra_worker_task'
                ? 'mastra_worker_task_failed'
                : args.telemetryKind === 'mastra_canonical_chat'
                  ? 'mastra_canonical_chat_failed'
                  : 'mastra_xauusd_poc_failed',
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
      tags: { agent: MASTRA_XAUUSD_AGENT_ID },
    });
    mlog.warn('Mastra run completed with unpriced model', {
      runId: args.runId,
      model: args.model,
      err: error instanceof Error ? error.message : String(error),
    });
  }
  if (Number.isFinite(cost) && cost > 0) {
    metrics.observe('turn_cost_usd', cost, {
      tags: { agent: MASTRA_XAUUSD_AGENT_ID },
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
