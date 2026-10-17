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

// Audit plan §5.1/§5.3 — nightly eval quality gate.
//
// Reads the recent committee/chat run ids from `chat_telemetry`, pulls their
// Mastra score rows (citation / grounding / conversation scorers) from the
// configured storage, applies the canonical gate thresholds via
// `recordsToGateObserved`, and exits non-zero when the batch regresses.
// Deployment-light setups without eval scores exit 0 with an explicit notice
// — the gate never blocks on missing infrastructure, only on regressions.
//
// §5.1: in addition to the absolute thresholds, the gate compares observed
// quality against the committed baseline artifact
// (`docs/archive/audit-v2/eval-baseline.json`) and fails on a >5% relative
// drop. `--update-baseline` regenerates the artifact from the current batch
// (run it on main after a green nightly). Zero recorded scores for a full
// day no longer skip silently: the gate emits a loud CI warning, and exits
// non-zero when `--fail-on-empty` is passed.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getDb, schema } from '@kestrel/db/client';
import { desc, gte } from 'drizzle-orm';

import {
  compareEvalBaseline,
  parseEvalBaseline,
  serializeEvalBaseline,
  type EvalBaselineArtifact,
} from '../src/eval/baseline';
import { getKestrelMastra, listScoresForRun, recordsToGateObserved } from '../src/mastra-v2/index';

const DEFAULT_BASELINE_PATH = fileURLToPath(
  new URL('../../../docs/archive/audit-v2/eval-baseline.json', import.meta.url),
);

const args = new Set(process.argv.slice(2));
const updateBaseline = args.has('--update-baseline');
const failOnEmpty = args.has('--fail-on-empty');
const baselinePathArg = [...args].find((arg) => arg.startsWith('--baseline='));
const baselinePath = baselinePathArg
  ? baselinePathArg.slice('--baseline='.length)
  : DEFAULT_BASELINE_PATH;

function fail(message: string): never {
  console.error(`[eval-gate] FAIL: ${message}`);
  process.exit(1);
}

/** A configured score store with zero data is an operational problem, not a
 * silent pass: surface a CI-visible warning (and fail with --fail-on-empty). */
function warnEmpty(message: string): never {
  console.error(`::warning::[eval-gate] ${message}`);
  console.error(`[eval-gate] EMPTY: ${message}`);
  if (failOnEmpty) process.exit(1);
  process.exit(0);
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
    warnEmpty(
      'no scored runs recorded in the last 24h — sampled live scoring is not producing telemetry.',
    );
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
    warnEmpty(
      'no score rows recorded for the recent runs — enable sampled live scoring to activate the gate.',
    );
  }

  const result = recordsToGateObserved(records);

  if (updateBaseline) {
    const artifact: EvalBaselineArtifact = {
      schemaVersion: 'kestrel.eval-baseline.v1',
      generatedAt: new Date().toISOString(),
      runCount: runIds.length,
      recordCount: records.length,
      observed: {
        overallPassRate: result.observed.overallPassRate,
        averageCitationScore: result.observed.averageCitationScore,
      },
    };
    writeFileSync(baselinePath, serializeEvalBaseline(artifact));
    console.log(
      `[eval-gate] BASELINE updated: ${baselinePath} (passRate=${result.observed.overallPassRate.toFixed(4)}, citation=${result.observed.averageCitationScore?.toFixed(4) ?? 'n/a'}, runs=${runIds.length}).`,
    );
    process.exit(0);
  }

  const failures = [...(result.failures ?? [])];

  let baseline: EvalBaselineArtifact | null = null;
  try {
    baseline = parseEvalBaseline(readFileSync(baselinePath, 'utf8'));
  } catch (error) {
    fail(
      `stored eval baseline at ${baselinePath} is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (baseline) {
    const comparison = compareEvalBaseline(baseline, {
      overallPassRate: result.observed.overallPassRate,
      averageCitationScore: result.observed.averageCitationScore,
    });
    if (!comparison.ok) {
      failures.push(...comparison.failures);
      console.error(
        `[eval-gate] baseline ${baseline.generatedAt} (${baseline.runCount} runs): ${comparison.failures.length} relative-drop regression(s).`,
      );
    } else {
      console.log(
        `[eval-gate] within 5% of baseline ${baseline.generatedAt} (passRate ${baseline.observed.overallPassRate.toFixed(4)} → ${result.observed.overallPassRate.toFixed(4)}).`,
      );
    }
  } else {
    console.log(
      `[eval-gate] NOTE: no baseline artifact at ${baselinePath} — record one on main with \`pnpm eval:gate -- --update-baseline\`.`,
    );
  }

  console.log(
    `[eval-gate] ${failures.length === 0 ? 'PASS' : 'FAIL'} — ${records.length} score records over ${runIds.length} runs.`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`[eval-gate]   - ${failure}`);
    fail(`eval quality gate regressions: ${failures.length}`);
  }
  process.exit(0);
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
