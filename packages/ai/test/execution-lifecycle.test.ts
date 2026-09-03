import { describe, expect, it, vi } from 'vitest';

import type { BudgetHandle } from '../src/budget-reservation';
import { createExecutionLifecycle } from '../src/execution-lifecycle';

function budgetMock(): BudgetHandle {
  return {
    reservedUsd: 1,
    spent: 0,
    max: 10,
    released: false,
    reconcile: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
}

describe('createExecutionLifecycle', () => {
  it('settles concurrent terminal signals exactly once', async () => {
    const budget = budgetMock();
    const lifecycle = createExecutionLifecycle(budget);

    await Promise.all([lifecycle.complete(0.25), lifecycle.complete(0.25), lifecycle.fail()]);

    expect(budget.reconcile).toHaveBeenCalledTimes(1);
    expect(budget.reconcile).toHaveBeenCalledWith(0.25);
    expect(budget.release).not.toHaveBeenCalled();
    expect(lifecycle.state).toBe('completed');
  });

  it('does not replace a failure with a later completion', async () => {
    const budget = budgetMock();
    const lifecycle = createExecutionLifecycle(budget);

    await lifecycle.fail();
    await lifecycle.complete(0.5);

    expect(budget.release).toHaveBeenCalledTimes(1);
    expect(budget.reconcile).not.toHaveBeenCalled();
    expect(lifecycle.state).toBe('failed');
    expect(lifecycle.settled).toBe(true);
  });

  it('settles cancellation exactly once', async () => {
    const budget = budgetMock();
    const lifecycle = createExecutionLifecycle(budget);

    await Promise.all([lifecycle.cancel(), lifecycle.cancel(), lifecycle.fail()]);

    expect(budget.release).toHaveBeenCalledTimes(1);
    expect(budget.reconcile).not.toHaveBeenCalled();
    expect(lifecycle.state).toBe('cancelled');
  });

  it.each([
    ['success', 'complete', 0.5],
    ['provider failure', 'fail', undefined],
    ['cancellation', 'cancel', undefined],
  ])('settles the %s path once', async (_name, operation, cost) => {
    const budget = budgetMock();
    const lifecycle = createExecutionLifecycle(budget);
    const settle = lifecycle[operation as 'complete' | 'fail' | 'cancel'];

    await Promise.all([
      operation === 'complete' ? settle(cost as number) : settle(undefined as never),
      operation === 'complete' ? settle(cost as number) : settle(undefined as never),
      lifecycle.fail(),
    ]);

    if (operation === 'complete') expect(budget.reconcile).toHaveBeenCalledOnce();
    else expect(budget.release).toHaveBeenCalledOnce();
    expect(lifecycle.settled).toBe(true);
  });

  it('keeps the terminal state when settlement infrastructure rejects', async () => {
    const budget = budgetMock();
    budget.reconcile = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const lifecycle = createExecutionLifecycle(budget);

    await expect(lifecycle.complete(0.5)).rejects.toThrow('database unavailable');
    await expect(lifecycle.fail()).rejects.toThrow('database unavailable');

    expect(budget.reconcile).toHaveBeenCalledTimes(1);
    expect(budget.release).not.toHaveBeenCalled();
    expect(lifecycle.state).toBe('completed');
  });
});
