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
 * Phase 1 (Jev System One) — exact TypeSafe calibration formulas.
 *
 * TypeSafe endpoints normally return a precomputed `confidence`, but the free
 * OpenCode tier and raw `noul` answers can omit it. These helpers recompute
 * the vendor's published formulas from the returned probabilities so callers
 * always get a calibrated number to threshold against:
 *
 *   - `noul`   — confidence = |2p − 1|  (distance from the 0.5 decision boundary)
 *   - `choice` — normalised concentration (p_max − 1/n) / (1 − 1/n)
 *   - `score`  — expected level index E = Σ i·p_i normalised to [0, 1], with
 *                confidence = 1 − MAD / MAD_uniform (mean absolute deviation
 *                from the modal level, scaled by the uniform distribution's MAD)
 *
 * Every function clamps its inputs/outputs into [0, 1] and never divides by
 * zero (including the n = 1 degenerate case).
 */

/** Clamp a value into [0, 1]; non-finite values collapse to 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export interface JevNoulConfidence {
  value: boolean;
  probability: number;
  confidence: number;
}

/**
 * `noul` — boolean value plus |2p − 1| confidence (0.5 probability = 0
 * confidence; 0 or 1 = full confidence).
 */
export function computeNoulConfidence(noul: number): JevNoulConfidence {
  const probability = clamp01(noul);
  return {
    value: probability >= 0.5,
    probability,
    confidence: clamp01(Math.abs(2 * probability - 1)),
  };
}

export interface JevChoiceConfidence {
  choice: string;
  confidence: number;
}

/**
 * `choice` — modal label plus normalised concentration across the labels.
 * With one label there is nothing to concentrate, so confidence is 1.
 */
export function computeChoiceConfidence(probabilities: Record<string, number>): JevChoiceConfidence {
  const entries = Object.entries(probabilities);
  if (entries.length === 0) return { choice: '', confidence: 0 };

  let bestLabel = entries[0]![0];
  let bestProbability = clamp01(entries[0]![1]);
  for (const [label, value] of entries) {
    const probability = clamp01(value);
    if (probability > bestProbability) {
      bestLabel = label;
      bestProbability = probability;
    }
  }

  const n = entries.length;
  if (n === 1) return { choice: bestLabel, confidence: 1 };
  return {
    choice: bestLabel,
    confidence: clamp01((bestProbability - 1 / n) / (1 - 1 / n)),
  };
}

export interface JevScoreConfidence {
  score: number;
  confidence: number;
}

/**
 * `score` — expected level index normalised to [0, 1] plus a MAD-based
 * confidence. `n = 1` returns the single probability as the score with full
 * confidence (there is no spread to measure).
 */
export function computeScoreConfidence(probabilities: readonly number[]): JevScoreConfidence {
  const n = probabilities.length;
  if (n === 0) return { score: 0, confidence: 0 };
  if (n === 1) return { score: clamp01(probabilities[0] ?? 0), confidence: 1 };

  const values = probabilities.map(clamp01);

  let expected = 0;
  for (let i = 0; i < n; i += 1) expected += i * values[i]!;
  const score = clamp01(expected / (n - 1));

  let mode = 0;
  for (let i = 1; i < n; i += 1) {
    if (values[i]! > values[mode]!) mode = i;
  }

  let mad = 0;
  for (let i = 0; i < n; i += 1) mad += values[i]! * Math.abs(i - mode);

  let uniformMad = 0;
  for (let i = 0; i < n; i += 1) uniformMad += Math.abs(i - (n - 1) / 2);
  uniformMad /= n;

  const confidence = clamp01(1 - mad / Math.max(1e-9, uniformMad));
  return { score, confidence };
}
