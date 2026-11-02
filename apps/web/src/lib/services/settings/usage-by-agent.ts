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

// Per-agent and per-mode cost breakdown for /api/settings/usage-by-agent.
//
// Reads from the agent_opinions table (specialist agents) — the Decision
// agent's cost is not in agent_opinions (it doesn't produce an opinion), so
// the route composes the total from the specialist rows plus the usage
// summary.

import { getDb, requireTenantIdForUser, schema } from '@kestrel/db';
import { and, eq, gte, sql } from 'drizzle-orm';

export interface UsageByAgentQuery {
  userId: string;
  periodDays: number;
}

export interface UsageByAgentResult {
  byAgent: Array<{
    agentName: string;
    turns: number;
    totalCostUsd: number;
    avgLatencyMs: number;
  }>;
  byMode: Array<{ analysisMode: string; turns: number; totalCostUsd: number }>;
  totalCostUsd: number;
  totalTurns: number;
}

export async function getUsageByAgent({
  userId,
  periodDays,
}: UsageByAgentQuery): Promise<UsageByAgentResult> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  // Per-agent breakdown (specialist agents only — they have rows in agent_opinions).
  const byAgentRows = await db
    .select({
      agentName: schema.agentOpinions.agentName,
      turns: sql<number>`count(*)::int`,
      totalCostUsd: sql<number>`coalesce(sum(${schema.agentOpinions.costUsd}), 0)::float8`,
      avgLatencyMs: sql<number>`coalesce(avg(${schema.agentOpinions.latencyMs}), 0)::int`,
    })
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
        gte(schema.agentOpinions.createdAt, since),
      ),
    )
    .groupBy(schema.agentOpinions.agentName);

  // Per-mode breakdown.
  const byModeRows = await db
    .select({
      analysisMode: schema.agentOpinions.analysisMode,
      turns: sql<number>`count(*)::int`,
      totalCostUsd: sql<number>`coalesce(sum(${schema.agentOpinions.costUsd}), 0)::float8`,
    })
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
        gte(schema.agentOpinions.createdAt, since),
      ),
    )
    .groupBy(schema.agentOpinions.analysisMode);

  return {
    byAgent: byAgentRows.map((row) => ({
      agentName: row.agentName,
      turns: Number(row.turns),
      totalCostUsd: Number(row.totalCostUsd),
      avgLatencyMs: Number(row.avgLatencyMs),
    })),
    byMode: byModeRows.map((row) => ({
      analysisMode: row.analysisMode,
      turns: Number(row.turns),
      totalCostUsd: Number(row.totalCostUsd),
    })),
    totalCostUsd: byAgentRows.reduce((sum, row) => sum + Number(row.totalCostUsd), 0),
    totalTurns: byAgentRows.reduce((sum, row) => sum + Number(row.turns), 0),
  };
}
