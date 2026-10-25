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

// Prebuilt `@mastra/evals` scorer factories (DEC-05 split of scorers.ts).

import type { MastraScorer, MastraScorers } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
  createAnswerRelevancyScorer,
  createBiasScorer,
  createFaithfulnessScorer,
  createHallucinationScorer,
  createToxicityScorer,
} from '@mastra/evals/scorers/prebuilt';

import { resolveJudgeModel } from './judge';
import { slog } from './log';
import type { BuildScorersOptions, BuiltScorers, ScorerId } from './types';

const PREBUILT: Record<
  ScorerId,
  (model: MastraModelConfig) => MastraScorer<string, unknown, unknown, Record<string, unknown>>
> = {
  faithfulness: (model) =>
    createFaithfulnessScorer({ model }) as unknown as MastraScorer<
      string,
      unknown,
      unknown,
      Record<string, unknown>
    >,
  hallucination: (model) =>
    createHallucinationScorer({ model }) as unknown as MastraScorer<
      string,
      unknown,
      unknown,
      Record<string, unknown>
    >,
  'answer-relevancy': (model) =>
    createAnswerRelevancyScorer({ model }) as unknown as MastraScorer<
      string,
      unknown,
      unknown,
      Record<string, unknown>
    >,
  bias: (model) =>
    createBiasScorer({ model }) as unknown as MastraScorer<
      string,
      unknown,
      unknown,
      Record<string, unknown>
    >,
  toxicity: (model) =>
    createToxicityScorer({ model }) as unknown as MastraScorer<
      string,
      unknown,
      unknown,
      Record<string, unknown>
    >,
};

export const PREBUILT_SCORER_IDS: readonly ScorerId[] = [
  'faithfulness',
  'hallucination',
  'answer-relevancy',
  'bias',
  'toxicity',
];

/**
 * Build the prebuilt scorer set for a chat agent. Each scorer runs on a
 * sampled subset of turns; scores persist to the `scores` storage domain.
 *
 * When the judge model cannot be resolved (no BYOK key, misconfigured env),
 * the returned `entries` is empty and `warnings` explains why — the caller
 * should still attach agents normally, just without live scoring.
 */
export function buildPrebuiltScorers(options: BuildScorersOptions): BuiltScorers {
  const { model, warnings } = resolveJudgeModel(options.settings, options.env);
  const enabled = options.enabled ?? PREBUILT_SCORER_IDS;
  const sampling =
    options.sampling && options.sampling.type === 'ratio'
      ? { type: 'ratio' as const, rate: options.sampling.rate }
      : null;

  if (!model) {
    return { scorers: [], entries: {}, judgeModel: null, skipped: [...enabled], warnings };
  }

  const scorers: Array<MastraScorer<string, unknown, unknown, Record<string, unknown>>> = [];
  const entries: MastraScorers = {};
  const skipped: ScorerId[] = [];

  for (const id of enabled) {
    const factory = PREBUILT[id];
    if (!factory) {
      slog.warn('Unknown prebuilt scorer id', { id });
      skipped.push(id);
      continue;
    }
    const scorer = factory(model as never);
    scorers.push(scorer);
    entries[id] = {
      scorer,
      ...(sampling ? { sampling } : {}),
    };
  }

  return { scorers, entries, judgeModel: model as unknown as MastraModelConfig, skipped, warnings };
}
