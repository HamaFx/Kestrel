import { createExecutionLifecycle, type BudgetHandle } from '@kestrel/ai';

import { terminalActionForFullAnalysis } from './full-analysis-lifecycle.js';

export interface FullAnalysisQueueTransitions {
  complete(result: Record<string, unknown>): Promise<void>;
  fail(error: unknown): Promise<void>;
  requeue(message: string): Promise<void>;
}

export interface FullAnalysisCoordinatorInput {
  budget: BudgetHandle;
  transitions: FullAnalysisQueueTransitions;
  isLeaseLost: () => boolean;
  isCancelled: () => boolean;
}

/**
 * Owns budget settlement and queue terminal transitions for one durable run.
 * Queue ownership is checked before every terminal action; lease loss never
 * settles the current attempt or projects stale output.
 */
export function createFullAnalysisCoordinator(input: FullAnalysisCoordinatorInput) {
  const lifecycle = createExecutionLifecycle(input.budget);
  let hasResult = false;
  let observedCost = 0;
  let completionPromise: Promise<void> | null = null;
  let failurePromise: Promise<void> | null = null;
  let requeuePromise: Promise<void> | null = null;

  return {
    markResult(costUsd: number): void {
      hasResult = true;
      observedCost = costUsd;
    },
    async complete(result: Record<string, unknown>): Promise<void> {
      if (completionPromise) return completionPromise;
      if (input.isLeaseLost()) return;
      completionPromise = (async () => {
        await input.transitions.complete(result);
        await lifecycle.complete(observedCost);
      })();
      return completionPromise;
    },
    async fail(error: unknown): Promise<void> {
      if (failurePromise) return failurePromise;
      if (input.isLeaseLost()) return;
      failurePromise = (async () => {
        await lifecycle.fail();
        await input.transitions.fail(error);
      })();
      return failurePromise;
    },
    async requeue(message: string): Promise<void> {
      if (requeuePromise) return requeuePromise;
      if (input.isLeaseLost()) return;
      requeuePromise = (async () => {
        await lifecycle.fail();
        await input.transitions.requeue(message);
      })();
      return requeuePromise;
    },
    async settleOnError(error: unknown): Promise<void> {
      const action = terminalActionForFullAnalysis({
        hasResult,
        leaseLost: input.isLeaseLost(),
        cancelled: input.isCancelled(),
      });
      if (action === 'complete') await lifecycle.complete(observedCost);
      else if (action === 'cancel') await lifecycle.cancel();
      else if (action === 'fail') await lifecycle.fail();
      // Queue transition remains owned by the outer worker classification.
      void error;
    },
    get settled(): boolean {
      return lifecycle.settled;
    },
  };
}
