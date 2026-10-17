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
 * Audit plan §5.1 — stored eval baseline.
 *
 * The nightly gate previously compared observed scores against absolute
 * thresholds only, so a slow multi-day regression that stayed above the
 * absolute floor would pass forever. A committed baseline artifact lets the
 * gate fail on a >5% relative drop vs the recorded main-branch reference.
 * Regenerate the artifact with `pnpm eval:gate -- --update-baseline`.
 */

export interface EvalBaselineArtifact {
  schemaVersion: 'kestrel.eval-baseline.v1';
  /** ISO timestamp of the nightly run the baseline was generated from. */
  generatedAt: string;
  /** Scored committee/chat runs the baseline was computed over. */
  runCount: number;
  /** Individual score records (scorer rows) in the baseline batch. */
  recordCount: number;
  observed: {
    overallPassRate: number;
    averageCitationScore: number | null;
  };
}

/** Relative drop vs baseline that fails the gate (5% of the baseline value). */
export const EVAL_BASELINE_RELATIVE_DROP_LIMIT = 0.05;

export interface EvalBaselineComparison {
  ok: boolean;
  failures: string[];
}

function relativeDropFailure(
  metric: string,
  baseline: number,
  current: number,
): string | null {
  if (!Number.isFinite(baseline) || baseline <= 0) return null;
  const drop = (baseline - current) / baseline;
  if (drop > EVAL_BASELINE_RELATIVE_DROP_LIMIT) {
    const floor = baseline * (1 - EVAL_BASELINE_RELATIVE_DROP_LIMIT);
    return `${metric} regressed more than ${EVAL_BASELINE_RELATIVE_DROP_LIMIT * 100}% vs baseline: ${current.toFixed(4)} < ${floor.toFixed(4)} (baseline ${baseline.toFixed(4)})`;
  }
  return null;
}

/**
 * Compare current observed quality against the stored baseline. Improvements
 * and small fluctuations pass; only a relative drop beyond the limit fails.
 * Citation is only compared when both sides have a recorded value.
 */
export function compareEvalBaseline(
  baseline: EvalBaselineArtifact,
  observed: { overallPassRate: number; averageCitationScore: number | null },
): EvalBaselineComparison {
  const failures: string[] = [];
  const passRateFailure = relativeDropFailure(
    'overallPassRate',
    baseline.observed.overallPassRate,
    observed.overallPassRate,
  );
  if (passRateFailure) failures.push(passRateFailure);
  if (
    baseline.observed.averageCitationScore !== null &&
    observed.averageCitationScore !== null
  ) {
    const citationFailure = relativeDropFailure(
      'averageCitationScore',
      baseline.observed.averageCitationScore,
      observed.averageCitationScore,
    );
    if (citationFailure) failures.push(citationFailure);
  }
  return { ok: failures.length === 0, failures };
}

/** Serialize an artifact; throws on malformed input so bad writes fail loudly. */
export function serializeEvalBaseline(
  artifact: EvalBaselineArtifact,
): string {
  if (artifact.schemaVersion !== 'kestrel.eval-baseline.v1') {
    throw new Error(`Unsupported eval baseline schema: ${String(artifact.schemaVersion)}`);
  }
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

/** Parse a stored artifact; returns null when the file is absent or empty. */
export function parseEvalBaseline(raw: string | null): EvalBaselineArtifact | null {
  if (!raw || !raw.trim()) return null;
  const parsed = JSON.parse(raw) as EvalBaselineArtifact;
  if (parsed.schemaVersion !== 'kestrel.eval-baseline.v1') {
    throw new Error(`Unsupported eval baseline schema: ${String(parsed.schemaVersion)}`);
  }
  if (
    typeof parsed.observed.overallPassRate !== 'number' ||
    !Number.isFinite(parsed.observed.overallPassRate)
  ) {
    throw new Error('Eval baseline is missing a numeric observed.overallPassRate');
  }
  return parsed;
}
