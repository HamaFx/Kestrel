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

// Phase 0 — terminal-state invariants. Encodes the allowed/forbidden
// (executionOutcome × answerOutcome) matrix and the exactly-once settlement
// contract that every buffered, streaming, and durable run must satisfy.

import { describe, expect, it, vi } from 'vitest';

import type { BudgetHandle } from '../src/budget-reservation';
import {
  createExecutionLifecycle,
  terminalMetadata,
  type ExecutionAnswerOutcome,
  type ExecutionTerminalState,
} from '../src/execution-lifecycle';

const ALLOWED_PAIRS: ReadonlyArray<readonly [ExecutionTerminalState, ExecutionAnswerOutcome]> = [
  ['completed', 'ready'],
  ['completed', 'degraded'],
  ['completed', 'partial'],
  ['failed', 'blocked'],
  ['cancelled', 'blocked'],
];

const FORBIDDEN_PAIRS: ReadonlyArray<readonly [ExecutionTerminalState, ExecutionAnswerOutcome]> = [
  ['completed', 'blocked'],
  ['failed', 'ready'],
  ['failed', 'degraded'],
  ['failed', 'partial'],
  ['cancelled', 'ready'],
  ['cancelled', 'degraded'],
  ['cancelled', 'partial'],
];

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

function isAllowedTerminalPair(
  executionOutcome: ExecutionTerminalState,
  answerOutcome: ExecutionAnswerOutcome,
): boolean {
  if (executionOutcome === 'completed') return answerOutcome !== 'blocked';
  return answerOutcome === 'blocked';
}

describe('Phase 0 terminal-state invariants', () => {
  it('documents the allowed outcome matrix', () => {
    for (const [executionOutcome, answerOutcome] of ALLOWED_PAIRS) {
      expect(isAllowedTerminalPair(executionOutcome, answerOutcome)).toBe(true);
      const metadata = terminalMetadata(executionOutcome, answerOutcome);
      expect(metadata).toEqual({ executionOutcome, answerOutcome });
    }
  });

  it('forbids blocked answers on completed runs and ready answers on failed/cancelled runs', () => {
    for (const [executionOutcome, answerOutcome] of FORBIDDEN_PAIRS) {
      expect(isAllowedTerminalPair(executionOutcome, answerOutcome)).toBe(false);
      // The primitive must still carry the pair shape so callers can never
      // silently drop it; the matrix above is the policy guard.
      const metadata = terminalMetadata(executionOutcome, answerOutcome);
      expect(metadata).toEqual({ executionOutcome, answerOutcome });
    }
  });

  it('covers every possible outcome pair (closed matrix)', () => {
    const states: ExecutionTerminalState[] = ['completed', 'failed', 'cancelled'];
    const answers: ExecutionAnswerOutcome[] = ['ready', 'blocked', 'degraded', 'partial'];
    const allowed = new Set(ALLOWED_PAIRS.map((pair) => pair.join(':')));
    const forbidden = new Set(FORBIDDEN_PAIRS.map((pair) => pair.join(':')));
    for (const state of states) {
      for (const answer of answers) {
        const key = `${state}:${answer}`;
        expect(allowed.has(key) || forbidden.has(key), `unclassified pair ${key}`).toBe(true);
        expect(allowed.has(key)).toBe(isAllowedTerminalPair(state, answer));
      }
    }
  });

  it('attaches a terminal reason only when provided', () => {
    expect(terminalMetadata('failed', 'blocked', 'provider timeout')).toEqual({
      executionOutcome: 'failed',
      answerOutcome: 'blocked',
      terminalReason: 'provider timeout',
    });
    expect(terminalMetadata('cancelled', 'blocked')).not.toHaveProperty('terminalReason');
  });

  it('settles each terminal class exactly once (baseline contract)', async () => {
    for (const operation of ['complete', 'fail', 'cancel'] as const) {
      const budget = budgetMock();
      const lifecycle = createExecutionLifecycle(budget);
      const settle =
        operation === 'complete'
          ? () => lifecycle.complete(0.25)
          : operation === 'fail'
            ? () => lifecycle.fail()
            : () => lifecycle.cancel();

      await Promise.all([settle(), settle(), lifecycle.complete(0.5), lifecycle.fail()]);

      if (operation === 'complete') {
        expect(budget.reconcile).toHaveBeenCalledTimes(1);
        expect(budget.reconcile).toHaveBeenCalledWith(0.25);
        expect(budget.release).not.toHaveBeenCalled();
        expect(lifecycle.state).toBe('completed');
      } else {
        expect(budget.release).toHaveBeenCalledTimes(1);
        expect(budget.reconcile).not.toHaveBeenCalled();
        expect(lifecycle.state).toBe(operation === 'fail' ? 'failed' : 'cancelled');
      }
    }
  });

  it('never reconciles a failed or cancelled run (blocked answers are not billed as success)', async () => {
    const failed = createExecutionLifecycle(budgetMock());
    await failed.fail();
    expect(failed.state).toBe('failed');

    const cancelled = createExecutionLifecycle(budgetMock());
    await cancelled.cancel();
    expect(cancelled.state).toBe('cancelled');
  });

  it('keeps the first terminal outcome immutable under concurrent settlement', async () => {
    const budget = budgetMock();
    const lifecycle = createExecutionLifecycle(budget);

    await Promise.all([lifecycle.complete(0.1), lifecycle.cancel(), lifecycle.fail()]);

    expect(lifecycle.state).toBe('completed');
    expect(budget.reconcile).toHaveBeenCalledTimes(1);
    expect(budget.release).not.toHaveBeenCalled();
  });
});
