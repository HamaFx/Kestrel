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

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RequestContext } from '@mastra/core/request-context';
import { createStep, Workflow, type WorkflowRunState } from '@mastra/core/workflows';
import { LibSQLStore } from '@mastra/libsql';
import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createCommitteeWorkflow } from '../src/committee/workflow';
import { createKestrelMastra, initializeKestrelMastra } from '../src/mastra-v2';

const mocks = vi.hoisted(() => ({
  collectSymbolResearchPacket: vi.fn(),
  /** Hard 4xx error thrown for the risk specialist (permanent → marker). */
  failRisk: false,
  /** Hard 4xx error thrown for the fundamental specialist (permanent → marker). */
  failFundamental: false,
  /** Number of transient 429s before succeeding. */
  rateLimitFailures: 0,
  /** Captured agent.generate() calls: { id, options } for memory assertions. */
  generateCalls: [] as Array<{ id: string; options?: Record<string, unknown> }>,
  /** When true, specialists hang until their abort signal fires (deadline test). */
  hangSpecialists: false,
}));

vi.mock('../src/mastra/symbol-research', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra/symbol-research');
  return { ...actual, collectSymbolResearchPacket: mocks.collectSymbolResearchPacket };
});
vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    readonly id: string;

    constructor(options: { id: string }) {
      this.id = options.id;
    }

    async generate(_prompt?: unknown, options?: Record<string, unknown>): Promise<unknown> {
      mocks.generateCalls.push({ id: this.id, ...(options ? { options } : {}) });
      if (this.id.includes('-critique')) {
        return {
          object: { confirms: true, revisedConfidence: 0.65, critique: `${this.id} agrees with peers` },
          usage: { inputTokens: 8, outputTokens: 4 },
          steps: [{}],
        };
      }
      if (mocks.hangSpecialists && !this.id.includes('decision')) {
        const abortSignal = (options as { abortSignal?: AbortSignal } | undefined)?.abortSignal;
        if (abortSignal) {
          await new Promise<never>((_, reject) => {
            const abort = () => reject(new DOMException('Aborted', 'AbortError'));
            if (abortSignal.aborted) abort();
            else abortSignal.addEventListener('abort', abort, { once: true });
          });
        }
      }
      if (mocks.failRisk && this.id.includes('risk')) {
        // A hard 4xx is permanent: the step returns an error marker (no retry),
        // and Full-mode verify turns it into a terminal strict failure.
        throw Object.assign(new Error('bad request shape'), { statusCode: 400 });
      }
      if (mocks.failFundamental && this.id.includes('fundamental')) {
        // Also permanent: Standard continues without this specialist.
        throw Object.assign(new Error('fundamental data unavailable'), { statusCode: 400 });
      }
      if (mocks.rateLimitFailures > 0 && !this.id.includes('decision')) {
        mocks.rateLimitFailures -= 1;
        throw Object.assign(new Error('You exceeded your current quota'), { statusCode: 429 });
      }
      if (this.id.includes('decision')) {
        return {
          text: 'Synthesized read.',
          usage: { inputTokens: 20, outputTokens: 10 },
          steps: [{}],
        };
      }
      return {
        object: {
          bias: 'neutral',
          confidence: 0.6,
          reasoning: `${this.id} opinion`,
          details: { source: 'packet' },
        },
        usage: { inputTokens: 10, outputTokens: 5 },
        steps: [{}],
      };
    }
  },
}));

const readyPacket = {
  packetId: 'packet-1',
  kind: 'symbol_research_packet' as const,
  symbol: 'EURUSD',
  generatedAt: '2026-08-19T12:00:00.000Z',
  status: 'ready' as const,
  dataQuality: 'complete' as const,
  price: null,
  timeframes: [],
  optionalContext: { available: false, reason: 'not configured' },
  missingData: [],
  warnings: [],
};

const blockedPacket = {
  ...readyPacket,
  packetId: 'packet-blocked',
  status: 'blocked' as const,
  dataQuality: 'degraded' as const,
  missingData: ['Current EURUSD price is unavailable.'],
};

