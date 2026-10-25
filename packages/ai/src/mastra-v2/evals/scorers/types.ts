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

// Scorer contracts for the prebuilt LLM-as-judge set (DEC-05 split of
// scorers.ts).

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { MastraScorer, MastraScorers } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';

import type { ResolveModelEnv } from '@ai/models/env-factory';

export type ScorerId = 'faithfulness' | 'hallucination' | 'answer-relevancy' | 'bias' | 'toxicity';

export type ScorerSampling = { type: 'none' } | { type: 'ratio'; rate: number };

export interface BuildScorersOptions {
  /** User settings for BYOK judge-model resolution. */
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  env: ResolveModelEnv;
  /** Which prebuilt scorers to enable. Defaults to all five. */
  enabled?: readonly ScorerId[];
  /** Sampling applied to every enabled scorer. Default: 5% ratio. */
  sampling?: ScorerSampling;
}

export interface BuiltScorers {
  /** Mastra scorer instances (for `createScorer`-style direct use / runEvals). */
  scorers: Array<MastraScorer<string, unknown, unknown, Record<string, unknown>>>;
  /** Instance-ready entry map keyed by scorer id, ready for the agent
   *  `scorers` option or a registered Mastra instance. */
  entries: MastraScorers;
  /** Judge model resolved (null when no BYOK model was available). */
  judgeModel: MastraModelConfig | null;
  /** Scorers skipped because no judge model could be resolved. */
  skipped: ScorerId[];
  warnings: string[];
}

export interface AgentScorerProfile {
  readonly enabled: readonly ScorerId[];
  readonly sampling: ScorerSampling;
}
