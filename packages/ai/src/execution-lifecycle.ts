/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { BudgetHandle } from './budget-reservation';

export type ExecutionTerminalState = 'completed' | 'failed' | 'cancelled';
export type ExecutionAnswerOutcome = 'ready' | 'blocked' | 'degraded' | 'partial';

export interface ExecutionTerminalMetadata {
  executionOutcome: ExecutionTerminalState;
  answerOutcome: ExecutionAnswerOutcome;
  terminalReason?: string;
}

/**
 * Coordinates terminal budget settlement. The first terminal signal wins;
 * concurrent or later signals reuse the same promise and cannot mutate the
 * reservation a second time.
 */
export function createExecutionLifecycle(budget: BudgetHandle) {
  let state: ExecutionTerminalState | null = null;
  let terminalPromise: Promise<void> | null = null;

  function settle(
    nextState: ExecutionTerminalState,
    operation: () => Promise<void>,
  ): Promise<void> {
    if (state !== null || terminalPromise !== null) return terminalPromise ?? Promise.resolve();
    state = nextState;
    terminalPromise = Promise.resolve().then(operation);
    return terminalPromise;
  }

  return {
    complete(costUsd: number): Promise<void> {
      return settle('completed', () => budget.reconcile(costUsd));
    },
    fail(): Promise<void> {
      return settle('failed', () => budget.release());
    },
    cancel(): Promise<void> {
      return settle('cancelled', () => budget.release());
    },
    get state(): ExecutionTerminalState | null {
      return state;
    },
    get settled(): boolean {
      return state !== null;
    },
  };
}

/** Normalize terminal lifecycle metadata for all buffered and streaming callers. */
export function terminalMetadata(
  executionOutcome: ExecutionTerminalState,
  answerOutcome: ExecutionAnswerOutcome,
  terminalReason?: string,
): ExecutionTerminalMetadata {
  return {
    executionOutcome,
    answerOutcome,
    ...(terminalReason ? { terminalReason } : {}),
  };
}
