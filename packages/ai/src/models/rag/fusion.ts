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

// ---------------------------------------------------------------------------
// RRF + time decay (DEC-05 split of rag.ts).
// ---------------------------------------------------------------------------

import type { RagRow } from './types';

const RRF_K = 60; // Reciprocal-rank fusion constant — larger = flatter weighting.

/** Exported for testing — pure RRF fusion algorithm. */
export function rrfFuse(rankings: RagRow[][]): RagRow[] {
  const fused = new Map<string, { row: RagRow; score: number; bestSimilarity: number }>();
  for (const list of rankings) {
    list.forEach((row, idx) => {
      const rank = idx + 1;
      const contribution = 1 / (RRF_K + rank);
      const existing = fused.get(row.id);
      if (existing) {
        existing.score += contribution;
        // Preserve the highest dense similarity we've seen so the final
        // row carries a meaningful similarity number for the consumer.
        if (row.similarity > existing.bestSimilarity) {
          existing.bestSimilarity = row.similarity;
          existing.row = row;
        }
      } else {
        fused.set(row.id, { row, score: contribution, bestSimilarity: row.similarity });
      }
    });
  }

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ row, bestSimilarity }) => ({
      ...row,
      similarity: bestSimilarity > 0 ? bestSimilarity : 0.5,
    }));
}

/** Exported for testing — pure time-decay function. */
export function decayRow(row: RagRow, halflifeDays: number): RagRow {
  const ageDays = Math.max(0, (Date.now() - row.publishedAt.getTime()) / (24 * 60 * 60 * 1000));
  // exp(-ln2 * age / halflife) — a true halflife model.
  const factor = Math.exp(-Math.LN2 * (ageDays / halflifeDays));
  return { ...row, similarity: row.similarity * factor };
}
