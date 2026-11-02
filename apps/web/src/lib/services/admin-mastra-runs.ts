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

// Admin Mastra runs viewer service.
//
// The route is a thin controller over this module so the raw Drizzle query
// never lives under `src/app/api/**`.

import { getDb, schema } from '@kestrel/db';
import { and, desc, gt, isNotNull, like, or } from 'drizzle-orm';

import type { RunTelemetryRow } from './admin';
import { getKestrelMastra, toMastraRunView } from './chat-ai';

export interface MastraRunsQuery {
  hours: number;
  limit: number;
  kind?: string;
}

/**
 * One row per Mastra run, joined across the three runId-keyed surfaces:
 * chat_telemetry (provider/cost/latency), workflow snapshots (stage/status),
 * and the scores domain (was it grounded).
 */
export async function listMastraRunsForAdmin(query: MastraRunsQuery) {
  const { hours, limit, kind } = query;
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(schema.chatTelemetry)
    .where(
      and(
        gt(schema.chatTelemetry.createdAt, since),
        isNotNull(schema.chatTelemetry.runId),
        or(
          like(schema.chatTelemetry.kind, 'mastra_%'),
          ...(kind ? [like(schema.chatTelemetry.kind, `${kind}%`)] : []),
        ),
      ),
    )
    .orderBy(desc(schema.chatTelemetry.createdAt))
    .limit(limit);

  // Latest row per runId (a run may emit several rows across retries).
  const latestByRun = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!row.runId) continue;
    const existing = latestByRun.get(row.runId);
    if (!existing || row.createdAt.getTime() > existing.createdAt.getTime()) {
      latestByRun.set(row.runId, row);
    }
  }

  const instance = getKestrelMastra().instance;
  const views = [];
  for (const row of latestByRun.values()) {
    const telemetry: RunTelemetryRow = {
      runId: row.runId,
      traceId: row.traceId,
      threadId: row.threadId,
      userId: row.userId,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      toolCalls: row.toolCalls,
      ms: row.ms,
      estCostUsd: row.estCostUsd,
      kind: row.kind,
      createdAt: row.createdAt,
    };
    views.push(await toMastraRunView(telemetry, instance));
  }

  views.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const failed = views.filter(
    (view) => view.workflow.status === 'failed' || view.workflow.failedSteps.length > 0,
  ).length;
  const scored = views.filter((view) => view.scores.length > 0).length;

  return { hours, count: views.length, failed, scored, runs: views };
}
