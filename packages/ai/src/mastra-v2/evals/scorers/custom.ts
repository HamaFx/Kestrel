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

// Deterministic Kestrel scorers (DEC-05 split of scorers.ts).

import type { MastraScorer, MastraScorers } from '@mastra/core/evals';

import { createCitationScorer, createGroundingScorer } from '../custom';
import type { BuiltScorers } from './types';

/**
 * Build the deterministic custom scorers (grounding + citation). These
 * have no LLM judge, so no sampling ratio — they run on every turn.
 * Returns an empty entries map when the scorers cannot be constructed.
 */
export function buildCustomScorers(): BuiltScorers {
  try {
    const grounding = createGroundingScorer();
    const citation = createCitationScorer();
    return {
      scorers: [grounding, citation] as unknown as Array<
        MastraScorer<string, unknown, unknown, Record<string, unknown>>
      >,
      entries: {
        'kestrel-grounding': { scorer: grounding },
        'kestrel-citation': { scorer: citation },
      } as unknown as MastraScorers,
      judgeModel: null,
      skipped: [],
      warnings: [],
    };
  } catch {
    return {
      scorers: [],
      entries: {},
      judgeModel: null,
      skipped: [],
      warnings: ['custom scorers failed to build'],
    };
  }
}
