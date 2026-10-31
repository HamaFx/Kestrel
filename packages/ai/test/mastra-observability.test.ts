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

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { traceIdStorage } from '@kestrel/shared/logger';
import { LibSQLStore } from '@mastra/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKestrelMastra,
  createMastraObservability,
  initializeKestrelMastra,
  langfuseSamplingRatio,
  langfuseTraceUrl,
  providerFromModel,
  runTracingOptions,
  summarizeWorkflowRunState,
  toMastraRunView,
  workflowIdForKind,
  type RunTelemetryRow,
} from '../src/mastra-v2';

let dbFile: string;

beforeEach(() => {
  dbFile = join(tmpdir(), `kestrel-obs-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
});

afterEach(() => {
  rmSync(dbFile, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function buildInstance() {
  const storage = new LibSQLStore({ id: 'test', url: `file:${dbFile}` });
  // `observability: false` keeps the instance hermetic even when the test
  // environment carries LANGFUSE_* vars.
  const { instance } = createKestrelMastra({ storage, observability: false });
  await initializeKestrelMastra({ instance, storageKind: 'libsql' });
  return instance;
}

function telemetryRow(overrides: Partial<RunTelemetryRow> = {}): RunTelemetryRow {
  return {
    runId: 'run-1',
    traceId: 'trace-1',
    threadId: 'thread-1',
    userId: 'user-1',
    model: 'google/gemini-2.5-pro',
    inputTokens: 100,
    outputTokens: 50,
    toolCalls: 3,
    ms: 1234,
    estCostUsd: 0.01,
    kind: 'mastra_mode',
    createdAt: new Date('2026-08-21T12:00:00Z'),
    ...overrides,
  };
}

/**
 * Restore LANGFUSE_* env vars exactly. Assigning `undefined` would leak the
 * literal string "undefined" into process.env, which reads as a configured
 * value to every downstream check.
 */
function restoreLangfuseEnv(prev: {
  key: string | undefined;
  secret: string | undefined;
  base: string | undefined;
}): void {
  if (prev.key === undefined) delete process.env.LANGFUSE_PUBLIC_KEY;
  else process.env.LANGFUSE_PUBLIC_KEY = prev.key;
  if (prev.secret === undefined) delete process.env.LANGFUSE_SECRET_KEY;
  else process.env.LANGFUSE_SECRET_KEY = prev.secret;
  if (prev.base === undefined) delete process.env.LANGFUSE_BASE_URL;
  else process.env.LANGFUSE_BASE_URL = prev.base;
}

describe('mastra observability — telemetry helpers', () => {
  it('builds run tracing options with runId metadata and stable tags', () => {
    const options = runTracingOptions({
      runId: 'run-9',
      userId: 'user-9',
      threadId: 'thread-9',
      kind: 'mastra_mode',
      tags: ['full'],
      memoryMode: 'degraded',
      memoryBackfill: true,
    });
    expect(options.metadata).toMatchObject({
      runId: 'run-9',
      userId: 'user-9',
      threadId: 'thread-9',
      kind: 'mastra_mode',
      memoryMode: 'degraded',
      memoryBackfill: true,
    });
    expect(options.tags).toContain('kestrel');
    expect(options.tags).toContain('mastra_mode');
    expect(options.tags).toContain('full');
  });

  it('carries the asset class into trace metadata for cross-asset filtering (C-02)', () => {
    const options = runTracingOptions({
      runId: 'run-10',
      userId: 'user-10',
      threadId: 'thread-10',
      kind: 'mastra_mode',
      assetClass: 'fx-majors',
      tags: ['research', 'single'],
    });
    expect(options.metadata).toMatchObject({ assetClass: 'fx-majors' });
    // Absent when the caller does not resolve one (canonical chat, mutation).
    const without = runTracingOptions({
      runId: 'run-11',
      userId: 'user-11',
      threadId: 'thread-11',
      kind: 'mastra_canonical_chat',
    });
    expect(without.metadata).not.toHaveProperty('assetClass');
  });

  it('langfuse sampling defaults to 1 and respects a valid override', () => {
    const prev = process.env.MASTRA_OBSERVABILITY_SAMPLING;
    try {
      delete process.env.MASTRA_OBSERVABILITY_SAMPLING;
      expect(langfuseSamplingRatio()).toBe(1);
      process.env.MASTRA_OBSERVABILITY_SAMPLING = '0.25';
      expect(langfuseSamplingRatio()).toBe(0.25);
      process.env.MASTRA_OBSERVABILITY_SAMPLING = 'bogus';
      expect(langfuseSamplingRatio()).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.MASTRA_OBSERVABILITY_SAMPLING;
      else process.env.MASTRA_OBSERVABILITY_SAMPLING = prev;
    }
  });

  it('langfuse trace url is null without config and a deep link with it', () => {
    const prev = {
      key: process.env.LANGFUSE_PUBLIC_KEY,
      secret: process.env.LANGFUSE_SECRET_KEY,
      base: process.env.LANGFUSE_BASE_URL,
    };
    try {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASE_URL;
      expect(langfuseTraceUrl('abc')).toBeNull();

      process.env.LANGFUSE_PUBLIC_KEY = 'pk';
      process.env.LANGFUSE_SECRET_KEY = 'sk';
      process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com/';
      expect(langfuseTraceUrl('abc')).toBe('https://cloud.langfuse.com/trace/abc');
    } finally {
      restoreLangfuseEnv(prev);
    }
  });

  it('carries the diagnostic traceId into the trace metadata for the log↔trace join (P2-06)', () => {
    const options = traceIdStorage.run('trace-abc', () =>
      runTracingOptions({
        runId: 'run-12',
        userId: 'user-12',
        threadId: 'thread-12',
        kind: 'mastra_mode',
      }),
    );
    expect(options.metadata).toMatchObject({ runId: 'run-12', traceId: 'trace-abc' });

    // Outside a diagnostic scope no traceId is fabricated.
    const without = runTracingOptions({
      runId: 'run-13',
      userId: 'user-13',
      threadId: 'thread-13',
      kind: 'mastra_mode',
    });
    expect(without.metadata).not.toHaveProperty('traceId');
  });

  it('createMastraObservability is undefined without Langfuse and an entrypoint with it', async () => {
    const prev = {
      key: process.env.LANGFUSE_PUBLIC_KEY,
      secret: process.env.LANGFUSE_SECRET_KEY,
      base: process.env.LANGFUSE_BASE_URL,
    };
    try {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASE_URL;
      expect(createMastraObservability()).toBeUndefined();

      process.env.LANGFUSE_PUBLIC_KEY = 'pk';
      process.env.LANGFUSE_SECRET_KEY = 'sk';
      process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';
      const entrypoint = createMastraObservability();
      expect(entrypoint).toBeDefined();
      expect(typeof entrypoint?.flush).toBe('function');
      await entrypoint?.shutdown();
    } finally {
      restoreLangfuseEnv(prev);
    }
  });

  it('provider is derived from the model id prefix', () => {
    expect(providerFromModel('google/gemini-2.5-pro')).toBe('google');
    expect(providerFromModel('anthropic/claude-sonnet-4')).toBe('anthropic');
    expect(providerFromModel('openai:gpt-4o')).toBe('openai');
    expect(providerFromModel('nonsense')).toBe('unknown');
  });

  it('maps telemetry kinds to workflow ids', () => {
    expect(workflowIdForKind('mastra_mode')).toBe('symbol-research');
    expect(workflowIdForKind('mastra_mode_failed')).toBe('symbol-research');
    expect(workflowIdForKind('mastra_full_job')).toBe('full-analysis');
    expect(workflowIdForKind('mastra_full_job_failed')).toBe('full-analysis');
    // P-03: both the neutral name and the one-release legacy alias resolve.
    expect(workflowIdForKind('mastra_xauusd_research')).toBe('xauusd-report');
    expect(workflowIdForKind('mastra_xauusd_research_failed')).toBe('xauusd-report');
    expect(workflowIdForKind('mastra_xauusd_poc')).toBe('xauusd-report');
    expect(workflowIdForKind('mastra_canonical_chat')).toBeNull();
    expect(workflowIdForKind(null)).toBeNull();
  });

  it('summarizes workflow run state including failed steps', () => {
    const empty = summarizeWorkflowRunState(null, 'symbol-research');
    expect(empty.status).toBeNull();
    expect(empty.failedSteps).toEqual([]);
    expect(empty.error).toBeNull();

    const snapshot = {
      status: 'failed',
      steps: {
        'collect-packet': { status: 'succeeded' },
        technical: { status: 'failed' },
        fusion: { status: 'running' },
      },
    } as never;
    const summary = summarizeWorkflowRunState(snapshot, 'symbol-research');
    expect(summary.workflowId).toBe('symbol-research');
    expect(summary.status).toBe('failed');
    expect(summary.failedSteps).toEqual(['technical']);
    expect(summary.completedSteps).toBe(1);
    expect(summary.totalSteps).toBe(3);
    // No error persisted on the steps or the snapshot → no failure detail.
    expect(summary.error).toBeNull();
  });

  it('recovers committee failure detail (strict failure + verifier findings) from the snapshot', () => {
    const findings =
      'Fusion verification failed after repair: number 2142.60 not grounded; date 2026-10-12 not grounded';
    const snapshot = {
      status: 'failed',
      steps: {
        'collect-packet': { status: 'succeeded' },
        technical: {
          status: 'succeeded',
          output: { ok: false, error: 'deadline' },
        },
        fusion: {
          status: 'failed',
          error: {
            name: 'MastraModeStrictFailureError',
            message:
              'Mastra analysis could not complete. Failed agents: fusion. No partial answer was returned — please retry.',
            cause: { name: 'Error', message: findings },
          },
        },
      },
      error: {
        name: 'MastraModeStrictFailureError',
        message:
          'Mastra analysis could not complete. Failed agents: fusion. No partial answer was returned — please retry.',
        cause: { name: 'Error', message: findings },
      },
    } as never;
    const summary = summarizeWorkflowRunState(snapshot, 'symbol-research');
    expect(summary.failedSteps).toEqual(['technical', 'fusion']);
    // The failed fusion step surfaces its message plus the verifier findings
    // from the cause chain; the soft-failed specialist surfaces its marker.
    expect(summary.error).toContain('technical: deadline');
    expect(summary.error).toContain(
      'fusion: Mastra analysis could not complete. Failed agents: fusion.',
    );
    expect(summary.error).toContain(`(cause: ${findings})`);
    // The workflow-level error duplicates the step error → not repeated.
    const occurrences =
      (summary.error ?? '').split('Mastra analysis could not complete').length - 1;
    expect(occurrences).toBe(1);
  });

  it('falls back to the workflow-level error and context step results', () => {
    const snapshot = {
      status: 'failed',
      context: {
        input: { symbol: 'XAUUSD' },
        fusion: {
          status: 'failed',
          error: {
            name: 'Error',
            message: 'Committee analysis timed out during fusion — please retry.',
          },
        },
      },
      error: { name: 'Error', message: 'workflow crashed' },
    } as never;
    const summary = summarizeWorkflowRunState(snapshot, 'symbol-research');
    expect(summary.error).toContain(
      'fusion: Committee analysis timed out during fusion — please retry.',
    );
    expect(summary.error).toContain('workflow crashed');
  });

  it('caps the failure detail so one verbose error cannot bloat the view', () => {
    const snapshot = {
      status: 'failed',
      steps: {
        fusion: { status: 'failed', error: { name: 'Error', message: 'x'.repeat(600) } },
      },
    } as never;
    const summary = summarizeWorkflowRunState(snapshot, 'symbol-research');
    expect(summary.error).not.toBeNull();
    expect((summary.error ?? '').length).toBe(500);
    expect(summary.error?.endsWith('…')).toBe(true);
  });
});

describe('mastra observability — unified run view', () => {
  it('degrades to telemetry-only when no instance is provided', async () => {
    // Clear Langfuse env so the view does not produce a deep link.
    const prev = {
      key: process.env.LANGFUSE_PUBLIC_KEY,
      secret: process.env.LANGFUSE_SECRET_KEY,
      base: process.env.LANGFUSE_BASE_URL,
    };
    try {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASE_URL;
      const view = await toMastraRunView(telemetryRow(), undefined);
      expect(view.runId).toBe('run-1');
      expect(view.provider).toBe('google');
      expect(view.workflow.status).toBeNull();
      expect(view.scores).toEqual([]);
      expect(view.scoreMean).toBeNull();
      expect(view.langfuseUrl).toBeNull();
      expect(view.workflow.error).toBeNull();
      expect(view.error).toBeNull();
    } finally {
      restoreLangfuseEnv(prev);
    }
  });

  it('falls back to the runId for the Langfuse deep link when no traceId is stored', async () => {
    const prev = {
      key: process.env.LANGFUSE_PUBLIC_KEY,
      secret: process.env.LANGFUSE_SECRET_KEY,
      base: process.env.LANGFUSE_BASE_URL,
    };
    try {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk';
      process.env.LANGFUSE_SECRET_KEY = 'sk';
      process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';
      const view = await toMastraRunView(telemetryRow({ traceId: null }), undefined);
      expect(view.runId).toBe('run-1');
      expect(view.langfuseUrl).toBe('https://cloud.langfuse.com/trace/run-1');
    } finally {
      restoreLangfuseEnv(prev);
    }
  });

  it('joins workflow snapshot status and score records for a run', async () => {
    const instance = await buildInstance();

    // Seed a workflow snapshot + a score row for the same runId.
    const storage = instance.getStorage() as never as {
      getStore(domain: string): Promise<{
        persistWorkflowSnapshot(input: unknown): Promise<void>;
      }>;
    };
    const workflowsDomain = await storage.getStore('workflows');
    await workflowsDomain.persistWorkflowSnapshot({
      workflowName: 'symbol-research',
      runId: 'run-1',
      resourceId: 'user-1',
      snapshot: {
        runId: 'run-1',
        status: 'running',
        value: {},
        context: {},
        serializedStepGraph: [],
        activePaths: [],
        activeStepsPath: {},
        suspendedPaths: {},
        resumeLabels: {},
        waitingPaths: {},
        timestamp: Date.now(),
      },
    });

    const view = await toMastraRunView(
      telemetryRow({ kind: 'mastra_mode', traceId: null }),
      instance,
    );
    expect(view.workflow.workflowId).toBe('symbol-research');
    expect(view.workflow.status).toBe('running');
    expect(view.scores).toEqual([]);
    expect(view.langfuseUrl).toBeNull();
  });

  it('carries the failure detail for a failed committee run (strict failure + verifier findings)', async () => {
    const instance = await buildInstance();

    // Seed the snapshot a failed committee run leaves behind: the fusion
    // step threw MastraModeStrictFailureError whose cause carries the
    // grounding-verifier findings.
    const storage = instance.getStorage() as never as {
      getStore(domain: string): Promise<{
        persistWorkflowSnapshot(input: unknown): Promise<void>;
      }>;
    };
    const workflowsDomain = await storage.getStore('workflows');
    await workflowsDomain.persistWorkflowSnapshot({
      workflowName: 'symbol-research',
      runId: 'run-fail',
      resourceId: 'user-1',
      snapshot: {
        runId: 'run-fail',
        status: 'failed',
        value: {},
        context: {},
        serializedStepGraph: [],
        activePaths: [],
        activeStepsPath: {},
        suspendedPaths: {},
        resumeLabels: {},
        waitingPaths: {},
        timestamp: Date.now(),
        steps: {
          'collect-packet': { status: 'succeeded' },
          technical: { status: 'succeeded' },
          fusion: {
            status: 'failed',
            error: {
              name: 'MastraModeStrictFailureError',
              message:
                'Mastra analysis could not complete. Failed agents: fusion. No partial answer was returned — please retry.',
              cause: {
                name: 'Error',
                message:
                  'Fusion verification failed after repair: number 2142.60 not grounded; date 2026-10-12 not grounded',
              },
            },
          },
        },
      },
    });

    const view = await toMastraRunView(
      telemetryRow({ runId: 'run-fail', kind: 'mastra_mode_failed', traceId: null }),
      instance,
    );
    expect(view.workflow.status).toBe('failed');
    expect(view.workflow.failedSteps).toEqual(['fusion']);
    expect(view.workflow.error).toContain('fusion: Mastra analysis could not complete.');
    expect(view.workflow.error).toContain('(cause: Fusion verification failed after repair');
    // Phase 5.2: the run-level field is what the admin table renders.
    expect(view.error).toBe(view.workflow.error);
  });

  it('computes the mean score when score records exist', async () => {
    const instance = await buildInstance();
    const storage = instance.getStorage() as never as {
      getStore(domain: string): Promise<{ saveScore(input: unknown): Promise<unknown> }>;
    };
    const scoresDomain = await storage.getStore('scores');
    for (const score of [0.9, 0.7]) {
      await scoresDomain.saveScore({
        runId: 'run-2',
        entityId: 'entity-2',
        entityType: 'AGENT',
        scorerId: 'faithfulness',
        score,
        output: score >= 0.8 ? 'good' : 'bad',
        source: 'LIVE',
        scorer: { id: 'faithfulness' },
        entity: { id: 'entity-2' },
      });
    }
    const view = await toMastraRunView(telemetryRow({ runId: 'run-2' }), instance);
    expect(view.scores.length).toBe(2);
    expect(view.scoreMean).toBeCloseTo(0.8, 5);
    expect(view.scores[0]).toMatchObject({ scorerId: 'faithfulness', source: 'LIVE' });
  });
});
