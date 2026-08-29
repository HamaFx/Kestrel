/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { and, eq } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../client';
import type { MutationExecutionRow } from '../schema/mutation-executions';
import { requireTenantIdForUser } from '../tenant';

export interface MutationExecutionBusinessResult {
  id: string;
  url?: string;
  summary?: string;
}

export interface ExecuteMutationOnceInput<T extends MutationExecutionBusinessResult> {
  runId: string;
  userId: string;
  threadId: string;
  mutation: string;
  inputDigest: string;
  /** Server-issued approval/run identity; defaults to runId for legacy callers. */
  approvalId?: string;
  approvalExpiresAt?: Date;
  execute: (tx: DbClient, tenantId: string) => Promise<T>;
  auditMetadata?: Record<string, unknown>;
  /** Optional transaction-capable database handle for integration tests. */
  db?: DbClient;
}

export interface ExecuteMutationOnceResult<T extends MutationExecutionBusinessResult> {
  result: T;
  replayed: boolean;
}

export async function getMutationExecution(
  runId: string,
  userId: string,
  db: DbClient = getDb(),
): Promise<MutationExecutionRow | null> {
  const tenantId = await requireTenantIdForUser(userId, db);
  const [row] = await db
    .select()
    .from(schema.mutationExecutions)
    .where(
      and(
        eq(schema.mutationExecutions.runId, runId),
        eq(schema.mutationExecutions.userId, userId),
        eq(schema.mutationExecutions.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export class MutationExecutionConflictError extends Error {
  readonly code = 'MUTATION_EXECUTION_CONFLICT';

  constructor(message = 'Mutation execution is already in progress or has an invalid state.') {
    super(message);
    this.name = 'MutationExecutionConflictError';
  }
}

export class MutationExecutionContextError extends Error {
  readonly code = 'MUTATION_EXECUTION_CONTEXT_MISMATCH';

  constructor(message = 'Mutation execution context does not match the drafted run.') {
    super(message);
    this.name = 'MutationExecutionContextError';
  }
}

/**
 * Claim and execute a mutation exactly once.
 *
 * The ledger row, business write, audit row, and final result transition all
 * share one transaction. A duplicate caller waits on the primary-key conflict
 * and then replays the committed result without calling `execute` again.
 */
export async function executeMutationOnce<T extends MutationExecutionBusinessResult>(
  input: ExecuteMutationOnceInput<T>,
): Promise<ExecuteMutationOnceResult<T>> {
  const db = input.db ?? getDb();

  return db.transaction(async (tx) => {
    const tenantId = await requireTenantIdForUser(input.userId, tx as unknown as DbClient);
    const claimed = await tx
      .insert(schema.mutationExecutions)
      .values({
        runId: input.runId,
        userId: input.userId,
        threadId: input.threadId,
        mutation: input.mutation,
        inputDigest: input.inputDigest,
        approvalId: input.approvalId ?? input.runId,
        approvalExpiresAt: input.approvalExpiresAt ?? null,
        tenantId,
        status: 'executing',
      })
      .onConflictDoNothing({ target: schema.mutationExecutions.runId })
      .returning({ runId: schema.mutationExecutions.runId });

    if (claimed.length === 0) {
      const [existing] = await tx
        .select()
        .from(schema.mutationExecutions)
        .where(eq(schema.mutationExecutions.runId, input.runId))
        .for('update');

      if (!existing) {
        throw new MutationExecutionConflictError(
          'Mutation execution claim disappeared before it could be read.',
        );
      }
      if (
        existing.userId !== input.userId ||
        existing.tenantId !== tenantId ||
        existing.threadId !== input.threadId ||
        existing.mutation !== input.mutation ||
        existing.inputDigest !== input.inputDigest ||
        (existing.approvalId ?? input.runId) !== (input.approvalId ?? input.runId)
      ) {
        throw new MutationExecutionContextError();
      }
      if (existing.status !== 'executed' || !existing.resultId || !existing.result) {
        throw new MutationExecutionConflictError();
      }

      return {
        replayed: true,
        result: existing.result as T,
      };
    }

    const result = await input.execute(tx as unknown as DbClient, tenantId);
    const metadata = {
      ...(input.auditMetadata ?? {}),
      mutation: input.mutation,
      runId: input.runId,
      threadId: input.threadId,
      resultId: result.id,
      inputDigest: input.inputDigest,
      approvalId: input.approvalId ?? input.runId,
      approvalExpiresAt: input.approvalExpiresAt?.toISOString() ?? null,
    };

    await tx.insert(schema.auditLogs).values({
      userId: input.userId,
      tenantId,
      action: `mutation.${input.mutation}.executed`,
      metadata,
    });

    await tx
      .update(schema.mutationExecutions)
      .set({
        status: 'executed',
        resultId: result.id,
        resultUrl: result.url ?? null,
        result,
        executedAt: new Date(),
      })
      .where(
        and(
          eq(schema.mutationExecutions.runId, input.runId),
          eq(schema.mutationExecutions.userId, input.userId),
          eq(schema.mutationExecutions.tenantId, tenantId),
          eq(schema.mutationExecutions.status, 'executing'),
        ),
      );

    return { result, replayed: false };
  });
}
