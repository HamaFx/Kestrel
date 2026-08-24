import 'server-only';

import type { BudgetHandle } from '@kestrel/ai';
import { metrics } from '@kestrel/shared';

/**
 * Per-stream finalizer. It makes completion, abort, and failure callbacks
 * mutually exclusive so budget reconciliation and interruption persistence
 * cannot run twice when both the producer and HTTP stream observe shutdown.
 */
export function createMastraStreamFinalizer(options: {
  budget: BudgetHandle;
  onInterrupted: () => void | Promise<void>;
}) {
  let settled = false;
  let inFlight: Promise<void> | null = null;

  function once(operation: () => Promise<void>): Promise<void> {
    if (settled) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = operation().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    async complete(observedCost: number): Promise<void> {
      await once(async () => {
        await options.budget.reconcile(observedCost);
        if (options.budget.released) settled = true;
      });
    },
    async fail(): Promise<void> {
      await once(async () => {
        await options.budget.release();
        if (options.budget.released) settled = true;
      });
    },
    async abort(): Promise<void> {
      await once(async () => {
        metrics.increment('stream_abort_release_total');
        await options.budget.release();
        await options.onInterrupted();
        if (options.budget.released) settled = true;
      });
    },
    get settled(): boolean {
      return settled;
    },
  };
}
