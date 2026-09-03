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

// Phase 8 — durable Full-mode property tests (work item 9):
// queue-to-Mastra dispatch, queue FSM transitions, retry semantics by
// failure category, plan identity, and exactly-once budget accounting
// across enqueue and worker execution.

import type { getPGliteDb } from '@kestrel/db/pglite';
import { describe, expect, it } from 'vitest';

import { resumeTurnBudget } from '../src/budget-reservation';
import { createExecutionLifecycle } from '../src/execution-lifecycle';
import { createGenerationLedger, restoreGenerationLedger } from '../src/generation-ledger';
import {
  claimNextFullAnalysisRun,
  completeFullAnalysisRun,
  enqueueFullAnalysis,
  failFullAnalysisRun,
  FULL_ANALYSIS_ESTIMATE_USD,
  FullAnalysisLeaseLostError,
  recoverStaleFullAnalysisRuns,
  requeueFullAnalysisRun,
  validateFullAnalysisPlanIdentity,
  type FullAnalysisEnqueueInput,
  type FullAnalysisPayload,
} from '../src/mastra-v2/workflows/full-analysis';
import {
  classifyFullAnalysisFailure,
  FullAnalysisBudgetAdmissionError,
  FullAnalysisQuotaExceededError,
  fullAnalysisRetryAction,
} from '../src/mastra-v2/workflows/full-analysis-retry';
import type { ExecutionPlan } from '../src/mastra/execution-plan';
import { withQueueStorage } from './helpers/full-analysis-queue-db';

type QueueDb = Awaited<ReturnType<typeof getPGliteDb>>;

const SNAPSHOT = {
  modelId: 'google/gemini-2.5-flash',
  providerId: 'google',
  bareModelId: 'gemini-2.5-flash',
} as const;

const BASE_INPUT: FullAnalysisEnqueueInput = {
  userId: 'user-1',
  threadId: 'thread-1',
  userMessageText: 'Analyze XAUUSD deeply',
  userMessageParts: [{ type: 'text' as const, text: 'Analyze XAUUSD deeply' }],
  idempotencyKey: 'full:thread-1:message-1',
  maxDailyUsd: 5,
  modelSnapshot: { ...SNAPSHOT },
};

function fullPlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    version: 1,
    route: 'full-analysis',
    capabilityId: 'symbol-research',
    capabilityVersion: 'mode-2',
    symbol: 'XAUUSD',
    mode: 'full',
    model: { providerId: 'google', bareModelId: 'gemini-2.5-flash' },
    toolPolicy: {
      capabilityId: 'symbol-research',
      tools: [],
      readOnly: true,
      requiresConfirmation: false,
    },
    evidencePolicy: { required: true, externalData: true, contentTrust: 'untrusted' },
    memoryPolicy: { mode: 'native', required: true, scope: 'user-thread', semanticRecall: true },
    maxSteps: 5,
    maxDurationMs: 55_000,
    streaming: false,
    mutationRequested: false,
    tenantId: 'user-1',
    xauusdChatKind: null,
    reportFollowup: false,
    symbolCandidate: true,
    xauusdCandidate: false,
    ...overrides,
  };
}

async function reservationRows(db: QueueDb) {
  return db.execute(
    `SELECT id, status, reserved_usd_cents, actual_usd_cents FROM ai_budget_reservations`,
  );
}

async function dailySpendRow(db: QueueDb) {
  return db.execute(`SELECT total_usd_cents FROM daily_ai_spend WHERE user_id = 'user-1'`);
}

