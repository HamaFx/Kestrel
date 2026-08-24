/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// SPDX-License-Identifier: Apache-2.0

/**
 * Durable Full-mode analysis queue.
 *
 * The database queue is the ownership authority: it provides atomic enqueue,
 * claims, leases, retries, and stale-worker protection. Mastra workflow
 * snapshots are a projection used for observability and execution tracing;
 * they are never used to decide whether a worker owns a job.
 */

import { createHash } from 'node:crypto';

import {
  claimNextFullAnalysisQueue,
  completeFullAnalysisQueue,
  enqueueFullAnalysisQueue,
  failFullAnalysisQueue,
  getFullAnalysisQueueRow,
  heartbeatFullAnalysisQueue,
  listFullAnalysisQueueRows,
  purgeOldFullAnalysisQueue,
  recoverStaleFullAnalysisQueue,
  requeueFullAnalysisQueue,
  type FullAnalysisQueueRow,
} from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { UserMessagePartsSchema } from '@kestrel/shared';
import type { WorkflowsStorage } from '@mastra/core/storage';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { z } from 'zod';

import { getDb } from '../../db';
import { normalizeWorkflowStatus, toApiWorkflowStatus, toMastraWorkflowStatus } from '../../workflow-status';
import { getKestrelMastra } from '../instance';

const flog = createCategorizedLogger('ai', { component: 'mastra-full-analysis' });

export const FULL_ANALYSIS_WORKFLOW_ID = 'full-analysis';
export const FULL_ANALYSIS_LEASE_MS = 90_000;

