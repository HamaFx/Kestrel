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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../src/db', () => ({ getDb: mocks.getDb }));

vi.mock('@kestrel/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@kestrel/db');
  return { ...actual };
});

import {
  _resetCircuits,
  isCircuitOpen,
  recordModelFailure,
  recordModelSuccess,
} from '../src/model-circuit-breaker';

interface FakeRow {
  consecutiveFailures: number;
  openedAt: Date | null;
}

function fakeDbWithRow(row: FakeRow | null): void {
  mocks.getDb.mockReturnValue({
    execute: mocks.execute,
    insert: mocks.insert.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
    select: mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(row ? [row] : []),
        }),
      }),
    }),
  });
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
