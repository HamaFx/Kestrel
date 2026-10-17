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

// Audit plan §1.6 (P1-4) — the circuit breaker keeps its in-memory Map as an
// L1 cache while `provider_circuit_state` is the cross-instance source of
// truth. These tests mock the DB layer: failures write through, successes
// reset the shared row, refreshes converge remote state into L1, and DB
// outages degrade to the old per-instance behavior.
//
// Audit plan §1.4 (P0-4) — the breaker is keyed by the resolved MODEL id
// (the qualified "<provider>/<model>" string), never the bare provider id.
// Run outcomes are recorded from `finishMastraRun`, reads and writes bind
// the identical key, and the shared DB row mirrors the L1 window/reset
// semantics (3 consecutive in-window failures open the circuit; a success
// resets it; a DB outage degrades to per-instance L1 behavior).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../src/db', () => ({ getDb: mocks.getDb }));

vi.mock('@kestrel/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@kestrel/db');
  return { ...actual };
});

// §1.4 wiring tests import `finishMastraRun`; its heavy collaborators are
// mocked so only the real run-telemetry + circuit-breaker modules execute.
vi.mock('../src/cost', () => ({ estimateKnownCostUsd: vi.fn(() => 0) }));
vi.mock('../src/diagnostics', () => ({
  recordStep: vi.fn(),
  completeStep: vi.fn(),
  recordError: vi.fn(),
}));
vi.mock('../src/instrumentation', () => ({ flushLangfuse: vi.fn(async () => {}) }));
vi.mock('../src/mastra-v2/shared/constants', () => ({
  MASTRA_XAUUSD_AGENT_ID: 'test-agent',
  MASTRA_XAUUSD_AGENT_VERSION: '0.0.0-test',
}));
vi.mock('../src/mastra-v2/instance', () => ({
  getKestrelMastra: vi.fn(() => ({ instance: {} })),
}));
vi.mock('../src/mastra-v2/telemetry', () => ({
  flushMastraObservability: vi.fn(async () => {}),
}));
vi.mock('../src/persistence', () => ({ recordTelemetry: vi.fn(async () => {}) }));
vi.mock('@kestrel/shared/metrics-export', () => ({
  flushMetrics: vi.fn(async () => {}),
}));

import {
  _resetCircuits,
  isCircuitOpen,
  recordModelFailure,
  recordModelSuccess,
} from '../src/model-circuit-breaker';
import { finishMastraRun, type MastraRunObservation } from '../src/mastra-v2/shared/run-telemetry';

interface FakeRow {
  consecutiveFailures: number;
  openedAt: Date | null;
}

function fakeDbWithRow(row: FakeRow | null): void {
  mocks.getDb.mockReturnValue({
    execute: mocks.execute,
    insert: mocks.insert.mockReturnValue({
      values: mocks.insertValues.mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
    select: mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mocks.where.mockReturnValue({
          limit: vi.fn().mockResolvedValue(row ? [row] : []),
        }),
      }),
    }),
  });
}

/**
 * Extract the raw bound parameters from a drizzle `sql` template object.
 * `queryChunks` holds StringChunk objects (which carry the SQL text) and
 * the bound values themselves (raw primitives).
 */
function sqlParams(sqlArg: unknown): unknown[] {
  const chunks = (sqlArg as { queryChunks?: unknown[] } | null | undefined)?.queryChunks ?? [];
  const params: unknown[] = [];
  for (const chunk of chunks) {
    if (
      chunk instanceof Date ||
      ['string', 'number', 'boolean', 'bigint'].includes(typeof chunk)
    ) {
      params.push(chunk);
    } else if (
      chunk !== null &&
      typeof chunk === 'object' &&
      'value' in chunk &&
      !Array.isArray((chunk as { value: unknown }).value)
    ) {
      // drizzle `Param` wrapper (defensive: some versions wrap raw values).
      params.push((chunk as { value: unknown }).value);
    }
  }
  return params;
}

/** Reconstruct the SQL text of a drizzle `sql` template object. */
function sqlText(sqlArg: unknown): string {
  const chunks = (sqlArg as { queryChunks?: unknown[] } | null | undefined)?.queryChunks ?? [];
  return chunks
    .filter((chunk) => chunk !== null && typeof chunk === 'object' && 'value' in chunk)
    .map((chunk) => {
      const value = (chunk as { value: unknown }).value;
      return Array.isArray(value) ? value.join('') : String(value);
    })
    .join('');
}

function runObservation(
  outcome: MastraRunObservation['outcome'],
  overrides: Partial<MastraRunObservation> = {},
): MastraRunObservation {
  return {
    userId: 'user-1',
    threadId: 'thread-1',
    runId: 'run-1',
    model: 'google/gemini-2.5-flash',
    providerId: 'google',
    startedAt: Date.now(),
    inputTokens: 10,
    outputTokens: 10,
    toolCalls: 0,
    steps: 1,
    outcome,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetCircuits();
  fakeDbWithRow(null);
});