/** Payload carried by both the database queue and the Mastra projection. */
export const FullAnalysisPayloadSchema = z
  .object({
    kind: z.literal('full-analysis'),
    version: z.literal(1),
    userId: z.string().min(1),
    threadId: z.string().min(1),
    userMessageText: z.string(),
    userMessageParts: UserMessagePartsSchema,
    idempotencyKey: z.string().min(1),
    traceId: z.string().min(1).optional(),
    attemptCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    workerRunId: z.string().min(1).optional(),
    startedAt: z.string().datetime().optional(),
    /** Exact model resolved when the job was accepted; worker retries reuse it. */
    modelSnapshot: z
      .object({
        modelId: z.string().min(1),
        providerId: z.string().min(1),
        bareModelId: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export type FullAnalysisPayload = z.infer<typeof FullAnalysisPayloadSchema>;

/** Public shape returned by the polling endpoint. */
export interface FullAnalysisRunView {
  id: string;
  status: import('../../workflow-status').WorkflowStatus;
  progress: Array<Record<string, unknown>>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface FullAnalysisClaim {
  runId: string;
  payload: FullAnalysisPayload;
}

export interface FullAnalysisEnqueueInput {
  userId: string;
  threadId: string;
  userMessageText: string;
  userMessageParts: z.input<typeof UserMessagePartsSchema>;
  idempotencyKey: string;
  traceId?: string;
  /** Exact resolved model snapshot captured before the queue row is created. */
  modelSnapshot: {
    modelId: string;
    providerId: string;
    bareModelId: string;
  };
}

export interface FullAnalysisQueueHealth {
  pending: number;
  running: number;
  stalePending: number;
  stuckRunning: number;
  unavailable?: boolean;
}

export class FullAnalysisLeaseLostError extends Error {
  readonly code = 'FULL_ANALYSIS_LEASE_LOST';

  constructor(message = 'The Full-analysis worker lease is no longer owned.') {
    super(message);
    this.name = 'FullAnalysisLeaseLostError';
  }
}

/** Deterministic run id from the user and request idempotency key. */
export function fullAnalysisRunId(userId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex');
}

function parsePayload(value: unknown): FullAnalysisPayload {
  const parsed = FullAnalysisPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid Full-analysis payload: ${parsed.error.message}`);
  }
  return parsed.data;
}

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLeaseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: unknown }).code === 'FULL_ANALYSIS_QUEUE_OWNERSHIP_LOST' ||
      (error as { code?: unknown }).code === 'FULL_ANALYSIS_LEASE_LOST')
  );
}

async function workflowsStore(): Promise<WorkflowsStorage | undefined> {
  try {
    const instance = getKestrelMastra();
    if (!instance) return undefined;
    const storage = instance.instance.getStorage();
    if (!storage) return undefined;
    const store = await storage.getStore('workflows');
    return (store as WorkflowsStorage | undefined) ?? undefined;
  } catch {
    // Mastra storage is an observability projection; its absence
    // must never fail the queue operation.
    return undefined;
  }
}

interface ParsedSnapshot {
  runId?: string;
  status?: string;
  result?: unknown;
  error?: unknown;
  context?: { input?: unknown } & Record<string, unknown>;
  [key: string]: unknown;
}

function parseSnapshot(value: unknown): ParsedSnapshot | null {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as ParsedSnapshot;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' ? (value as ParsedSnapshot) : null;
}

function projectionContext(payload: FullAnalysisPayload): WorkflowRunState['context'] {
  return { input: payload } as unknown as WorkflowRunState['context'];
}

function isResearchWorkflowInput(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.prompt === 'string' &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.mode === 'string'
  );
}

function minimalSnapshot(
  runId: string,
  status: 'pending' | 'running' | 'success' | 'failed',
  payload: FullAnalysisPayload,
  result?: Record<string, unknown>,
  error?: string,
): WorkflowRunState {
  return {
    runId,
    status,
    value: {},
    context: projectionContext(payload),
    serializedStepGraph: [],
    activePaths: [],
    activeStepsPath: {},
    suspendedPaths: {},
    resumeLabels: {},
    waitingPaths: {},
    ...(result ? { result: result as never } : {}),
    ...(error ? { error: { name: 'FullAnalysisError', message: error } } : {}),
    timestamp: Date.now(),
  } as unknown as WorkflowRunState;
}

/**
 * Mirror a queue row into Mastra after the database transition. Projection
 * failures are logged but do not weaken the queue's ownership guarantee.
 */
async function projectQueueRow(row: FullAnalysisQueueRow): Promise<void> {
  const payload = parsePayload(row.payload);
  const store = await workflowsStore();
  if (!store) return;

  try {
    const existing = await store.getWorkflowRunById({
      runId: row.runId,
      workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    });
    const snapshot = parseSnapshot(existing?.snapshot);
    const hasDurableExecution = isResearchWorkflowInput(snapshot?.context?.input);
    const normalizedStatus = normalizeWorkflowStatus(
      row.status === 'pending' && hasDurableExecution ? 'running' : row.status,
    );
    const status = toMastraWorkflowStatus(normalizedStatus);
    const next = {
      ...(snapshot ?? minimalSnapshot(row.runId, status, payload)),
      runId: row.runId,
      status,
      context: snapshot?.context ?? projectionContext(payload),
      ...(row.result ? { result: row.result } : {}),
      ...(row.error ? { error: { name: 'FullAnalysisError', message: row.error } } : {}),
      timestamp: Date.now(),
    } as unknown as WorkflowRunState;
    await store.persistWorkflowSnapshot({
      workflowName: FULL_ANALYSIS_WORKFLOW_ID,
      runId: row.runId,
      resourceId: row.userId,
      snapshot: next,
    });
  } catch (error) {
    flog.warn('Full-analysis Mastra projection failed', {
      runId: row.runId,
      status: row.status,
      error: serializeError(error),
    });
  }
}

function payloadFromRow(row: FullAnalysisQueueRow): FullAnalysisPayload | null {
  try {
    return parsePayload(row.payload);
  } catch (error) {
    flog.error('Full-analysis queue payload is invalid', {
      runId: row.runId,
      error: serializeError(error),
    });
    return null;
  }
}

export async function enqueueFullAnalysis(input: FullAnalysisEnqueueInput): Promise<string | null> {
  try {
    const runId = fullAnalysisRunId(input.userId, input.idempotencyKey);
    const payload: FullAnalysisPayload = {
      kind: 'full-analysis',
      version: 1,
      userId: input.userId,
      threadId: input.threadId,
      userMessageText: input.userMessageText,
      userMessageParts: UserMessagePartsSchema.parse(input.userMessageParts),
      idempotencyKey: input.idempotencyKey,
      ...(input.traceId ? { traceId: input.traceId } : {}),
      modelSnapshot: input.modelSnapshot,
      attemptCount: 0,
      createdAt: new Date().toISOString(),
    };

    // The database queue is the operational authority. An accepted request
    // must always create (or find) a worker-visible DB row; Mastra is only a
    // best-effort observability projection performed after the durable write.
    const row = await enqueueFullAnalysisQueue({
      runId,
      userId: input.userId,
      threadId: input.threadId,
      idempotencyKey: input.idempotencyKey,
      payload,
      db: getDb(),
    });
    await projectQueueRow(row);

    flog.info('Enqueued full-analysis run', {
      runId,
      userId: input.userId,
      threadId: input.threadId,
      queueAuthority: 'database',
    });
    return runId;
  } catch (error) {
    flog.error('Failed to enqueue full-analysis run', {
      userId: input.userId,
      threadId: input.threadId,
      error: serializeError(error),
    });
    return null;
  }
}

export async function claimNextFullAnalysisRun(
  workerRunId: string,
  ownsTenant?: (userId: string) => boolean,
): Promise<FullAnalysisClaim | null> {
  const db = getDb();
  for (;;) {
    const row = await claimNextFullAnalysisQueue({
      workerRunId,
      leaseMs: FULL_ANALYSIS_LEASE_MS,
      ...(ownsTenant ? { ownsTenant } : {}),
      db,
    });
    if (!row) return null;
    const payload = payloadFromRow(row);
    if (!payload) {
      try {
        await failFullAnalysisQueue({
          runId: row.runId,
          workerRunId,
          error: 'Invalid Full-analysis payload; job rejected.',
          db,
        });
      } catch (error) {
        if (!isLeaseError(error)) throw error;
      }
      continue;
    }
    if (!payload.modelSnapshot) {
      try {
        await failFullAnalysisQueue({
          runId: row.runId,
          workerRunId,
          error: 'Full-analysis payload has no model snapshot; legacy job rejected safely.',
          db,
        });
      } catch (error) {
        if (!isLeaseError(error)) throw error;
      }
      continue;
    }
    if (payload.userId !== row.userId || payload.threadId !== row.threadId) {
      try {
        await failFullAnalysisQueue({
          runId: row.runId,
          workerRunId,
          error: 'Full-analysis payload identity does not match the queue row owner; job rejected.',
          db,
        });
      } catch (error) {
        if (!isLeaseError(error)) throw error;
      }
      continue;
    }
    const claimedPayload = {
      ...payload,
      attemptCount: row.attemptCount,
      workerRunId,
      startedAt: new Date().toISOString(),
    };
    await projectQueueRow({ ...row, payload: claimedPayload });
    return { runId: row.runId, payload: claimedPayload };
  }
}

export async function touchFullAnalysisRun(runId: string, workerRunId: string): Promise<void> {
  try {
    const row = await heartbeatFullAnalysisQueue({
      runId,
      workerRunId,
      leaseMs: FULL_ANALYSIS_LEASE_MS,
      db: getDb(),
    });
    await projectQueueRow(row);
  } catch (error) {
    if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
    throw error;
  }
}

export async function completeFullAnalysisRun(
  runId: string,
  workerRunId: string,
  result: Record<string, unknown>,
): Promise<void> {
  try {
    const row = await completeFullAnalysisQueue({ runId, workerRunId, result, db: getDb() });
    await projectQueueRow(row);
    flog.info('Completed full-analysis run', { runId });
  } catch (error) {
    if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
    throw error;
  }
}

export async function requeueFullAnalysisRun(
  runId: string,
  workerRunId: string,
  message: string,
): Promise<void> {
  try {
    const row = await requeueFullAnalysisQueue({
      runId,
      workerRunId,
      error: message,
      db: getDb(),
    });
    await projectQueueRow(row);
    flog.warn('Requeued full-analysis run', { runId, message });
  } catch (error) {
    if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
    throw error;
  }
}

export async function failFullAnalysisRun(
  runId: string,
  workerRunId: string,
  error: unknown,
): Promise<void> {
  try {
    const row = await failFullAnalysisQueue({
      runId,
      workerRunId,
      error: serializeError(error),
      db: getDb(),
    });
    await projectQueueRow(row);
    flog.error('Failed full-analysis run', { runId, error: serializeError(error) });
  } catch (transitionError) {
    if (isLeaseError(transitionError)) throw new FullAnalysisLeaseLostError();
    throw transitionError;
  }
}

export async function recoverStaleFullAnalysisRuns(
  staleCutoff: Date,
  maxAttempts: number,
): Promise<{ requeued: number; failed: number }> {
  const db = getDb();
  const result = await recoverStaleFullAnalysisQueue(staleCutoff, maxAttempts, db);
  for (const runId of result.runIds) {
    const row = await getFullAnalysisQueueRow(runId, undefined, db);
    if (row) await projectQueueRow(row);
  }
  if (result.requeued > 0 || result.failed > 0) {
    flog.warn('Recovered stale full-analysis runs', {
      requeued: result.requeued,
      failed: result.failed,
      maxAttempts,
    });
  }
  return { requeued: result.requeued, failed: result.failed };
}

export async function purgeOldFullAnalysisRuns(retentionCutoff: Date): Promise<number> {
  const db = getDb();
  const terminalRows = (await listFullAnalysisQueueRows(undefined, db)).filter(
    (row) =>
      (['succeeded', 'failed', 'cancelled', 'blocked'] as const).includes(
        normalizeWorkflowStatus(row.status) as 'succeeded' | 'failed' | 'cancelled' | 'blocked',
      ) &&
      row.updatedAt < retentionCutoff,
  );
  const deleted = await purgeOldFullAnalysisQueue(retentionCutoff, db);
  const store = await workflowsStore();
  if (store && terminalRows.length > 0) {
    try {
      for (const row of terminalRows) {
        await store.deleteWorkflowRunById({
          runId: row.runId,
          workflowName: FULL_ANALYSIS_WORKFLOW_ID,
        });
      }
    } catch (error) {
      flog.warn('Full-analysis Mastra retention projection failed', {
        error: serializeError(error),
      });
    }
  }
  return deleted;
}

export async function getFullAnalysisQueueHealth(): Promise<FullAnalysisQueueHealth> {
  try {
    const rows = await listFullAnalysisQueueRows(undefined, getDb());
    const now = Date.now();
    const pending = rows.filter((row) => row.status === 'pending');
    const running = rows.filter((row) => row.status === 'running');
    return {
      pending: pending.length,
      running: running.length,
      stalePending: pending.filter((row) => now - row.createdAt.getTime() > 10 * 60_000).length,
      stuckRunning: running.filter(
        (row) =>
          (row.leaseExpiresAt?.getTime() ?? 0) <= now || now - row.updatedAt.getTime() > 30_000,
      ).length,
    };
  } catch (error) {
    flog.warn('Full-analysis queue health unavailable', { error: serializeError(error) });
    return { pending: 0, running: 0, stalePending: 0, stuckRunning: 0, unavailable: true };
  }
}

export async function getFullAnalysisRun(
  userId: string,
  runId: string,
): Promise<FullAnalysisRunView | null> {
  try {
    const row = await getFullAnalysisQueueRow(runId, userId, getDb());
    if (!row) return null;

    // Polling is DB-authoritative. Mastra snapshots are projection data and
    // must not make an accepted DB job appear complete without a worker-owned
    // terminal transition in the queue.
    const status = normalizeWorkflowStatus(row.status);
    const result: Record<string, unknown> | null = row.result ?? null;
    const error: string | null =
      status === 'failed'
        ? row.error?.startsWith('Daily AI budget exceeded (')
          ? row.error
          : 'Full analysis could not be completed. No partial answer was returned.'
        : null;
    const completedAt: string | null = row.completedAt?.toISOString() ?? null;

    return {
      id: row.runId,
      status,
      progress: [],
      result,
      error,
      createdAt: row.createdAt.toISOString(),
      completedAt,
    };
  } catch (error) {
    flog.warn('Full-analysis run lookup failed', { runId, error: serializeError(error) });
    return null;
  }
}
