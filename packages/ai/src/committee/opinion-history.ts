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

// Committee opinion history.
//
// One best-effort row per specialist desk per assistant message. The rows are
// user-facing cost and latency attribution for the settings usage page; they
// are not a calibration corpus and nothing grades them.

import { requireTenantIdForUser, schema, withDbRetry } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../runtime/db';

const plog = createCategorizedLogger('ai', { component: 'committee-opinion-history' });

export interface SaveOpinionsArgs {
  userId: string;
  threadId: string;
  messageId: string;
  analysisMode: string;
  /** Run symbol, recorded inside `raw_data.symbol` for attribution. */
  symbol?: string | undefined;
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

/** Merge the run symbol into the opinion's raw payload without clobbering one already present. */
function withRunSymbol(
  rawData: Record<string, unknown>,
  symbol: string | undefined,
): Record<string, unknown> {
  if (!symbol) return rawData;
  return typeof rawData.symbol === 'string' && rawData.symbol.length > 0
    ? rawData
    : { ...rawData, symbol };
}

/**
 * Best-effort write of one run's specialist opinions. Never throws: opinion
 * bookkeeping is secondary to the turn, so a failure is logged and the caller
 * continues.
 */
export async function saveAgentOpinionsBestEffort(args: SaveOpinionsArgs): Promise<boolean> {
  try {
    await saveAgentOpinions(args);
    return true;
  } catch (error) {
    plog.warn('Agent-opinion persistence failed', {
      userId: args.userId,
      threadId: args.threadId,
      messageId: args.messageId,
      err: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function saveAgentOpinions(args: SaveOpinionsArgs): Promise<void> {
  const db = getDb();
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
    await withDbRetry(() =>
      db
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
            rawData: withRunSymbol(op.rawData, args.symbol),
            model: op.model,
            costUsd: op.costUsd,
            latencyMs: op.latencyMs,
            analysisMode: args.analysisMode,
          })),
        )
        .onConflictDoNothing({
          target: [schema.agentOpinions.messageId, schema.agentOpinions.agentName],
        }),
    );
  } catch (err) {
    plog.error('Agent-opinion persistence failed', {
      userId: args.userId,
      threadId: args.threadId,
      messageId: args.messageId,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
