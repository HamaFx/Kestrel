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

/**
 * Phase 6 evals — quality gate over score records.
 *
 * The existing `EvalQualityGate` (from `src/eval/quality-gate.ts`) validates
 * transport/assertion/citation/latency/cost metrics of a full eval run. This
 * module adapts it into a Mastra-native gate that consumes the `scores`
 * storage domain: given the score rows recorded for a run (or an experiment
 * batch), it produces the same `passed/failures/thresholds/observed` envelope
 * so CI and release tooling can consume one gate contract regardless of the
 * run's origin (legacy eval runner or Mastra experiment).
 */

import { createCategorizedLogger } from '@kestrel/shared/logger';
import { createScorer, type MastraScorer } from '@mastra/core/evals';

import {
  DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
  evaluateEvalQualityGate,
  type EvalQualityGateResult,
  type EvalQualityGateThresholds,
} from '../../eval/quality-gate';
import type { ScoreRecord } from './scores';

const glog = createCategorizedLogger('ai', { component: 'mastra-evals-gate' });

export interface MastraGateScoreInput {
  /** Score rows recorded for the run/batch being gated. */
  records: ScoreRecord[];
  /** Optional thresholds; defaults to the canonical eval gate thresholds. */
  thresholds?: EvalQualityGateThresholds;
  /** Expected minimum number of scored records. */
  minScoreCount?: number;
}

/**
 * Translate Mastra score records into the canonical eval-gate observed shape.
 *
 * Mapping:
 * - `caseCount`   ← number of score records (scorer runs)
 * - `successfulCaseCount` ← records with `score >= 0.5` (or `score === 1` for
 *   the boolean grounding scorer)
 * - `overallPassRate` ← share of records meeting their scorer threshold
 * - `averageCitationScore` ← mean of `kestrel-citation` scores
 * - latency/cost are not part of the score domain; they stay `null` unless
 *   the caller enriches records with `metadata.ttftMs`/`totalMs`/`costUsd`.
 */
/**
 * Scorers where a LOW score is good (hallucination, bias, toxicity).
 * Anything else is treated as high-is-good.
 */
const INVERTED_SCORERS = new Set(['hallucination', 'bias', 'toxicity']);

/** A hallucination/bias/toxicity score at or below this is a pass. */
const INVERTED_PASS_CEILING = 0.2;

export function recordsToGateObserved(
  records: readonly ScoreRecord[],
  thresholds: EvalQualityGateThresholds = DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
): EvalQualityGateResult {
  // Group by run ID so N scorer rows → 1 logical case per evaluated turn.
  const groups = new Map<string, ScoreRecord[]>();
  for (const record of records) {
    const existing = groups.get(record.runId) ?? [];
    existing.push(record);
    groups.set(record.runId, existing);
  }

  const effectiveThresholds: EvalQualityGateThresholds = {
    ...DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
    ...thresholds,
  };

  const pass = (record: ScoreRecord): boolean => {
    if (record.scorerId === 'kestrel-grounding') return record.score === 1;
    if (record.scorerId === 'kestrel-citation') {
      return record.score >= effectiveThresholds.minCitationScore;
    }
    if (INVERTED_SCORERS.has(record.scorerId)) return record.score <= INVERTED_PASS_CEILING;
    return record.score >= effectiveThresholds.minOverallPassRate;
  };

  const citationScores = records
    .filter((record) => record.scorerId === 'kestrel-citation')
    .map((record) => record.score);

  // One logical case per run: passes when ALL scorer rows pass individually.
  const cases = [...groups.values()].map((group) => {
    const allPassed = group.every(pass);
    const citationRecord = group.find((r) => r.scorerId === 'kestrel-citation');
    const groundingFailure = group.find(
      (r) => r.scorerId === 'kestrel-grounding' && r.score < 1,
    );
    return {
      id: group[0]!.runId,
      prompt: '',
      ttftMs: group[0]!.metadata?.ttftMs ?? null,
      totalMs: group[0]!.metadata?.totalMs ?? 0,
      text: '',
      toolCalls: [],
      ok: allPassed,
      metadata: {
        totalCostUsd: group[0]!.metadata?.costUsd ?? 0,
      },
      citationScore: citationRecord?.score ?? null,
      assertions: groundingFailure
        ? [
            {
              kind: 'unsupported_numeric_claim' as const,
              detail: groundingFailure.reason ?? 'report failed grounding',
            },
          ]
        : [],
      agentProgress: [],
      terminalStatus: null,
    };
  });

  return evaluateEvalQualityGate(cases, {
      ...effectiveThresholds,
      minCaseCount: Math.max(effectiveThresholds.minCaseCount, 1),
      // Override the runner-specific citation minimum with the mean of the
      // citation records (allows the gate to run with only score records).
      ...(citationScores.length > 0
        ? { minCitationScore: effectiveThresholds.minCitationScore }
        : {}),
    },
  );
}