const model = {} as LanguageModel;
const deps = {
  model,
  modelId: 'google/gemini-3.6-flash',
  providerId: 'google',
  memory: undefined as never,
  specialistCallOptions: { thread: 'thread-1', resource: 'user-1' } as never,
  fusionCallOptions: { thread: 'thread-1', resource: 'user-1' } as never,
};

function contextFor(runId: string) {
  return new RequestContext([
    ['userId', 'user-1'],
    ['runId', runId],
    ['threadId', 'thread-1'],
    ['symbol', 'EURUSD'],
  ]) as never;
}

type RunResult = { status: string; result?: unknown; error?: { message?: string } };

async function startWorkflow(
  workflow: ReturnType<typeof createCommitteeWorkflow>,
  runId: string,
  inputData: { prompt: string; symbol: string; mode: string },
): Promise<RunResult> {
  const run = await workflow.createRun({ runId });
  return (await run.start({
    inputData,
    requestContext: contextFor(runId),
  })) as unknown as RunResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failRisk = false;
  mocks.failFundamental = false;
  mocks.hangSpecialists = false;
  mocks.rateLimitFailures = 0;
  mocks.generateCalls.length = 0;
  mocks.collectSymbolResearchPacket.mockReset().mockResolvedValue(readyPacket);
});

