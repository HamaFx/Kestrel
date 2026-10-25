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

// DEC-01 invariant — turns are admitted against the local daily USD ledger
// only. There is no credit wallet, reservation, or subscription dependency
// left in the budget facade.

import { metrics } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetBudgetEnforcementCache,
  acquireBudget,
  effectiveDailyCap,
  reserveTurnBudget,
  UNCAPPED_DAILY_USD,
} from '../src/budget';

const mocks = vi.hoisted(() => ({
  tryReserveBudget: vi.fn(),
  applyBudgetDelta: vi.fn(),
  reconcileBudgetReservation: vi.fn(),
  releaseBudgetReservation: vi.fn(),
}));

vi.mock('../src/budget/cost', async () => {
  const actual = await vi.importActual<object>('../src/budget/cost');
  return {
    ...actual,
    tryReserveBudget: mocks.tryReserveBudget,
    applyBudgetDelta: mocks.applyBudgetDelta,
    reconcileBudgetReservation: mocks.reconcileBudgetReservation,
    releaseBudgetReservation: mocks.releaseBudgetReservation,
  };
});

beforeEach(() => {
  metrics.reset();
  delete process.env.ENFORCE_BUDGET;
  _resetBudgetEnforcementCache();
  mocks.tryReserveBudget.mockReset();
  mocks.applyBudgetDelta.mockReset().mockResolvedValue(undefined);
  mocks.reconcileBudgetReservation.mockReset().mockResolvedValue(true);
  mocks.releaseBudgetReservation.mockReset().mockResolvedValue(true);
});

describe('local daily USD budget cap', () => {
  it('uses the configured cap only when enforcement is explicitly enabled', () => {
    expect(effectiveDailyCap(5)).toBe(UNCAPPED_DAILY_USD);

    process.env.ENFORCE_BUDGET = 'true';
    expect(effectiveDailyCap(5)).toBe(5);
  });

  it('passes the effective cap to the USD ledger and reports it back', async () => {
    process.env.ENFORCE_BUDGET = 'true';
    mocks.tryReserveBudget.mockResolvedValue({ ok: true, spent: 0.05, max: 5 });

    const result = await acquireBudget({ userId: 'user-1', maxDailyUsd: 5 });

    expect(result.effectiveCap).toBe(5);
    expect(mocks.tryReserveBudget).toHaveBeenCalledWith(
      'user-1',
      0.01,
      5,
      expect.any(Date),
      undefined,
      undefined,
      undefined,
    );
  });

  it('settles a BYOK turn against the durable USD reservation with no credit handle', async () => {
    mocks.tryReserveBudget.mockResolvedValue({
      ok: true,
      spent: 0.02,
      max: 5,
      reservationId: 'budget-reservation-1',
    });

    const handle = await reserveTurnBudget({
      userId: 'user-1',
      estimateUsd: 0.02,
      maxDailyUsd: 5,
    });

    expect(handle).not.toHaveProperty('credit');
    expect(handle.reservationId).toBe('budget-reservation-1');
    // A BYOK turn's actual cost is settled exactly once.
    await handle.reconcile(0.017);
    expect(mocks.reconcileBudgetReservation).toHaveBeenCalledWith('budget-reservation-1', 0.017);
    expect(handle.released).toBe(true);
  });

  it('rejects over-cap admission only under enforcement', async () => {
    process.env.ENFORCE_BUDGET = 'true';
    mocks.tryReserveBudget.mockResolvedValue({ ok: false, spent: 5, max: 5 });

    await expect(reserveTurnBudget({ userId: 'user-1', maxDailyUsd: 5 })).rejects.toMatchObject({
      name: 'BudgetExceededError',
    });
    expect(metrics.snapshot().counters['budget_reserved_total']).toBeUndefined();
  });
});
