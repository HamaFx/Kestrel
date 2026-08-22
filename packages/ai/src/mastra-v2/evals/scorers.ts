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
 * Phase 6 evals — prebuilt LLM-as-judge scorers.
 *
 * Wraps the `@mastra/evals` prebuilt scorers (faithfulness, hallucination,
 * answer-relevancy, bias, toxicity) so they can be attached to chat agents
 * with a sampling ratio. The judge model is the user's BYOK fast tier
 * (resolved via `resolveChatModel(..., 'technical')`), exactly like the
 * Phase 5 guardrail detector — no new provider surface.
 *
 * Sampling keeps live scoring cheap: the agent runs every turn, but only a
 * configured ratio of turns actually invoke the LLM judge. Scores land in
 * the Mastra `scores` storage domain automatically when the scorer runs
 * against an agent attached to the shared instance.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { createScorer, type MastraScorer, type MastraScorers } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
  createAnswerRelevancyScorer,
  createBiasScorer,
  createFaithfulnessScorer,
  createHallucinationScorer,
  createToxicityScorer,
} from '@mastra/evals/scorers/prebuilt';
import type { LanguageModel } from 'ai';

import { resolveChatModel } from '../../model';
import type { ResolveModelEnv } from '../../vertex-factory';
import { createCitationScorer, createGroundingScorer } from './custom';

const slog = createCategorizedLogger('ai', { component: 'mastra-evals-scorers' });

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
 * Resolve the BYOK fast-tier model used as the LLM judge for all scorers.
 * Returns `null` when no model can be resolved (scorers then degrade to
 * skipped with a logged warning — never a thrown error in the hot path).
 */
export function resolveJudgeModel(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): { model: LanguageModel; warnings: string[] } | { model: null; warnings: string[] } {
  const warnings: string[] = [];
  try {
    const resolution = resolveChatModel(settings, env, 'technical');
    return { model: resolution.model as LanguageModel, warnings };
  } catch (error) {
    slog.warn('Eval scorer judge model unavailable; live scoring disabled', {
      error: error instanceof Error ? error.message : String(error),
    });
    warnings.push('Eval scorer judge model unavailable; live scoring disabled');
    return { model: null, warnings };
  }
}

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

/** Merge two BuiltScorers into one (entries from b override a on key conflict). */
function mergeScorers(a: BuiltScorers, b: BuiltScorers): BuiltScorers {
  return {
    scorers: [...a.scorers, ...b.scorers],
    entries: { ...a.entries, ...b.entries },
    judgeModel: a.judgeModel,
    skipped: [...a.skipped, ...b.skipped],
    warnings: [...a.warnings, ...b.warnings],
  };
}

/**
 * Convenience — conversation-capable scorer set (faithfulness + answer
 * relevancy + toxicity) at the default 5% sampling, plus the always-on
 * deterministic custom scorers (grounding + citation).
 */
export function buildConversationScorers(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  sampling: ScorerSampling = { type: 'ratio', rate: 0.05 },
): BuiltScorers {
  const prebuilt = buildPrebuiltScorers({
    settings,
    env,
    enabled: ['faithfulness', 'answer-relevancy', 'toxicity'],
    sampling,
  });
  return mergeScorers(prebuilt, buildCustomScorers());
}

/**
 * Convenience — research/report scorer set (hallucination + bias + toxicity)
 * at the default 10% sampling, plus the always-on deterministic custom
 * scorers (grounding + citation).
 */
export function buildResearchScorers(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  sampling: ScorerSampling = { type: 'ratio', rate: 0.1 },
): BuiltScorers {
  const prebuilt = buildPrebuiltScorers({
    settings,
    env,
    enabled: ['hallucination', 'bias', 'toxicity'],
    sampling,
  });
  return mergeScorers(prebuilt, buildCustomScorers());
}

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
