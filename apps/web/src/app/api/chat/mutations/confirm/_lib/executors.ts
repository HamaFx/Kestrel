/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// SPDX-License-Identifier: Apache-2.0

// Mutation executors for POST /api/chat/mutations/confirm.
//
// `executorFor` is the non-transactional fallback used only by local
// Studio/tests; `atomicExecutorFor` is the production executor where every
// query uses the supplied transaction and the business write, audit row, and
// mutation execution ledger are committed atomically by executeMutationOnce.

import { eq } from 'drizzle-orm';
import type { z } from 'zod';

import {
  assertRegisteredSystemAction,
  assertSystemActionAuthorized,
  executeMutationOnce,
  getDb,
  requireTenantIdForUser,
  schema,
  type MutationExecutor,
  type MutationKindSchema,
} from '@/lib/services/api-boundary';

/** Build the non-transactional fallback executor used only by local Studio/tests. */
export function executorFor(
  kind: z.infer<typeof MutationKindSchema>,
  userId: string,
): MutationExecutor {
  return async (input) => {
    switch (kind) {
      case 'set_alert': {
        if (input.kind !== 'set_alert') throw new Error('mutation kind mismatch');
        const db = getDb();
        const tenantId = await requireTenantIdForUser(userId, db);
        const rows = await db
          .insert(schema.alerts)
          .values({
            userId,
            tenantId,
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
        const tenantId = await requireTenantIdForUser(userId, db);
        const rows = await db
          .insert(schema.journalEntries)
          .values({
            userId,
            tenantId,
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
        const tenantId = await requireTenantIdForUser(userId, db);
        const rows = await db
          .insert(schema.sharedSnapshots)
          .values({
            userId,
            tenantId,
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

export function mutationSummary(input: Parameters<MutationExecutor>[0]): string {
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
export function atomicExecutorFor(kind: z.infer<typeof MutationKindSchema>, userId: string) {
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
      execute: async (tx, tenantId) => {
        if (kind === 'run_system_action') {
          if (input.kind !== 'run_system_action') throw new Error('mutation kind mismatch');
          const [caller] = await tx
            .select({ role: schema.users.role })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1);
          assertSystemActionAuthorized(input.action, caller?.role === 'admin');
        }
        const summary = mutationSummary(input);
        switch (kind) {
          case 'set_alert': {
            if (input.kind !== 'set_alert') throw new Error('mutation kind mismatch');
            const rows = await tx
              .insert(schema.alerts)
              .values({
                userId,
                tenantId,
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
                tenantId,
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
                tenantId,
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