describe('Phase 8 queue-to-Mastra dispatch properties', { timeout: 30_000 }, () => {
  it('claims only plan-consistent runs and rejects incompatible payloads terminally', async () => {
    await withQueueStorage(async (db) => {
      // 1. plan route mismatch → rejected at claim, terminal failure.
      const routeRun = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:route-mismatch:1',
        executionPlan: fullPlan({ route: 'canonical-chat' }),
      });
      await expect(claimNextFullAnalysisRun('worker-1')).resolves.toBeNull();

      // 2. missing model snapshot → rejected at claim, terminal failure.
      const snapshotRun = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:no-snapshot:1',
      });
      await db.execute(
        `UPDATE full_analysis_queue SET payload = payload - 'modelSnapshot' WHERE run_id = '${snapshotRun}'`,
      );
      await expect(claimNextFullAnalysisRun('worker-1')).resolves.toBeNull();

      // 3. payload identity mismatch → rejected at claim, terminal failure.
      const identityRun = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:identity-mismatch:1',
      });
      await db.execute(
        `UPDATE full_analysis_queue SET payload = jsonb_set(payload, '{userId}', '"other-user"') WHERE run_id = '${identityRun}'`,
      );
      await expect(claimNextFullAnalysisRun('worker-1')).resolves.toBeNull();

      const rows = await db.execute(
        `SELECT run_id, status, error FROM full_analysis_queue ORDER BY created_at`,
      );
      const byRun = Object.fromEntries(
        (rows.rows as Array<{ run_id: string; status: string; error: string | null }>).map(
          (row) => [row.run_id, row],
        ),
      );
      expect(byRun[routeRun!]).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('incompatible execution plan route'),
      });
      expect(byRun[snapshotRun!]).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('no model snapshot'),
      });
      expect(byRun[identityRun!]).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('does not match the queue row owner'),
      });

      // Rejected rows stay terminal: another poll never claims them.
      await expect(claimNextFullAnalysisRun('worker-1')).resolves.toBeNull();

      // 4. a plan-consistent run is still claimable after rejections.
      const validRun = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:valid:1',
        executionPlan: fullPlan(),
      });
      const claimed = await claimNextFullAnalysisRun('worker-1');
      expect(claimed?.runId).toBe(validRun);
      expect(claimed?.payload.executionPlan?.route).toBe('full-analysis');
    });
  });

  it('yields one worker owner per claim', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:mastra:1',
      });
      const [first, second] = await Promise.all([
        claimNextFullAnalysisRun('worker-a'),
        claimNextFullAnalysisRun('worker-b'),
      ]);
      expect([first?.runId, second?.runId].filter(Boolean)).toEqual([runId]);
      expect(
        [first?.payload.workerRunId, second?.payload.workerRunId].filter(Boolean),
      ).toHaveLength(1);
    });
  });
});

describe('Phase 8 queue FSM transition invariants', { timeout: 30_000 }, () => {
  it('advances pending → running → succeeded with attempts+1 per claim and no re-claim', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:fsm:1',
      });
      const first = await claimNextFullAnalysisRun('worker-1');
      expect(first?.payload.attemptCount).toBe(1);
      expect(first?.runId).toBe(runId);

      await expect(claimNextFullAnalysisRun('worker-2')).resolves.toBeNull();

      await completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'done', mode: 'full' });
      await expect(claimNextFullAnalysisRun('worker-2')).resolves.toBeNull();
    });
  });

  it('rejects every transition on terminal rows (ownership guard)', async () => {
    await withQueueStorage(async (db) => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:terminal:1',
      });
      await claimNextFullAnalysisRun('worker-1');
      await failFullAnalysisRun(runId!, 'worker-1', new Error('permanent'));

      for (const op of [
        () => completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'x' }),
        () => failFullAnalysisRun(runId!, 'worker-1', new Error('again')),
        () => requeueFullAnalysisRun(runId!, 'worker-1', 'retry'),
      ]) {
        await expect(op()).rejects.toMatchObject({ code: 'FULL_ANALYSIS_LEASE_LOST' });
      }
      await expect(claimNextFullAnalysisRun('worker-2')).resolves.toBeNull();

      const rows = await db.execute(
        `SELECT status FROM full_analysis_queue WHERE run_id = '${runId}'`,
      );
      expect(rows.rows[0]).toMatchObject({ status: 'failed' });
    });
  });

  it('recovers stale running rows at most once per run and fails at the attempt cap', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:recover:1',
      });
      const firstClaim = await claimNextFullAnalysisRun('worker-1');
      expect(firstClaim?.runId).toBe(runId);
      const staleCutoff = new Date(Date.now() + 60_000);

      // First recovery requeues exactly once.
      await expect(recoverStaleFullAnalysisRuns(staleCutoff, 3)).resolves.toEqual({
        requeued: 1,
        failed: 0,
      });
      // Second recovery finds nothing new (idempotent).
      await expect(recoverStaleFullAnalysisRuns(staleCutoff, 3)).resolves.toEqual({
        requeued: 0,
        failed: 0,
      });
      // Reclaim and let the lease expire again at the attempt cap → terminal.
      await claimNextFullAnalysisRun('worker-2');
      await expect(recoverStaleFullAnalysisRuns(staleCutoff, 2)).resolves.toEqual({
        requeued: 0,
        failed: 1,
      });
    });
  });
});

