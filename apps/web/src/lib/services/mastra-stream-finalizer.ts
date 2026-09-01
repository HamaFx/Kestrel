import 'server-only';

import { type BudgetHandle } from '@kestrel/ai';
import { createStreamLifecycleCoordinator } from './mastra-chat-service-lifecycle';
import { metrics } from '@kestrel/shared';

/**
 * Stream adapter for the shared lifecycle. Completion, abort, and failure
 * signals are mutually exclusive even when producer and HTTP shutdown race.
 */
export function createMastraStreamFinalizer(options: {
  budget: BudgetHandle;
  onInterrupted: () => void | Promise<void>;
}) {
  const coordinator = createStreamLifecycleCoordinator(options.budget, options.onInterrupted);

  return {
    async complete(observedCost: number): Promise<void> {
      await coordinator.complete(observedCost);
    },
    async fail(): Promise<void> {
      await coordinator.fail();
    },
    async abort(): Promise<void> {
      if (coordinator.settled) return;
      metrics.increment('stream_abort_release_total');
      await coordinator.cancel();
      // Interruption persistence is performed by the shared coordinator and
      // cannot run after a completed or failed stream.
    },
    get settled(): boolean {
      return coordinator.settled;
    },
    get state() {
      return coordinator.state;
    },
  };
}
