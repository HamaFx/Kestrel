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

// Full-analysis queue schemas, boundary types, and identity validation.

import { createHash } from 'node:crypto';

import '@kestrel/db';

import { UserMessagePartsSchema } from '@kestrel/shared';
import { z } from 'zod';

import type { GenerationLedgerSnapshot } from '../../persistence/generation-ledger';
import type { WorkflowStatus } from '../../runtime/workflow-status';
import { observationalMemoryAllowanceUsd } from '../memory';
import { ExecutionPlanSchema, type ExecutionPlan } from '../planning/execution-plan';
import { FULL_ANALYSIS_LEASE_MS } from '../shared/constants';

export type { MastraAnalysisMode } from '../../committee/types';

export { FULL_ANALYSIS_LEASE_MS };

export const FULL_ANALYSIS_WORKFLOW_ID = 'full-analysis';
export const FULL_ANALYSIS_TURN_ESTIMATE_USD = 0.05;
export const FULL_ANALYSIS_ESTIMATE_USD =
  FULL_ANALYSIS_TURN_ESTIMATE_USD + observationalMemoryAllowanceUsd(1);

export const FullAnalysisPayloadSchema = z.strictObject({
  kind: z.literal('full-analysis'),
  version: z.literal(1),
  userId: z.string().min(1),
  threadId: z.string().min(1),
  userMessageText: z.string(),
  userMessageParts: UserMessagePartsSchema,
  idempotencyKey: z.string().min(1),
  traceId: z.string().min(1).optional(),
  attemptCount: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  workerRunId: z.string().min(1).optional(),
  startedAt: z.iso.datetime().optional(),
  budgetReservationId: z.uuid().optional(),
  providerMode: z.enum(['byok', 'managed']).optional(),
  executionPlan: ExecutionPlanSchema.optional(),
  ledgerSnapshot: z
    .object({
      entries: z.array(
        z.object({
          id: z.string().min(1),
          kind: z.enum([
            'primary',
            'auxiliary',
            'specialist',
            'fusion',
            'title',
            'semantic-routing',
          ]),
          costUsd: z.number().nonnegative(),
        }),
      ),
      totalCostUsd: z.number().nonnegative(),
    })
    .optional(),
  modelSnapshot: z
    .strictObject({
      modelId: z.string().min(1),
      providerId: z.string().min(1),
      bareModelId: z.string().min(1),
    })
    .optional(),
});

export type FullAnalysisPayload = z.infer<typeof FullAnalysisPayloadSchema>;

export interface FullAnalysisRunView {
  id: string;
  status: WorkflowStatus;
  progress: Array<Record<string, unknown>>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface FullAnalysisClaim {
  runId: string;
  tenantId: string;
  payload: FullAnalysisPayload;
}

export interface FullAnalysisEnqueueInput {
  userId: string;
  threadId: string;
  userMessageText: string;
  userMessageParts: z.input<typeof UserMessagePartsSchema>;
  idempotencyKey: string;
  traceId?: string;
  maxDailyUsd: number;
  modelSnapshot: {
    modelId: string;
    providerId: string;
    bareModelId: string;
  };
  /** D1 split — BYOK turns reserve the platform fee only. */
  providerMode?: 'byok' | 'managed';
  executionPlan?: ExecutionPlan;
  ledgerSnapshot?: GenerationLedgerSnapshot;
}

export interface FullAnalysisQueueHealth {
  pending: number;
  running: number;
  stalePending: number;
  stuckRunning: number;
  unavailable?: boolean;
}

export class FullAnalysisHeartbeatError extends Error {
  readonly code = 'FULL_ANALYSIS_HEARTBEAT_FAILED';
  constructor(
    message = 'The Full-analysis lease heartbeat failed temporarily.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'FullAnalysisHeartbeatError';
  }
}

export class FullAnalysisLeaseLostError extends Error {
  readonly code = 'FULL_ANALYSIS_LEASE_LOST';
  constructor(message = 'The Full-analysis worker lease is no longer owned.') {
    super(message);
    this.name = 'FullAnalysisLeaseLostError';
  }
}

export class FullAnalysisCancelledError extends Error {
  readonly code = 'FULL_ANALYSIS_CANCELLED';
  constructor(message = 'The Full-analysis job was cancelled.') {
    super(message);
    this.name = 'FullAnalysisCancelledError';
  }
}

export function fullAnalysisRunId(userId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex');
}

/**
 * Phase 8 — validate that a serialized execution plan belongs to the claimed
 * run before executing it. Plan identity violations are permanent failures:
 * retrying cannot repair a corrupt or stale plan.
 */
export function validateFullAnalysisPlanIdentity(
  plan: ExecutionPlan,
  claimed: { tenantId: string; payload: FullAnalysisPayload },
  extractedSymbol: string | null,
): void {
  if (plan.route !== 'full-analysis') {
    throw new Error(`Execution plan route ${plan.route} is not the full-analysis route.`);
  }
  // The web boundary carries the user id as the tenant context while the
  // queue row resolves the persisted tenant; accept either match.
  if (
    plan.tenantId &&
    plan.tenantId !== claimed.payload.userId &&
    plan.tenantId !== claimed.tenantId
  ) {
    throw new Error(`Execution plan tenant ${plan.tenantId} does not match the claimed run.`);
  }
  if (plan.symbol && extractedSymbol && plan.symbol !== extractedSymbol) {
    throw new Error(
      `Execution plan symbol ${plan.symbol} does not match the extracted symbol ${extractedSymbol}.`,
    );
  }
  const snapshot = claimed.payload.modelSnapshot;
  if (
    plan.model &&
    snapshot &&
    (plan.model.providerId !== snapshot.providerId ||
      plan.model.bareModelId !== snapshot.bareModelId)
  ) {
    throw new Error(
      `Execution plan model ${plan.model.providerId}/${plan.model.bareModelId} does not match the enqueue-time model snapshot ${snapshot.providerId}/${snapshot.bareModelId}.`,
    );
  }
}
