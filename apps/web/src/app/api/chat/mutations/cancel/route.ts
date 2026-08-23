/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// SPDX-License-Identifier: Apache-2.0

// POST /api/chat/mutations/cancel
// Body: { runId: string, confirmationToken: string }
//
// Cancellation is server-visible and terminal. The route derives the mutation
// context from the persisted workflow snapshot and never accepts thread/user
// identity from the client.

import {
  cancelMutationWorkflow,
  createMutationWorkflow,
  getKestrelMastra,
  MutationKindSchema,
  parseMutationRunContext,
  verifyMutationConfirmationToken,
} from '@kestrel/ai/mastra';
import { getMutationExecution, MutationExecutionConflictError } from '@kestrel/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CancelBodySchema = z.object({
  runId: z.string().min(1),
  confirmationToken: z.string().min(1),
});

export const POST = withAuth(async (req: Request, { user }) => {
  const parsed = CancelBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid cancellation body',
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { runId, confirmationToken } = parsed.data;
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
      { error: { code: 'FORBIDDEN', message: 'Not allowed to cancel this mutation' } },
      { status: 403 },
    );
  }

  const tokenValid = verifyMutationConfirmationToken({
    token: confirmationToken,
    stored: context.confirmation,
    mutation: context.mutation,
    userId: context.userId,
  });
  if (!tokenValid) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Mutation confirmation token is invalid or expired' } },
      { status: 403 },
    );
  }

  const existingExecution = await getMutationExecution(runId, user.userId);
  if (existingExecution) {
    if (existingExecution.status === 'executed') {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'Mutation has already been executed' } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Mutation execution is already in progress' } },
      { status: 409 },
    );
  }

  const workflow = createMutationWorkflow({
    mutation: context.mutation,
    userId: context.userId,
    threadId: context.threadId,
    execute: async () => {
      throw new Error('mutation executor is not available during cancellation');
    },
    mastra: getKestrelMastra().instance,
  });

  try {
    await cancelMutationWorkflow(workflow, { runId, userId: context.userId });
    return NextResponse.json({ ok: true, status: 'canceled', runId });
  } catch (error) {
    if (error instanceof MutationExecutionConflictError) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: error.message } },
        { status: 409 },
      );
    }
    throw error;
  }
});

async function findMutationRun(runId: string): Promise<unknown | null> {
  const storage = await getKestrelMastra().instance.getStorage()?.getStore('workflows');
  if (!storage) return null;
  for (const mutation of MutationKindSchema.options) {
    const run = await storage.getWorkflowRunById({ runId, workflowName: `mutation-${mutation}` });
    if (run) return run;
  }
  return null;
}
