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

// Mutation executors for POST /api/chat/mutations/confirm.
//
// Both entry points share one write implementation:
//
//   - `atomicExecutorFor` is the production executor. It runs the write, the
//     audit row, and the mutation execution ledger in one transaction through
//     `executeMutationOnce`.
//   - `executorFor` is the non-transactional fallback used only by local
//     Studio/tests. It still opens the user's tenant scope, so it can never
//     reproduce the old unscoped-insert bug.
//
// The insert SQL lives in `executeMutationWrite` exactly once; the former
// copy-pasted switch in each executor was the source of their drift.

import { requireTenantIdForUser, schema, withUserTenant, type DbClient } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';

import {
  assertRegisteredSystemAction,
  assertSystemActionAuthorized,
  executeMutationOnce,
  rememberJournalEntry,
  syncIntermarketResonance,
  type MutationExecutor,
  type MutationExecutorResult,
  type MutationKindSchema,
} from '@/lib/services/chat-ai';

type MutationKind = z.infer<typeof MutationKindSchema>;
type MutationInput = Parameters<MutationExecutor>[0];

const mlog = createCategorizedLogger('ai', { component: 'chat-mutation-executor' });

/**
 * Chat-confirmed journal entries must be recallable through
 * `search_knowledge`, exactly like entries created in the Journal UI.
 * Runs after the business write commits and never blocks the response.
 */
function indexJournalEntryBestEffort(userId: string, entryId: string): void {
  void withUserTenant(userId, async () => rememberJournalEntry({ entryId, userId })).catch(
    (err) => {
      mlog.warn('chat journal memory write failed', { userId, entryId, err: String(err) });
    },
  );
}

/**
 * Execute one registered system action. `resonance_sync` runs the shared
 * intermarket sync (the same service the worker cron uses) and reports what
 * actually happened instead of returning a stub id.
 */
async function executeSystemAction(
  action: 'resonance_sync',
  db?: DbClient,
): Promise<{ id: string; summary: string }> {
  const result = await syncIntermarketResonance(db ? { db } : {});
  return {
    id: `system:${action}`,
    summary: `Intermarket resonance sync: ${result.note}`,
  };
}

function mutationSummary(input: MutationInput): string {
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

/** The single business write shared by both executors. */
async function executeMutationWrite(
  db: DbClient,
  userId: string,
  tenantId: string,
  input: MutationInput,
): Promise<MutationExecutorResult> {
  const summary = mutationSummary(input);
  switch (input.kind) {
    case 'set_alert': {
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
      return { id: rows[0]!.id, summary };
    }
    case 'log_journal': {
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
      return { id: rows[0]!.id, summary };
    }
    case 'share_snapshot': {
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
      return { id: rows[0]!.id, summary };
    }
    case 'run_system_action':
      assertRegisteredSystemAction(input.action);
      return executeSystemAction(input.action, db);
  }
}

/** Build the non-transactional fallback executor used only by local Studio/tests. */
export function executorFor(kind: MutationKind, userId: string): MutationExecutor {
  return async (input) => {
    if (input.kind !== kind) throw new Error('mutation kind mismatch');
    const result = await withUserTenant(userId, async (db) => {
      const tenantId = await requireTenantIdForUser(userId, db);
      return executeMutationWrite(db, userId, tenantId, input);
    });
    if (kind === 'log_journal') indexJournalEntryBestEffort(userId, result.id);
    return result;
  };
}

/** Build the production executor. Every query uses the supplied transaction. */
export function atomicExecutorFor(kind: MutationKind, userId: string) {
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
        if (input.kind !== kind) throw new Error('mutation kind mismatch');
        return executeMutationWrite(tx, userId, tenantId, input);
      },
    }).then(({ result }) => {
      if (kind === 'log_journal') indexJournalEntryBestEffort(userId, result.id);
      return result;
    });
}
