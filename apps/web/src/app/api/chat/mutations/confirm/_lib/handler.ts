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

// SPDX-License-Identifier: Apache-2.0

// POST /api/chat/mutations/confirm handler.
//
// The server derives mutation, user, and thread context from the persisted
// workflow snapshot. The business write, audit row, and mutation execution
// ledger are committed atomically by executeMutationOnce.

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonBody, type RequestUser } from '@/lib/http/api';
import {
  appendAssistantMessage,
  assertMastraMutationAllowed,
  createMutationWorkflow,
  getKestrelMastra,
  getMutationExecution,
  getUserRole,
  metrics,
  MutationExecutionConflictError,
  MutationExecutionContextError,
  parseMutationRunContext,
  runMutationWorkflow,
} from '@/lib/services/api-boundary';

import { atomicExecutorFor, executorFor } from './executors';
import { findMutationRun } from './find-mutation-run';

const ConfirmBodySchema = z.object({
  runId: z.string().min(1),
  confirmationToken: z.string().min(1),
});

export async function handleConfirmMutation(req: Request, user: RequestUser): Promise<Response> {
  let parsed: z.infer<typeof ConfirmBodySchema>;
  try {
    parsed = await parseJsonBody(req, ConfirmBodySchema);
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid confirmation body' } },
      { status: 400 },
    );
  }
  const { runId, confirmationToken } = parsed;
  const mastra = getKestrelMastra().instance;
  const run = await findMutationRun(runId);
  if (!run) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Mutation run not found' } },
      { status: 404 },
    );
  }

  const context = parseMutationRunContext(run);
  if (!context) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Mutation run has invalid persisted context' } },
      { status: 409 },
    );
  }
  if (context.userId !== user.userId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Not allowed to confirm this mutation' } },
      { status: 403 },
    );
  }

  const isAdmin =
    context.mutation === 'run_system_action'
      ? (await getUserRole(user.userId)) === 'admin'
      : undefined;

  try {
    assertMastraMutationAllowed({
      mutation: context.mutation,
      userId: context.userId,
      threadId: context.threadId,
      isAdmin: isAdmin === true,
      ...(context.systemAction ? { systemAction: context.systemAction } : {}),
      approval: {
        approvalId: runId,
        userId: context.userId,
        threadId: context.threadId,
        mutation: context.mutation,
        inputDigest: context.inputDigest,
        expiresAt: context.confirmation.expiresAt,
        confirmationToken,
        confirmation: context.confirmation,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'MastraMutationPolicyError') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 },
      );
    }
    throw error;
  }

  const existingExecution = await getMutationExecution(runId, user.userId);
  if (existingExecution) {
    if (existingExecution.status !== 'executed' || !existingExecution.resultId) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'Mutation execution is already in progress' } },
        { status: 409 },
      );
    }
    // Replay of a completed mutation must return a conflict without
    // re-emitting the assistant message or re-executing the business write.
    metrics.increment('mutation_replay_conflict_total');
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'This mutation has already been confirmed.',
          resultId: existingExecution.resultId,
        },
      },
      { status: 409 },
    );
  }

  const workflow = createMutationWorkflow({
    mutation: context.mutation,
    userId: context.userId,
    threadId: context.threadId,
    execute: executorFor(context.mutation, context.userId),
    executeAtomic: atomicExecutorFor(context.mutation, context.userId),
    isAdmin: isAdmin === true,
    mastra,
  });

  try {
    const result = await runMutationWorkflow(workflow, {
      runId,
      resumeData: { confirmationToken },
      userId: context.userId,
      threadId: context.threadId,
    });

    if (result.status !== 'executed' || !result.output) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'Mutation run is not in a confirmable state' } },
        { status: 409 },
      );
    }

    await appendAssistantMessage(
      user.userId,
      context.threadId,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text: `Mutation executed: ${result.output.summary}` }],
      },
      { idempotencyKey: `mutation-confirm:${runId}:assistant` },
    );

    return NextResponse.json({
      ok: true,
      status: 'executed',
      runId,
      output: result.output,
    });
  } catch (error) {
    // Mastra may reject a concurrent second resume after the first request has
    // already committed the business mutation. Reconcile against the durable
    // ledger before turning that race into a 500.
    const settledExecution = await getMutationExecution(runId, user.userId);
    if (settledExecution?.status === 'executing') {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'Mutation execution is already in progress' } },
        { status: 409 },
      );
    }
    if (settledExecution?.status === 'executed' && settledExecution.resultId) {
      // Concurrent execution race: Mastra rejected the resume, but the ledger
      // shows the first caller already committed the mutation. Return a
      // conflict without re-emitting the assistant message.
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'This mutation has already been confirmed.',
            resultId: settledExecution.resultId,
          },
        },
        { status: 409 },
      );
    }

    const name = error instanceof Error ? error.name : '';
    if (name === 'MastraMutationPolicyError') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: error instanceof Error ? error.message : 'Confirmation rejected',
          },
        },
        { status: 403 },
      );
    }
    if (
      name === 'MastraMutationContextError' ||
      error instanceof MutationExecutionConflictError ||
      error instanceof MutationExecutionContextError
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: error instanceof Error ? error.message : 'Mutation context mismatch',
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
