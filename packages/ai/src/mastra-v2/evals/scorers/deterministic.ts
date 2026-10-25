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

// Deterministic local scorer (DEC-05 split of scorers.ts).

import { createScorer, type MastraScorer } from '@mastra/core/evals';

/**
 * Deterministic local scorer — no LLM judge. Useful as a gate or for
 * offline tests: scores 1 when `output` satisfies the predicate.
 */
export function createDeterministicScorer(
  id: string,
  description: string,
  predicate: (run: { input?: unknown; output: unknown }) => boolean,
): MastraScorer<string, unknown, unknown, Record<string, unknown>> {
  return createScorer({
    id,
    description,
    type: 'agent',
  })
    .preprocess(async ({ run }) => ({
      passed: predicate({ input: run.input, output: run.output }),
    }))
    .generateScore(({ results }) =>
      results.preprocessStepResult?.passed ? 1 : 0,
    ) as unknown as MastraScorer<string, unknown, unknown, Record<string, unknown>>;
}