describe('Phase 8 retry semantics by failure category', () => {
  const leaseError = new FullAnalysisLeaseLostError();
  const quotaError = new FullAnalysisQuotaExceededError(5, 5);
  const admissionError = new FullAnalysisBudgetAdmissionError(new Error('db down'));
  const transientError = new Error('upstream timeout after 5s');
  const permanentError = new Error('invalid structured output');
  const emptyError = new Error('boom');

  it('classifies every failure category deterministically', () => {
    expect(classifyFullAnalysisFailure(leaseError)).toBe('lease');
    expect(classifyFullAnalysisFailure(quotaError)).toBe('quota');
    expect(classifyFullAnalysisFailure(admissionError)).toBe('transient');
    expect(classifyFullAnalysisFailure(transientError)).toBe('transient');
    expect(classifyFullAnalysisFailure(permanentError)).toBe('permanent');
    expect(classifyFullAnalysisFailure(emptyError)).toBe('permanent');
  });

  it.each([
    ['transient under the attempt cap', transientError, 1, 'requeue'],
    ['transient at the attempt cap', transientError, 3, 'fail'],
    ['admission under the cap', admissionError, 1, 'requeue'],
    ['admission at the cap', admissionError, 3, 'fail'],
    ['quota', quotaError, 1, 'fail'],
    ['permanent', permanentError, 2, 'fail'],
    ['lease', leaseError, 1, 'discard'],
    ['lease at the cap', leaseError, 3, 'discard'],
  ] as const)('%s → %s', (_name, error, attemptCount, expected) => {
    const decision = fullAnalysisRetryAction(error, { attemptCount, maxAttempts: 3 });
    expect(decision.action).toBe(expected);
  });
});

describe('Phase 8 plan identity validation', () => {
  const claimed = {
    tenantId: 'tenant-1',
    payload: {
      userId: 'user-1',
      modelSnapshot: { ...SNAPSHOT },
    } as unknown as FullAnalysisPayload,
  };

  it('accepts a plan bound to the claimed user/tenant/model/symbol', () => {
    expect(() => validateFullAnalysisPlanIdentity(fullPlan(), claimed, 'XAUUSD')).not.toThrow();
    // The web boundary carries the user id as tenant context.
    expect(() =>
      validateFullAnalysisPlanIdentity(fullPlan({ tenantId: 'tenant-1' }), claimed, 'XAUUSD'),
    ).not.toThrow();
    expect(() =>
      validateFullAnalysisPlanIdentity(fullPlan({ symbol: null }), claimed, 'XAUUSD'),
    ).not.toThrow();
    expect(() =>
      validateFullAnalysisPlanIdentity(fullPlan({ model: null }), claimed, 'XAUUSD'),
    ).not.toThrow();
  });

  it('rejects route, tenant, symbol, and model mismatches as permanent', () => {
    const mismatches: Array<[string, ExecutionPlan]> = [
      ['route', fullPlan({ route: 'symbol-research' })],
      ['tenant', fullPlan({ tenantId: 'other-tenant' })],
      ['symbol', fullPlan({ symbol: 'EURUSD' })],
      ['model provider', fullPlan({ model: { providerId: 'anthropic', bareModelId: 'claude-x' } })],
      [
        'model bare id',
        fullPlan({ model: { providerId: 'google', bareModelId: 'gemini-3.6-flash' } }),
      ],
    ];
    for (const [name, plan] of mismatches) {
      let thrown: unknown = null;
      try {
        validateFullAnalysisPlanIdentity(plan, claimed, 'XAUUSD');
      } catch (error) {
        thrown = error;
      }
      expect(thrown, name).toBeInstanceOf(Error);
      expect(
        fullAnalysisRetryAction(thrown, { attemptCount: 1, maxAttempts: 3 }).action,
        `${name} must be permanent (no requeue)`,
      ).toBe('fail');
    }
  });
});

