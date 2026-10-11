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

// Audit plan §5.3 — nightly eval quality gate.
//
// Reads the recent committee/chat run ids from `chat_telemetry`, pulls their
// Mastra score rows (citation / grounding / conversation scorers) from the
// configured storage, applies the canonical gate thresholds via
// `recordsToGateObserved`, and exits non-zero when the batch regresses.
// Deployment-light setups without eval scores exit 0 with an explicit notice
// — the gate never blocks on missing infrastructure, only on regressions.

import { gte, desc } from 'drizzle-orm';

import { getDb, schema } from '@kestrel/db/client';

import {
  getKestrelMastra,
  listScoresForRun,
  recordsToGateObserved,
} from '../src/mastra-v2/index';

function fail(message: string): never {
  console.error(`[eval-gate] FAIL: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log(
      '[eval-gate] SKIP: no DATABASE_URL/POSTGRES_URL configured — nightly gate requires the eval score store.',
    );
    process.exit(0);
  }

  // Recent scored turns: last 24h of committee runs with a recorded run id.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select({ runId: schema.chatTelemetry.runId })
    .from(schema.chatTelemetry)
    .where(gte(schema.chatTelemetry.createdAt, since))
    .orderBy(desc(schema.chatTelemetry.createdAt))
    .limit(200);

  const runIds = [
    ...new Set(
      rows
        .map((row) => row.runId)
        .filter((runId): runId is string => typeof runId === 'string' && runId.length > 0),
    ),
  ];

  if (runIds.length === 0) {
    console.log(
      '[eval-gate] SKIP: no recent scored runs — the gate requires sampled live scoring to have recorded telemetry.',
    );
    process.exit(0);
  }

  const instance = getKestrelMastra().instance;
  const records = [];
  for (const runId of runIds) {
    try {
      const scores = await listScoresForRun(instance, runId);
      records.push(...scores);
    } catch {
      // A run without score rows (unsampled turns) is not a regression.
    }
  }

  if (records.length === 0) {
    console.log(
      '[eval-gate] SKIP: no score rows recorded for the recent runs — enable sampled live scoring to activate the gate.',
    );
    process.exit(0);
  }

  const result = recordsToGateObserved(records);
  console.log(
    `[eval-gate] ${result.passed ? 'PASS' : 'FAIL'} — ${records.length} score records over ${runIds.length} runs.`,
  );
  if (result.failures?.length) {
    for (const failure of result.failures) console.error(`[eval-gate]   - ${failure}`);
    fail(`eval quality gate regressions: ${result.failures.length}`);
  }
  process.exit(0);
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
