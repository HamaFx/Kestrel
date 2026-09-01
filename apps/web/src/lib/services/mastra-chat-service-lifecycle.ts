import 'server-only';

import {
  appendAssistantMessage,
  appendUserMessage,
  createExecutionLifecycle,
  type BudgetHandle,
} from '@kestrel/ai';
import type { UIMessage } from 'ai';

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
export function createStreamLifecycleCoordinator(budget: BudgetHandle, onInterrupted: () => void | Promise<void>): StreamLifecycleCoordinator {
  const lifecycle = createExecutionLifecycle(budget);
  return {
    complete: (cost) => lifecycle.complete(cost),
    fail: () => lifecycle.fail(),
    cancel: async () => {
      await lifecycle.cancel();
      if (lifecycle.state === 'cancelled') await onInterrupted();
    },
    get settled() { return lifecycle.settled; },
    get state() { return lifecycle.state; },
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
  buildAssistantMessage: (execution: { result: T; observedCost: number; assistantMessage?: UIMessage }) => UIMessage;
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
    await lifecycle.complete(completed.observedCost);
    return { ...completed, messageId: persisted.messageId };
  } catch (error) {
    if (completed) await lifecycle.complete(completed.observedCost);
    else if (options.isCancelled?.()) await lifecycle.cancel();
    else await lifecycle.fail();
    throw error;
  }
}
