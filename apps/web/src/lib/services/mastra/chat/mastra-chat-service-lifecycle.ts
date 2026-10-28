import 'server-only';

import {
  appendAssistantMessage,
  appendUserMessage,
  createExecutionLifecycle,
  type BudgetHandle,
} from '@kestrel/ai';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { UIMessage } from 'ai';

const llog = createCategorizedLogger('api', { component: 'mastra-chat-lifecycle' });

export interface BufferedExecutionResult<T> {
  result: T;
  observedCost: number;
  messageId: string;
}

export interface StreamLifecycleCoordinator {
  complete(observedCost: number): Promise<void>;
  fail(): Promise<void>;
  cancel(): Promise<void>;
  get settled(): boolean;
  readonly state: ReturnType<typeof createExecutionLifecycle>['state'];
}

/** Shared terminal coordinator used by buffered and streaming adapters. */
export function createStreamLifecycleCoordinator(
  budget: BudgetHandle,
  onInterrupted: () => void | Promise<void>,
): StreamLifecycleCoordinator {
  const lifecycle = createExecutionLifecycle(budget);
  return {
    complete: (cost) => lifecycle.complete(cost),
    fail: () => lifecycle.fail(),
    cancel: async () => {
      await lifecycle.cancel();
      if (lifecycle.state === 'cancelled') await onInterrupted();
    },
    get settled() {
      return lifecycle.settled;
    },
    get state() {
      return lifecycle.state;
    },
  };
}

/** Shared persistence and terminal-settlement coordinator for buffered turns. */
export async function runBufferedExecution<T>(options: {
  budget: BudgetHandle;
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  userMessageIdempotencyKey?: string;
  assistantMessageIdempotencyKey: string;
  execute: () => Promise<{ result: T; observedCost: number; assistantMessage?: UIMessage }>;
  buildAssistantMessage: (execution: {
    result: T;
    observedCost: number;
    assistantMessage?: UIMessage;
  }) => UIMessage;
  /**
   * Phase 3 — post-persist side effects (e.g. `agent_opinions` bookkeeping)
   * that need the persisted assistant message id. Must be non-throwing; the
   * turn is already durable when this runs.
   */
  afterPersist?: (execution: { messageId: string; result: T }) => void | Promise<void>;
  isCancelled?: () => boolean;
}): Promise<BufferedExecutionResult<T>> {
  const lifecycle = createExecutionLifecycle(options.budget);
  let completed: { result: T; observedCost: number } | null = null;

  try {
    if (options.userMessageIdempotencyKey) {
      await appendUserMessage(options.userId, options.threadId, options.userMessage, {
        idempotencyKey: options.userMessageIdempotencyKey,
      });
    } else {
      await appendUserMessage(options.userId, options.threadId, options.userMessage);
    }
    completed = await options.execute();
    const persisted = await appendAssistantMessage(
      options.userId,
      options.threadId,
      options.buildAssistantMessage(completed),
      { idempotencyKey: options.assistantMessageIdempotencyKey },
    );
    if (options.afterPersist) {
      try {
        await options.afterPersist({ messageId: persisted.messageId, result: completed.result });
      } catch (error) {
        // Post-persist bookkeeping (opinion rows, outbox replays) must never
        // fail a turn whose assistant message is already durable.
        llog.warn('Post-persist side effect failed (non-fatal)', {
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await lifecycle.complete(completed.observedCost);
    return { ...completed, messageId: persisted.messageId };
  } catch (error) {
    if (completed) await lifecycle.complete(completed.observedCost);
    else if (options.isCancelled?.()) await lifecycle.cancel();
    else await lifecycle.fail();
    throw error;
  }
}
