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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  executeMastraTool,
  finishMastraRun,
  getMastraGenerationStats,
  isMastraTelemetryDegraded,
  mastraOutcomeForError,
  resetMastraTelemetryHealth,
} from '../src/mastra-v2/shared/telemetry';
import { TELEMETRY_KINDS, type TelemetryInput } from '../src/persistence/telemetry-persistence';

const mocks = vi.hoisted(() => ({
  recordTelemetry: vi.fn().mockResolvedValue(undefined),
  recordToolTelemetry: vi.fn().mockResolvedValue(true),
  flushMetrics: vi.fn().mockResolvedValue(undefined),
  flushLangfuse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/persistence', () => ({
  recordTelemetry: mocks.recordTelemetry,
  recordToolTelemetry: mocks.recordToolTelemetry,
}));
vi.mock('@kestrel/shared/metrics-export', () => ({
  flushMetrics: mocks.flushMetrics,
}));
vi.mock('../src/runtime/instrumentation', () => ({
  flushLangfuse: mocks.flushLangfuse,
}));

describe('Mastra telemetry boundaries', () => {
  beforeEach(() => {
    metrics.reset();
    resetMastraTelemetryHealth();
    mocks.recordTelemetry.mockClear();
    mocks.recordToolTelemetry.mockClear();
    mocks.flushMetrics.mockClear();
    mocks.flushLangfuse.mockClear();
  });

  it('normalizes total usage and counts tool steps', () => {
    expect(
      getMastraGenerationStats({
        totalUsage: { inputTokens: 120, outputTokens: 45 },
        toolCalls: [{}, {}],
        steps: [{}, {}, {}],
      }),
    ).toEqual({ inputTokens: 120, outputTokens: 45, toolCalls: 2, steps: 3 });

    expect(
      getMastraGenerationStats({
        usage: { promptTokens: 7, completionTokens: 9 },
      }),
    ).toEqual({ inputTokens: 7, outputTokens: 9, toolCalls: 0, steps: 0 });
  });

  it('classifies aborts separately from ordinary failures', () => {
    const controller = new AbortController();
    controller.abort();

    expect(mastraOutcomeForError(new Error('cancelled'), controller.signal)).toBe('cancelled');
    expect(
      mastraOutcomeForError(Object.assign(new Error('cancelled'), { name: 'AbortError' })),
    ).toBe('cancelled');
    expect(mastraOutcomeForError(new Error('provider failed'))).toBe('failed');
  });

  it('records a successful tool without exposing its payload to telemetry', async () => {
    const span = vi.fn(<T>(_name: string, fn: () => T | Promise<T>): Promise<T> =>
      Promise.resolve(fn()),
    );
    const context = {
      requestContext: {
        get: (key: string) => ({ userId: 'user-1', runId: 'run-1', threadId: 'thread-1' })[key],
      },
      observe: {
        span,
        log: vi.fn(),
      },
    } as unknown as Parameters<typeof executeMastraTool>[1];

    const result = await executeMastraTool('get-xauusd-price', context, async () => ({
      secret: 'do-not-log',
    }));
    await vi.waitFor(() => expect(mocks.recordToolTelemetry).toHaveBeenCalledTimes(1));

    expect(result).toEqual({ secret: 'do-not-log' });
    expect(span).toHaveBeenCalledWith(
      'kestrel.mastra.tool.get-xauusd-price',
      expect.any(Function),
      expect.objectContaining({ tool: 'get-xauusd-price' }),
    );
    expect(mocks.recordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        threadId: 'thread-1',
        tool: 'get-xauusd-price',
        ok: true,
        outputChars: expect.any(Number),
      }),
    );
    expect(
      metrics.snapshot().counters[
        'mastra_tool_call_total{agent=kestrel-xauusd-research-poc,outcome=success,tool=get-xauusd-price}'
      ],
    ).toBe(1);
  });

  it('records failed tools and rethrows the original error', async () => {
    const error = new Error('provider unavailable');
    const context = {
      requestContext: {
        get: (key: string) => ({ userId: 'user-1', runId: 'run-2' })[key],
      },
    };

    await expect(
      executeMastraTool('get-xauusd-candles', context, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await vi.waitFor(() => expect(mocks.recordToolTelemetry).toHaveBeenCalledTimes(1));

    expect(mocks.recordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-2',
        tool: 'get-xauusd-candles',
        ok: false,
        errorCode: 'Error',
      }),
    );
    expect(
      metrics.snapshot().counters[
        'mastra_tool_failed_total{agent=kestrel-xauusd-research-poc,error=Error,tool=get-xauusd-candles}'
      ],
    ).toBe(1);
  });

  it('records a terminal run, database telemetry, and exporter flushes', async () => {
    await finishMastraRun({
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-3',
      model: 'google/gemini-2.5-flash',
      providerId: 'google',
      startedAt: Date.now() - 20,
      inputTokens: 100,
      outputTokens: 40,
      toolCalls: 3,
      steps: 4,
      outcome: 'success',
    });

    expect(mocks.recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        threadId: 'thread-1',
        runId: 'run-3',
        model: 'google/gemini-2.5-flash',
        inputTokens: 100,
        outputTokens: 40,
        toolCalls: 3,
        idempotencyKey: 'mastra.run:run-3',
        // P-03 (audit 2026-10-18): footprint-neutral kind by default.
        kind: 'mastra_xauusd_research',
      }),
    );
    expect(mocks.flushLangfuse).toHaveBeenCalledOnce();
    expect(mocks.flushMetrics).toHaveBeenCalledOnce();
    expect(
      metrics.snapshot().counters[
        'mastra_run_total{agent=kestrel-xauusd-research-poc,outcome=success}'
      ],
    ).toBe(1);
  });

  it('labels canonical runs and keeps terminal telemetry idempotent', async () => {
    await finishMastraRun({
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'canonical-run-1',
      model: 'google/gemini-3.6-flash',
      providerId: 'google',
      startedAt: Date.now(),
      inputTokens: 2,
      outputTokens: 3,
      toolCalls: 0,
      steps: 1,
      outcome: 'success',
      telemetryKind: 'mastra_canonical_chat',
    });

    expect(mocks.recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'mastra.run:canonical-run-1',
        kind: 'mastra_canonical_chat',
      }),
    );
  });

  it('does not fail the AI result when observability exporters are unavailable', async () => {
    mocks.flushLangfuse.mockRejectedValueOnce(new Error('Langfuse unavailable'));
    mocks.flushMetrics.mockRejectedValueOnce(new Error('Metrics exporter unavailable'));

    await expect(
      finishMastraRun({
        userId: 'user-1',
        threadId: 'thread-1',
        runId: 'run-exporter-failure',
        model: 'google/gemini-2.5-flash',
        providerId: 'google',
        startedAt: Date.now(),
        inputTokens: 1,
        outputTokens: 1,
        toolCalls: 0,
        steps: 1,
        outcome: 'success',
      }),
    ).resolves.toBeUndefined();

    expect(mocks.recordTelemetry).toHaveBeenCalledOnce();
    expect(mocks.flushLangfuse).toHaveBeenCalledOnce();
    expect(mocks.flushMetrics).toHaveBeenCalledOnce();
  });

  it('exposes degradation health when a telemetry surface fails', async () => {
    mocks.flushMetrics.mockRejectedValueOnce(new Error('exporter down'));

    await finishMastraRun({
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-health',
      model: 'google/gemini-2.5-flash',
      providerId: 'google',
      startedAt: Date.now(),
      inputTokens: 1,
      outputTokens: 1,
      toolCalls: 0,
      steps: 1,
      outcome: 'success',
    });

    expect(isMastraTelemetryDegraded()).toBe(true);
    expect(metrics.snapshot().counters).toHaveProperty(
      'metrics_flush_failed_total{surface=metrics}',
      1,
    );
  });
});

