import { describe, expect, it, vi } from 'vitest';

import { createFullAnalysisCoordinator } from '../src/jobs/full-analysis-coordinator';

function budget() {
  return {
    reservedUsd: 1,
    spent: 0,
    max: 5,
    released: false,
    reconcile: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
}

describe('createFullAnalysisCoordinator', () => {
  it('transitions and reconciles completion exactly once', async () => {
    const handle = budget();
    const complete = vi.fn(async () => undefined);
    const coordinator = createFullAnalysisCoordinator({
      budget: handle,
      transitions: { complete, fail: vi.fn(), requeue: vi.fn() },
      isLeaseLost: () => false,
      isCancelled: () => false,
    });
    coordinator.markResult(0.4);
    await Promise.all([coordinator.complete({ ok: true }), coordinator.complete({ ok: true })]);
    expect(complete).toHaveBeenCalledOnce();
    expect(handle.reconcile).toHaveBeenCalledWith(0.4);
  });

  it('discards completion and settlement after lease loss', async () => {
    const handle = budget();
    const complete = vi.fn(async () => undefined);
    const coordinator = createFullAnalysisCoordinator({
      budget: handle,
      transitions: { complete, fail: vi.fn(), requeue: vi.fn() },
      isLeaseLost: () => true,
      isCancelled: () => false,
    });
    coordinator.markResult(0.4);
    await coordinator.complete({ ok: true });
    expect(complete).not.toHaveBeenCalled();
    expect(handle.reconcile).not.toHaveBeenCalled();
  });

  it('requeues without settling so the next attempt books the reservation once (Phase 8)', async () => {
    const handle = budget();
    const requeue = vi.fn(async () => undefined);
    const coordinator = createFullAnalysisCoordinator({
      budget: handle,
      transitions: { complete: vi.fn(), fail: vi.fn(), requeue },
      isLeaseLost: () => false,
      isCancelled: () => false,
    });

    await coordinator.requeue('attempt failed; retrying');
    await coordinator.requeue('attempt failed; retrying');

    expect(requeue).toHaveBeenCalledTimes(1);
    expect(handle.release).not.toHaveBeenCalled();
    expect(handle.reconcile).not.toHaveBeenCalled();
    expect(coordinator.settled).toBe(false);
  });
});