describe('committee workflow', () => {
  it('fails closed with a graceful blocked output when the packet is blocked', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValue(blockedPacket);

    const workflow = createCommitteeWorkflow(deps, 'full');
    const result = await startWorkflow(workflow, 'wf-blocked', {
      prompt: 'Analyse EURUSD',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('success');
    const output = result.result as {
      status: string;
      blockedText: string;
      stats: { inputTokens: number };
    };
    expect(output.status).toBe('blocked');
    expect(output.blockedText).toContain('EURUSD');
    expect(output.blockedText).toContain('price is unavailable');
    expect(output.stats.inputTokens).toBe(0);
  });

  it('runs single with a single specialist and formats directly (no fusion LLM call)', async () => {
    const workflow = createCommitteeWorkflow(deps, 'single');
    const result = await startWorkflow(workflow, 'wf-single', {
      prompt: 'Give me a quick technical read',
      symbol: 'EURUSD',
      mode: 'single',
    });

    expect(result.status).toBe('success');
    const output = result.result as {
      status: string;
      finalText: string;
      opinions: unknown[];
    };
    expect(output.status).toBe('ready');
    expect(output.finalText).toContain('EURUSD read');
    expect(output.opinions).toHaveLength(1);
  });

  it('fails Full mode terminally when a specialist returns a permanent error marker', async () => {
    mocks.failRisk = true;

    const workflow = createCommitteeWorkflow(deps, 'full');
    const result = await startWorkflow(workflow, 'wf-strict', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.message ?? '').toContain('Failed agents: risk');
  });

  it('retries a transient specialist rate-limit and completes Full with all opinions', async () => {
    mocks.rateLimitFailures = 1;

    const workflow = createCommitteeWorkflow(deps, 'full');
    const result = await startWorkflow(workflow, 'wf-retry', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('success');
    const output = result.result as { status: string; opinions: { agentName: string }[] };
    expect(output.status).toBe('ready');
    expect(output.opinions.map((opinion) => opinion.agentName).sort()).toEqual([
      'fundamental',
      'risk',
      'sentiment',
      'technical',
    ]);
  });

  it('restarts from a persisted snapshot without rerunning completed steps', async () => {
    const file = join(
      tmpdir(),
      `kestrel-wf-restart-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    try {
      const store = new LibSQLStore({ id: 'restart-store', url: `file:${file}` });
      const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
      await initializeKestrelMastra(mastra);
      const calls: string[] = [];
      const first = createStep({
        id: 'first',
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ value: z.string() }),
        execute: async ({ inputData }) => {
          calls.push('first');
          return { value: inputData.value };
        },
      });
      const second = createStep({
        id: 'second',
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ value: z.string() }),
        execute: async ({ inputData }) => {
          calls.push('second');
          return { value: `${inputData.value}:completed` };
        },
      });
      const workflow = new Workflow({
        id: 'restartable-test',
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ value: z.string() }),
        mastra: mastra.instance,
      })
        .then(first)
        .then(second)
        .commit();
      const now = Date.now();
      const workflows = await mastra.instance.getStorage()?.getStore('workflows');
      await workflows?.persistWorkflowSnapshot({
        workflowName: 'restartable-test',
        runId: 'restart-run',
        resourceId: 'user-1',
        snapshot: {
          runId: 'restart-run',
          status: 'running',
          value: {},
          context: {
            input: { value: 'seed' },
            first: {
              status: 'success',
              payload: { value: 'seed' },
              output: { value: 'seed' },
              startedAt: now,
              endedAt: now,
            },
          } as unknown as WorkflowRunState['context'],
          serializedStepGraph: workflow.serializedStepGraph,
          activePaths: [1],
          activeStepsPath: { second: [1] },
          suspendedPaths: {},
          resumeLabels: {},
          waitingPaths: {},
          stepExecutionPath: ['first'],
          timestamp: now,
        },
      });

      const result = await (await workflow.createRun({ runId: 'restart-run' })).restart();
      expect(result.status).toBe('success');
      expect((result as { status: 'success'; result: unknown }).result).toEqual({
        value: 'seed:completed',
      });
      expect(calls).toEqual(['second']);
      expect((await workflow.getWorkflowRunById('restart-run'))?.status).toBe('success');
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('cancels an active workflow and persists the canceled terminal state', async () => {
    const file = join(
      tmpdir(),
      `kestrel-wf-cancel-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    try {
      const store = new LibSQLStore({ id: 'cancel-store', url: `file:${file}` });
      const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
      await initializeKestrelMastra(mastra);
      let enteredResolve: (() => void) | undefined;
      const entered = new Promise<void>((resolve) => {
        enteredResolve = resolve;
      });
      const wait = createStep({
        id: 'wait',
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ value: z.string() }),
        execute: async ({ inputData, abortSignal }) => {
          enteredResolve?.();
          await new Promise<never>((_, reject) => {
            const abort = () => reject(new DOMException('Aborted', 'AbortError'));
            if (abortSignal.aborted) abort();
            else abortSignal.addEventListener('abort', abort, { once: true });
          });
          return inputData;
        },
      });
      const workflow = new Workflow({
        id: 'cancelable-test',
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ value: z.string() }),
        mastra: mastra.instance,
      })
        .then(wait)
        .commit();
      const run = await workflow.createRun({ runId: 'cancel-run' });
      const resultPromise = run.start({ inputData: { value: 'seed' } });
      await entered;
      await run.cancel();
      const result = await resultPromise;
      expect(result.status).toBe('canceled');
      expect((await workflow.getWorkflowRunById('cancel-run'))?.status).toBe('canceled');
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('persists run snapshots to the shared Mastra storage when an instance is provided', async () => {
    const file = join(
      tmpdir(),
      `kestrel-wf-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    const url = `file:${file}`;
    try {
      const store = new LibSQLStore({ id: 'test-store', url });
      const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
      await initializeKestrelMastra(mastra);

      const workflow = createCommitteeWorkflow({ ...deps, mastra: mastra.instance }, 'full');
      const result = await startWorkflow(workflow, 'wf-snap', {
        prompt: 'Analyse EURUSD',
        symbol: 'EURUSD',
        mode: 'full',
      });

      expect(result.status).toBe('success');
      const state = await workflow.getWorkflowRunById('wf-snap');
      expect(state).not.toBeNull();
      expect((state as { workflowName?: string } | null)?.workflowName).toBe('symbol-research');
      expect(state?.status).toBe('success');
      expect(Object.keys(state?.steps ?? {})).toEqual(
        expect.arrayContaining([
          'collect-packet',
          'technical',
          'fundamental',
          'risk',
          'sentiment',
          'verify',
          'fusion',
        ]),
      );
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('fails terminally on fundamental specialist failure in Full (Q3: no partial mode)', async () => {
    mocks.failFundamental = true;

    const workflow = createCommitteeWorkflow(deps, 'full');
    const result = await startWorkflow(workflow, 'wf-full-partial', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.message ?? '').toContain('Failed agents: fundamental');
  });

  it('forces specialist memory read-only and lets only the synthesizer write', async () => {
    const workflow = createCommitteeWorkflow(deps, 'full');
    const result = await startWorkflow(workflow, 'wf-readonly-memory', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('success');
    // §3.2: critique agents are read-only desks too — exclude them from the
    // specialist count but assert their memory is read-only as well.
    const specialistCalls = mocks.generateCalls.filter(
      (call) => !call.id.includes('decision') && !call.id.includes('-critique'),
    );
    const critiqueCalls = mocks.generateCalls.filter((call) => call.id.includes('-critique'));
    expect(critiqueCalls).toHaveLength(4);
    for (const call of critiqueCalls) {
      const memory = call.options?.memory as { options?: { readOnly?: boolean } } | undefined;
      expect(memory?.options?.readOnly).toBe(true);
    }
    const fusionCall = mocks.generateCalls.find((call) => call.id.includes('decision'));
    expect(specialistCalls).toHaveLength(4);
    for (const call of specialistCalls) {
      const memory = call.options?.memory as { options?: { readOnly?: boolean } } | undefined;
      expect(memory?.options?.readOnly).toBe(true);
    }
    const fusionMemory = fusionCall?.options?.memory as
      { options?: { readOnly?: boolean } } | undefined;
    expect(fusionMemory?.options?.readOnly).not.toBe(true);
  });

  it('converts a committee deadline into a strict failure with the failed specialists (§1.7)', async () => {
    mocks.hangSpecialists = true;
    try {
      const workflow = createCommitteeWorkflow({ ...deps, deadlineMs: 50 }, 'full');
      const result = await startWorkflow(workflow, 'wf-deadline', {
        prompt: 'Full committee analysis',
        symbol: 'EURUSD',
        mode: 'full',
      });
      expect(result.status).toBe('failed');
      const message = result.error?.message ?? '';
      expect(message).toContain('Failed agents:');
      // Every specialist that hung past the deadline is listed, and the user
      // is told to retry — no partial answer (Q3).
      expect(message).toContain('timed out');
      expect(message).toContain('please retry');
    } finally {
      mocks.hangSpecialists = false;
    }
  }, 15_000);

  it('emits workflow progress exactly once per stage for Full', async () => {
    const stages: string[] = [];
    const workflow = createCommitteeWorkflow(
      {
        ...deps,
        onProgress: (step) => {
          stages.push(step);
        },
      },
      'full',
    );
    const result = await startWorkflow(workflow, 'wf-progress-once', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });

    expect(result.status).toBe('success');
    expect(stages).toEqual([
      'collect-packet',
      'technical',
      'fundamental',
      'risk',
      'sentiment',
      // §3.2 (Q6): the cross-critique round is a first-class stage for Full.
      'critique',
      'verify',
      'fusion',
    ]);
  });

  it('produces cross-critique records for Full and skips them for single (§3.2, Q6)', async () => {
    const fullWorkflow = createCommitteeWorkflow(deps, 'full');
    const fullResult = await startWorkflow(fullWorkflow, 'wf-critique-full', {
      prompt: 'Full committee analysis',
      symbol: 'EURUSD',
      mode: 'full',
    });
    expect(fullResult.status).toBe('success');
    const fullOutput = fullResult.result as { critiques: unknown[] };
    expect(fullOutput.critiques).toHaveLength(4);

    const singleWorkflow = createCommitteeWorkflow(deps, 'single');
    const singleResult = await startWorkflow(singleWorkflow, 'wf-critique-single', {
      prompt: 'Single technical read',
      symbol: 'EURUSD',
      mode: 'single',
    });
    expect(singleResult.status).toBe('success');
    const singleOutput = singleResult.result as { critiques: unknown[] };
    expect(singleOutput.critiques).toHaveLength(0);
  });

  it('skips the critique round when ENABLE_COMMITTEE_CRITIQUE=0 (rollback flag)', async () => {
    process.env.ENABLE_COMMITTEE_CRITIQUE = '0';
    try {
      const workflow = createCommitteeWorkflow(deps, 'full');
      const result = await startWorkflow(workflow, 'wf-critique-off', {
        prompt: 'Full committee analysis',
        symbol: 'EURUSD',
        mode: 'full',
      });
      expect(result.status).toBe('success');
      const output = result.result as { critiques: unknown[] };
      expect(output.critiques).toHaveLength(0);
    } finally {
      delete process.env.ENABLE_COMMITTEE_CRITIQUE;
    }
  });
});