/**
 * Mastra gate scorer — attach to a `runEvals` config's `gates` or use
 * directly with the score records persisted for a run. Returns 1 when the
 * batch meets the configured thresholds, 0 otherwise, with a human-readable
 * reason listing failures.
 */
export function createMastraEvalGate(
  options: MastraGateScoreInput = { records: [] },
): MastraScorer<
  string,
  unknown,
  unknown,
  Record<'preprocessStepResult', { passed: boolean; failures: string[] }>
> {
  return createScorer({
    id: 'kestrel-eval-gate',
    name: 'Kestrel Eval Quality Gate',
    description:
      'Scores 1 when the recorded eval scores meet the Kestrel quality thresholds (pass rates, citation score, latency/cost ceilings).',
    type: 'agent',
  })
    .preprocess(async ({ run }) => {
      const input = (run.input ?? options) as MastraGateScoreInput;
      const records = input.records ?? [];
      if (records.length === 0) {
        glog.warn('Eval gate ran with no score records; failing', { runId: run.runId });
        return {
          passed: false,
          failures: ['no score records were provided to the eval gate'],
        };
      }
      const result = recordsToGateObserved(records, input.thresholds);
      return { passed: result.passed, failures: result.failures };
    })
    .generateScore(({ results }) => {
      const step = results.preprocessStepResult;
      if (!step) return 0;
      if (!step.passed) {
        glog.warn('Eval gate failed', { failures: step.failures.slice(0, 5) });
      }
      return step.passed ? 1 : 0;
    }) as unknown as MastraScorer<
    string,
    unknown,
    unknown,
    Record<'preprocessStepResult', { passed: boolean; failures: string[] }>
  >;
}

/**
 * Deterministic scorer that wraps a single score-record predicate — used to
 * gate a specific scorer's minimum (e.g. "hallucination must be ≤ 0.1").
 */
export function createScoreThresholdGate(
  scorerId: string,
  options: { min?: number; max?: number; description?: string } = {},
): MastraScorer<
  string,
  unknown,
  unknown,
  Record<'preprocessStepResult', { passed: boolean; score: number }>
> {
  const { min = 0.5, max = null, description } = options;
  return createScorer({
    id: `kestrel-gate-${scorerId}`,
    name: `Gate: ${scorerId}`,
    description:
      description ??
      `Scores 1 when the '${scorerId}' score meets the configured ${max === null ? `minimum ${min}` : `range [${min}, ${max}]`}.`,
    type: 'agent',
  })
    .preprocess(async ({ run }) => {
      const records = ((run.input as { records?: ScoreRecord[] } | undefined)?.records ??
        []) as ScoreRecord[];
      const record = records.find((candidate) => candidate.scorerId === scorerId);
      if (!record) return { passed: false, score: 0 };
      const passed = record.score >= min && (max === null || record.score <= max);
      return { passed, score: record.score };
    })
    .generateScore(({ results }) => {
      return results.preprocessStepResult?.passed ? 1 : 0;
    }) as unknown as MastraScorer<
    string,
    unknown,
    unknown,
    Record<'preprocessStepResult', { passed: boolean; score: number }>
  >;
}