describe('model circuit breaker (§1.6)', () => {
  it('opens after three consecutive failures and auto-closes after the open duration', () => {
    vi.useFakeTimers();
    try {
      expect(recordModelFailure('provider/model')).toBe(false);
      expect(recordModelFailure('provider/model')).toBe(false);
      expect(recordModelFailure('provider/model')).toBe(true);
      expect(isCircuitOpen('provider/model')).toBe(true);

      vi.advanceTimersByTime(31_000);
      expect(isCircuitOpen('provider/model')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets immediately on success', () => {
    recordModelFailure('provider/model');
    recordModelFailure('provider/model');
    recordModelSuccess('provider/model');
    expect(isCircuitOpen('provider/model')).toBe(false);
  });

  it('writes failures through to provider_circuit_state', async () => {
    recordModelFailure('provider/model');
    // Fire-and-forget write — let the microtask queue drain.
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalled());
    expect(mocks.execute.mock.calls[0]?.[0]).toBeDefined();
  });

  it('writes success resets through to provider_circuit_state', async () => {
    recordModelSuccess('provider/model');
    await vi.waitFor(() => expect(mocks.insert).toHaveBeenCalled());
  });

  it('converges cross-isolate open state into the L1 cache', async () => {
    fakeDbWithRow({ consecutiveFailures: 5, openedAt: new Date() });
    // First read triggers the throttled background refresh.
    expect(isCircuitOpen('provider/model')).toBe(false);
    await vi.waitFor(() => expect(mocks.select).toHaveBeenCalled());
    // Give the refresh a moment to land, then read again.
    await vi.waitFor(() => expect(isCircuitOpen('provider/model')).toBe(true));
  });

  it('degrades to per-instance state when the database is unavailable', async () => {
    mocks.getDb.mockImplementation(() => {
      throw new Error('DATABASE_URL not configured');
    });
    // No throw — the breaker keeps working from the in-memory Map.
    expect(recordModelFailure('provider/model')).toBe(false);
    recordModelFailure('provider/model');
    expect(recordModelFailure('provider/model')).toBe(true);
    expect(isCircuitOpen('provider/model')).toBe(true);
  });
});

describe('model circuit breaker (§1.4 — model-id keying)', () => {
  it('opens the model circuit after 3 consecutive failures without touching sibling keys', () => {
    expect(recordModelFailure('google/gemini-2.5-flash')).toBe(false);
    expect(recordModelFailure('google/gemini-2.5-flash')).toBe(false);
    expect(recordModelFailure('google/gemini-2.5-flash')).toBe(true);
    expect(isCircuitOpen('google/gemini-2.5-flash')).toBe(true);
    // The breaker is keyed by the resolved model id, so the bare provider
    // id (the legacy key) and sibling models keep their own circuits.
    expect(isCircuitOpen('google')).toBe(false);
    expect(isCircuitOpen('google/gemini-2.5-pro')).toBe(false);
  });

  it('binds the identical model id as the DB key on both write and read', async () => {
    const modelId = 'google/gemini-2.5-flash';

    // 1. Failure write-through: the INSERT/UPDATE must bind the model id.
    recordModelFailure(modelId);
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalled());
    const writeParams = sqlParams(mocks.execute.mock.calls[0]?.[0]);
    expect(writeParams).toContain(modelId);
    // Never the bare provider id.
    expect(writeParams).not.toContain('google');

    // 2. Read path: the throttled background refresh SELECT must filter on
    //    the same model id that was written.
    isCircuitOpen(modelId);
    await vi.waitFor(() => expect(mocks.select).toHaveBeenCalled());
    const readParams = sqlParams(mocks.where.mock.calls[0]?.[0]);
    expect(readParams).toContain(modelId);
    expect(readParams).not.toContain('google');

    // 3. Success write-through: the reset row must use the same key too.
    recordModelSuccess(modelId);
    await vi.waitFor(() => expect(mocks.insertValues).toHaveBeenCalled());
    expect(mocks.insertValues.mock.calls[0]?.[0]).toMatchObject({ modelId });
  });

  it('mirrors the L1 window/reset semantics in the DB failure write', async () => {
    recordModelFailure('google/gemini-2.5-flash');
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalled());
    const writeSql = mocks.execute.mock.calls[0]?.[0];
    const text = sqlText(writeSql);
    // Inside the window the shared counter increments…
    expect(text).toContain('consecutive_failures + 1');
    // …but once the previous update is older than the 60s window, the row
    // resets to 1 — the same fresh-window rule L1 applies.
    expect(text).toContain('ELSE 1');
    // The window boundary is bound as (opened_at − WINDOW_MS).
    const params = sqlParams(writeSql);
    const dates = params.filter((p): p is Date => p instanceof Date);
    expect(dates.length).toBeGreaterThan(0);
    const openedAt = dates[0] as Date;
    expect(dates.some((d) => d.getTime() === openedAt.getTime() - 60_000)).toBe(true);
  });
});

describe('§1.4 wiring — finishMastraRun feeds the breaker by resolved model id', () => {
  it('records a failure per terminal provider failure and opens the circuit', async () => {
    await finishMastraRun(runObservation('failed'));
    await finishMastraRun(runObservation('failed'));
    await finishMastraRun(runObservation('failed'));
    expect(isCircuitOpen('google/gemini-2.5-flash')).toBe(true);
  });

  it('records a success that resets the failure count', async () => {
    await finishMastraRun(runObservation('failed'));
    await finishMastraRun(runObservation('failed'));
    await finishMastraRun(runObservation('success'));
    await finishMastraRun(runObservation('failed'));
    await finishMastraRun(runObservation('failed'));
    expect(isCircuitOpen('google/gemini-2.5-flash')).toBe(false);
  });

  it('does not count a cancelled run as a provider failure', async () => {
    await finishMastraRun(runObservation('cancelled'));
    expect(isCircuitOpen('google/gemini-2.5-flash')).toBe(false);
    // Neither a failure nor a success was written through.
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('ignores runs whose model never resolved', async () => {
    await finishMastraRun(
      runObservation('failed', { model: 'unresolved', providerId: 'unresolved' }),
    );
    expect(isCircuitOpen('unresolved')).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