describe('Phase 8 budget exactly-once properties', { timeout: 30_000 }, () => {
  it('creates exactly one reservation per run, also under duplicate enqueue', async () => {
    await withQueueStorage(async (db) => {
      await enqueueFullAnalysis({ ...BASE_INPUT, idempotencyKey: 'full:budget:1' });
      await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:budget:1',
        userMessageText: 'Analyze XAUUSD even deeper',
      });

      const rows = await reservationRows(db);
      expect((rows.rows as unknown[]).length).toBe(1);
      // Phase 9: reservation includes the observational-memory allowance
      // (5.0c visible turn + 0.8c observational) → 6 cents reserved.
      expect(rows.rows[0]).toMatchObject({ status: 'reserved', reserved_usd_cents: 6 });
      const spend = await dailySpendRow(db);
      expect(spend.rows[0]).toMatchObject({ total_usd_cents: 6 });
    });
  });

  it('reconciles the enqueue-time reservation exactly once on success', async () => {
    await withQueueStorage(async (db) => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:budget:2',
      });
      const claimed = await claimNextFullAnalysisRun('worker-1');
      expect(claimed?.runId).toBe(runId);
      expect(claimed?.payload.budgetReservationId).toBeTruthy();

      const budget = resumeTurnBudget({
        userId: 'user-1',
        reservationId: claimed!.payload.budgetReservationId!,
        estimateUsd: FULL_ANALYSIS_ESTIMATE_USD,
        maxDailyUsd: 5,
      });
      await budget.reconcile(0.04);

      const rows = await reservationRows(db);
      expect(rows.rows[0]).toMatchObject({
        status: 'reconciled',
        reserved_usd_cents: 6,
        actual_usd_cents: 4,
      });
      const spend = await dailySpendRow(db);
      expect(spend.rows[0]).toMatchObject({ total_usd_cents: 4 });

      // Terminal settlement is idempotent: a second reconcile is a no-op.
      await budget.reconcile(0.04);
      expect((await reservationRows(db)).rows[0]).toMatchObject({ status: 'reconciled' });
      expect((await dailySpendRow(db)).rows[0]).toMatchObject({ total_usd_cents: 4 });
    });
  });

  it('keeps the reservation reserved across a retryable requeue and books the retry actual once', async () => {
    await withQueueStorage(async (db) => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:budget:3',
      });
      const first = await claimNextFullAnalysisRun('worker-1');
      const reservationId = first!.payload.budgetReservationId!;
      const firstBudget = resumeTurnBudget({
        userId: 'user-1',
        reservationId,
        estimateUsd: FULL_ANALYSIS_ESTIMATE_USD,
        maxDailyUsd: 5,
      });

      // Attempt 1 fails with a transient error → requeue without settling.
      await requeueFullAnalysisRun(runId!, 'worker-1', 'attempt failed; retrying');

      const afterRequeue = await reservationRows(db);
      expect(afterRequeue.rows[0]).toMatchObject({ status: 'reserved' });
      expect(firstBudget.released).toBe(false);

      // Attempt 2 reuses the same reservation and books the actual exactly once.
      const second = await claimNextFullAnalysisRun('worker-2');
      expect(second?.payload.attemptCount).toBe(2);
      const secondBudget = resumeTurnBudget({
        userId: 'user-1',
        reservationId,
        estimateUsd: FULL_ANALYSIS_ESTIMATE_USD,
        maxDailyUsd: 5,
      });
      await secondBudget.reconcile(0.06);
      await completeFullAnalysisRun(runId!, 'worker-2', { finalText: 'retried ok' });

      const rows = await reservationRows(db);
      expect(rows.rows[0]).toMatchObject({
        status: 'reconciled',
        reserved_usd_cents: 6,
        actual_usd_cents: 6,
      });
      const spend = await dailySpendRow(db);
      expect(spend.rows[0]).toMatchObject({ total_usd_cents: 6 });
    });
  });

  it('releases the reservation exactly once on final failure', async () => {
    await withQueueStorage(async (db) => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:budget:4',
      });
      const claimed = await claimNextFullAnalysisRun('worker-1');
      const budget = resumeTurnBudget({
        userId: 'user-1',
        reservationId: claimed!.payload.budgetReservationId!,
        estimateUsd: FULL_ANALYSIS_ESTIMATE_USD,
        maxDailyUsd: 5,
      });
      const lifecycle = createExecutionLifecycle(budget);
      await failFullAnalysisRun(runId!, 'worker-1', new Error('permanent'));
      await lifecycle.fail();
      await lifecycle.fail();

      const rows = await reservationRows(db);
      expect(rows.rows[0]).toMatchObject({ status: 'released', actual_usd_cents: 0 });
      const spend = await dailySpendRow(db);
      expect(spend.rows[0]).toMatchObject({ total_usd_cents: 0 });
    });
  });

  it('round-trips the generation ledger snapshot across durable attempts', () => {
    const ledger = createGenerationLedger();
    ledger.recordCost('specialist:technical', 'specialist', 0.00135);
    ledger.recordCost('fusion', 'fusion', 0.00345);
    const restored = restoreGenerationLedger(ledger.snapshot());
    expect(restored.recordCost('specialist:technical', 'specialist', 0.00135)).toBe(false);
    expect(restored.total()).toBeCloseTo(0.00135 + 0.00345, 9);
  });

  it('persists the in-memory ledger into the queue payload on requeue', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis({
        ...BASE_INPUT,
        idempotencyKey: 'full:ledger:1',
      });
      await claimNextFullAnalysisRun('worker-1');

      // Attempt 1 completes two child generations before failing transiently.
      const ledger = createGenerationLedger();
      ledger.recordCost('specialist:technical', 'specialist', 0.00135);
      ledger.recordCost('fusion', 'fusion', 0.00345);
      await requeueFullAnalysisRun(runId!, 'worker-1', 'transient', ledger.snapshot());

      // Attempt 2 must restore exactly the completed children, never
      // double-billing them (Phase 8).
      const reclaimed = await claimNextFullAnalysisRun('worker-2');
      const restored = restoreGenerationLedger(reclaimed!.payload.ledgerSnapshot!);
      expect(restored.recordCost('specialist:technical', 'specialist', 0.00135)).toBe(false);
      expect(restored.total()).toBeCloseTo(0.00135 + 0.00345, 9);
    });
  });
});
