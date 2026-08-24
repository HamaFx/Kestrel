/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// SPDX-License-Identifier: Apache-2.0

// POST /api/chat/mutations/confirm
// Body: { runId: string, confirmationToken: string }
//
// The server derives mutation, user, and thread context from the persisted
// workflow snapshot. The business write, audit row, and mutation execution
// ledger are committed atomically by executeMutationOnce.

import { appendAssistantMessage } from '@kestrel/ai';
import {
  assertMastraMutationAllowed,
  assertRegisteredSystemAction,
  createMutationWorkflow,
  getKestrelMastra,
  MutationKindSchema,
  parseMutationRunContext,
  runMutationWorkflow,
  type MutationExecutor,
} from '@kestrel/ai/mastra';
import { metrics } from '@kestrel/shared';
import {
  executeMutationOnce,
  getDb,
  getMutationExecution,
  schema,
  MutationExecutionConflictError,
  MutationExecutionContextError,
} from '@kestrel/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConfirmBodySchema = z.object({
  runId: z.string().min(1),
  confirmationToken: z.string().min(1),
});

/** Build the non-transactional fallback executor used only by local Studio/tests. */
function executorFor(kind: z.infer<typeof MutationKindSchema>, userId: string): MutationExecutor {
  return async (input) => {
    switch (kind) {
      case 'set_alert': {
        if (input.kind !== 'set_alert') throw new Error('mutation kind mismatch');
        const db = getDb();
        const rows = await db
          .insert(schema.alerts)
          .values({
            userId,
            rule: input.rule,
            channels: input.channels ?? ['email'],
            note: input.note ?? null,
            snoozeHours: input.snoozeHours ?? 0,
          })
          .returning({ id: schema.alerts.id });
        return { id: rows[0]!.id };
      }
      case 'log_journal': {
        if (input.kind !== 'log_journal') throw new Error('mutation kind mismatch');
        const db = getDb();
        const rows = await db
          .insert(schema.journalEntries)
          .values({
            userId,
            symbol: input.symbol,
            side: input.side,
            openedAt: new Date(input.openedAt),
            entry: input.entry,
            stop: input.stop ?? null,
            target: input.target ?? null,
            exit: input.exit ?? null,
            size: input.size ?? null,
            outcome: input.outcome ?? 'open',
            rMultiple: input.rMultiple ?? null,
            notes: input.notes ?? null,
            tags: input.tags ?? [],
          })
          .returning({ id: schema.journalEntries.id });
        return { id: rows[0]!.id };
      }
      case 'share_snapshot': {
        if (input.kind !== 'share_snapshot') throw new Error('mutation kind mismatch');
        const db = getDb();
        const rows = await db
          .insert(schema.sharedSnapshots)
          .values({
            userId,
            title: input.title,
            body: input.body,
            symbol: input.symbol ?? null,
            tf: input.tf ?? null,
            expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 7 * 24 * 60) * 60_000),
          })
          .returning({ id: schema.sharedSnapshots.id });
        return { id: rows[0]!.id };
      }
      case 'run_system_action':
        if (input.kind !== 'run_system_action') throw new Error('mutation kind mismatch');
        assertRegisteredSystemAction(input.action);
        return { id: `system:${input.action}` };
    }
  };
}

function mutationSummary(input: Parameters<MutationExecutor>[0]): string {
  switch (input.kind) {
    case 'set_alert':
      return `Set alert on ${input.rule.symbol} (${input.rule.type})${input.note ? ` — ${input.note}` : ''}`;
    case 'log_journal':
      return `Log ${input.side} ${input.symbol} journal entry @ ${input.entry}`;
    case 'share_snapshot':
      return `Share snapshot “${input.title}”${input.symbol ? ` for ${input.symbol}` : ''}`;
    case 'run_system_action':
      return `Run system action: ${input.action}`;
  }
}

/** Build the production executor. Every query uses the supplied transaction. */
function atomicExecutorFor(kind: z.infer<typeof MutationKindSchema>, userId: string) {
  return async (
    input: Parameters<MutationExecutor>[0],
    context: {
      runId: string;
      userId: string;
      threadId: string;
      inputDigest: string;
      approvalId: string;
      approvalExpiresAt: number;
    },
  ) =>
    executeMutationOnce({
      runId: context.runId,
      userId,
      threadId: context.threadId,
      mutation: kind,
      inputDigest: context.inputDigest,
      approvalId: context.approvalId,
      approvalExpiresAt: new Date(context.approvalExpiresAt),
      auditMetadata: {
        kind: input.kind,
        approvalId: context.approvalId,
        approvalExpiresAt: new Date(context.approvalExpiresAt).toISOString(),
      },
      execute: async (tx) => {
        const summary = mutationSummary(input);
        switch (kind) {
          case 'set_alert': {
            if (input.kind !== 'set_alert') throw new Error('mutation kind mismatch');
            const rows = await tx
              .insert(schema.alerts)
              .values({
                userId,
                rule: input.rule,
                channels: input.channels ?? ['email'],
                note: input.note ?? null,
                snoozeHours: input.snoozeHours ?? 0,
              })
              .returning({ id: schema.alerts.id });
            return { id: rows[0]!.id, summary };
          }
          case 'log_journal': {
            if (input.kind !== 'log_journal') throw new Error('mutation kind mismatch');
            const rows = await tx
              .insert(schema.journalEntries)
              .values({
                userId,
                symbol: input.symbol,
                side: input.side,
                openedAt: new Date(input.openedAt),
                entry: input.entry,
                stop: input.stop ?? null,
                target: input.target ?? null,
                exit: input.exit ?? null,
                size: input.size ?? null,
                outcome: input.outcome ?? 'open',
                rMultiple: input.rMultiple ?? null,
                notes: input.notes ?? null,
                tags: input.tags ?? [],
              })
              .returning({ id: schema.journalEntries.id });
            return { id: rows[0]!.id, summary };
          }
          case 'share_snapshot': {
            if (input.kind !== 'share_snapshot') throw new Error('mutation kind mismatch');
            const rows = await tx
              .insert(schema.sharedSnapshots)
              .values({
                userId,
                title: input.title,
                body: input.body,
                symbol: input.symbol ?? null,
                tf: input.tf ?? null,
                expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 7 * 24 * 60) * 60_000),
              })
              .returning({ id: schema.sharedSnapshots.id });
            return { id: rows[0]!.id, summary };
          }
          case 'run_system_action':
            if (input.kind !== 'run_system_action') throw new Error('mutation kind mismatch');
            assertRegisteredSystemAction(input.action);
            return { id: `system:${input.action}`, summary };
        }
      },
    }).then(({ result }) => result);
}

export const POST = withAuth(async (req: Request, { user }) => {
  const parsed = ConfirmBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid confirmation body',
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { runId, confirmationToken } = parsed.data;
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

  try {
    assertMastraMutationAllowed({
      mutation: context.mutation,
      userId: context.userId,
      threadId: context.threadId,
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
        { error: { code: 'FORBIDDEN', message: error instanceof Error ? error.message : 'Confirmation rejected' } },
        { status: 403 },
      );
    }
    if (
      name === 'MastraMutationContextError' ||
      error instanceof MutationExecutionConflictError ||
      error instanceof MutationExecutionContextError
    ) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: error instanceof Error ? error.message : 'Mutation context mismatch' } },
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