describe('telemetry vocabulary (audit v2 §4.5)', () => {
  beforeEach(() => {
    metrics.reset();
    resetMastraTelemetryHealth();
    mocks.recordTelemetry.mockClear();
  });

  it('documents only kinds live writers emit — the dead title_* vocabulary is gone', () => {
    // P2-5: title_generated/title_failed/title_skipped_budget were declared
    // but never emitted by the Mastra-native title path (title cost is
    // reconciled through the parent turn's ledger). They remain readable as
    // legacy DB values but are no longer part of the emitted vocabulary.
    expect(TELEMETRY_KINDS.filter((kind) => kind.startsWith('title_'))).toEqual([]);
    // P-03: the neutral names are live; the *_poc aliases stay readable for
    // one release so historical dashboards keep resolving.
    expect([...TELEMETRY_KINDS]).toContain('mastra_xauusd_research');
    expect([...TELEMETRY_KINDS]).toContain('mastra_xauusd_research_failed');
    expect([...TELEMETRY_KINDS]).toContain('mastra_xauusd_poc');
    expect([...TELEMETRY_KINDS]).toContain('mastra_canonical_chat_failed');
    expect([...TELEMETRY_KINDS]).toContain('turn_failed');
  });

  it('finishMastraRun emits only documented kinds and never the dead usageKnown field', async () => {
    const base = {
      userId: 'user-1',
      threadId: 'thread-1',
      model: 'google/gemini-2.5-flash',
      providerId: 'google',
      startedAt: Date.now(),
      inputTokens: 1,
      outputTokens: 1,
      toolCalls: 0,
      steps: 1,
    };
    const telemetryKinds = [
      undefined,
      'mastra_xauusd_research',
      'mastra_xauusd_poc',
      'mastra_mode',
      'mastra_full_job',
      'mastra_worker_task',
      'mastra_canonical_chat',
    ] as const;

    for (const outcome of ['success', 'failed', 'cancelled'] as const) {
      for (const telemetryKind of telemetryKinds) {
        mocks.recordTelemetry.mockClear();
        await finishMastraRun({
          ...base,
          runId: `run-vocab-${outcome}-${telemetryKind ?? 'default'}`,
          outcome,
          ...(telemetryKind ? { telemetryKind } : {}),
          ...(outcome === 'success' ? {} : { error: new Error('boom') }),
        });

        expect(mocks.recordTelemetry).toHaveBeenCalledTimes(1);
        const recorded = mocks.recordTelemetry.mock.calls[0]![0] as Record<string, unknown>;
        // The dead usageKnown field (no chat_telemetry column) is not written.
        expect(recorded).not.toHaveProperty('usageKnown');
        // Every emitted kind is part of the documented set.
        expect([...TELEMETRY_KINDS]).toContain(recorded.kind);
        expect(String(recorded.kind).startsWith('title_')).toBe(false);
        // P-03: new writes never emit the legacy *_poc names — they are
        // normalized to the neutral vocabulary on write.
        if (outcome === 'success') {
          expect(recorded.kind).not.toBe('mastra_xauusd_poc');
        }
        expect(recorded.kind).not.toBe('mastra_xauusd_poc_failed');
      }
    }
  });

  it('TelemetryInput rejects the dropped usageKnown field at compile time', () => {
    // Static guard: chat_telemetry has no usage_known column (P2-5), so the
    // writer input type must reject the field. If this file compiles, the
    // vocabulary fix holds.
    const rejected: TelemetryInput = {
      threadId: 'thread-1',
      messageId: null,
      model: 'test/model',
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      ms: 0,
      // @ts-expect-error audit v2 §4.5 — usageKnown dropped (no DB column)
      usageKnown: false,
    };
    expect(rejected.threadId).toBe('thread-1');
  });
});
