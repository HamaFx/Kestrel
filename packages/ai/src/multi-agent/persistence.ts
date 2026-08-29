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

// Multi-Agent Orchestration — opinion persistence.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import type { AgentOpinionRow } from '@kestrel/db/schema';
import { container } from '@kestrel/shared';
import { and, asc, eq } from 'drizzle-orm';

import { getDiagnosticContext } from '../diagnostics/run-context';
import { enqueuePersistenceFailure } from '../persistence-outbox';
import { DB } from '../tokens';

export interface SaveOpinionsArgs {
  userId: string;
  threadId: string;
  messageId: string;
  analysisMode: string;
  opinions: Array<{
    agentName: string;
    bias: string;
    confidence: number;
    reasoning: string;
    rawData: Record<string, unknown>;
    model: string;
    costUsd: number;
    latencyMs: number;
  }>;
}

export async function saveAgentOpinions(args: SaveOpinionsArgs): Promise<void> {
  const db = container.resolve(DB);
  const tenantId = await requireTenantIdForUser(args.userId, db);
  if (args.opinions.length === 0) return;

  const [parent] = await db
    .select({
      threadId: schema.chatThreads.id,
      messageId: schema.chatMessages.id,
    })
    .from(schema.chatThreads)
    .innerJoin(
      schema.chatMessages,
      and(
        eq(schema.chatMessages.id, args.messageId),
        eq(schema.chatMessages.threadId, schema.chatThreads.id),
        eq(schema.chatMessages.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(schema.chatThreads.id, args.threadId),
        eq(schema.chatThreads.userId, args.userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!parent) {
    throw new Error('Cannot persist agent opinions for an unowned thread or message.');
  }

  try {
    await db
      .insert(schema.agentOpinions)
      .values(
        args.opinions.map((op) => ({
          userId: args.userId,
          tenantId,
          threadId: args.threadId,
          messageId: args.messageId,
          agentName: op.agentName,
          bias: op.bias,
          confidence: op.confidence,
          reasoning: op.reasoning,
          rawData: op.rawData,
          model: op.model,
          costUsd: op.costUsd,
          latencyMs: op.latencyMs,
          analysisMode: args.analysisMode,
        })),
      )
      .onConflictDoNothing({
        target: [schema.agentOpinions.messageId, schema.agentOpinions.agentName],
      });
  } catch (err) {
    const context = getDiagnosticContext();
    await enqueuePersistenceFailure({
      userId: args.userId,
      operation: 'agent.opinions',
      dedupeKey: `agent.opinions:${args.messageId}`,
      threadId: args.threadId,
      messageId: args.messageId,
      traceId: context?.traceId,
      runId: context?.runId,
      jobId: context?.jobId,
      payload: args as unknown as Record<string, unknown>,
      error: err,
    });
    throw err;
  }
}

/** S1 fix — scope agent opinion queries by userId to prevent cross-tenant data leaks. */
export async function listAgentOpinions(
  userId: string,
  threadId: string,
): Promise<AgentOpinionRow[]> {
  const db = container.resolve(DB);
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ opinion: schema.agentOpinions })
    .from(schema.agentOpinions)
    .innerJoin(
      schema.chatThreads,
      and(
        eq(schema.chatThreads.id, schema.agentOpinions.threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .innerJoin(
      schema.chatMessages,
      and(
        eq(schema.chatMessages.id, schema.agentOpinions.messageId),
        eq(schema.chatMessages.threadId, schema.agentOpinions.threadId),
        eq(schema.chatMessages.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(schema.agentOpinions.userId, userId),
        eq(schema.agentOpinions.tenantId, tenantId),
        eq(schema.agentOpinions.threadId, threadId),
      ),
    )
    .orderBy(asc(schema.agentOpinions.createdAt));
  return rows.map(({ opinion }) => opinion);
}

export async function listMessageOpinions(
  userId: string,
  messageId: string,
): Promise<AgentOpinionRow[]> {
  const db = container.resolve(DB);
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ opinion: schema.agentOpinions })
    .from(schema.agentOpinions)
    .innerJoin(
      schema.chatThreads,
      and(
        eq(schema.chatThreads.id, schema.agentOpinions.threadId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .innerJoin(
      schema.chatMessages,
      and(
        eq(schema.chatMessages.id, schema.agentOpinions.messageId),
        eq(schema.chatMessages.threadId, schema.agentOpinions.threadId),
        eq(schema.chatMessages.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(schema.agentOpinions.userId, userId),
        eq(schema.agentOpinions.tenantId, tenantId),
        eq(schema.agentOpinions.messageId, messageId),
      ),
    )
    .orderBy(asc(schema.agentOpinions.createdAt));
  return rows.map(({ opinion }) => opinion);
}
