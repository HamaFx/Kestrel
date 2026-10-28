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

// Agent scorer profiles (DEC-05 split of scorers.ts).

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { MastraScorer, MastraScorers } from '@mastra/core/evals';

import type { ResolveModelEnv } from '@ai/models/env-factory';

import type { ExecutionPlan } from '../../planning/execution-plan';
import { createCitationScorer } from '../custom';
import { buildJevRubricScorers } from './jev-scorers';
import { buildPrebuiltScorers } from './prebuilt';
import type { AgentScorerProfile, BuiltScorers, ScorerSampling } from './types';

function buildCitationScorers(): BuiltScorers {
  try {
    const citation = createCitationScorer();
    return {
      scorers: [citation] as unknown as Array<
        MastraScorer<string, unknown, unknown, Record<string, unknown>>
      >,
      entries: { 'kestrel-citation': { scorer: citation } } as unknown as MastraScorers,
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
      warnings: ['citation scorer failed to build'],
    };
  }
}

function mergeScorers(a: BuiltScorers, b: BuiltScorers): BuiltScorers {
  return {
    scorers: [...a.scorers, ...b.scorers],
    entries: { ...a.entries, ...b.entries },
    judgeModel: a.judgeModel,
    skipped: [...a.skipped, ...b.skipped],
    warnings: [...a.warnings, ...b.warnings],
  };
}

function buildAgentScorers(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  profileName: 'conversation' | 'research',
  samplingOverride?: ScorerSampling,
): BuiltScorers {
  // Phase 2 (Jev System One) — when a Jev endpoint resolves, the fast
  // non-generative rubric scorer runs on 100% of turns at ~$0 and replaces
  // the 5%/10% sampled generative LLM judges. No Jev provider → unchanged
  // sampled prebuilt behavior below.
  const jevScorers = buildJevRubricScorers(profileName, env, settings);
  if (jevScorers) return mergeScorers(jevScorers, buildCitationScorers());

  const profile = AGENT_SCORER_PROFILES[profileName];
  const prebuilt = buildPrebuiltScorers({
    settings,
    env,
    enabled: profile.enabled,
    sampling: samplingOverride ?? profile.sampling,
  });
  // The grounding scorer requires a report + packet input and is therefore
  // not attached to a generic agent run (where Mastra supplies prompt/output
  // only). Attach it explicitly at the report-verification boundary instead.
  return mergeScorers(prebuilt, buildCitationScorers());
}

/**
 * I-04 (audit 2026-10-18) — one implementation for every agent scorer set.
 * The two historic convenience builders differed only in which prebuilt ids
 * and default sampling they picked; the profile table below is now the single
 * source for those differences.
 */
export const AGENT_SCORER_PROFILES = {
  /** Conversation-capable set (faithfulness + answer relevancy + toxicity). */
  conversation: {
    enabled: ['faithfulness', 'answer-relevancy', 'toxicity'],
    sampling: { type: 'ratio', rate: 0.05 },
  },
  /** Research/report set (hallucination + bias + toxicity). */
  research: {
    enabled: ['hallucination', 'bias', 'toxicity'],
    sampling: { type: 'ratio', rate: 0.1 },
  },
} as const satisfies Record<string, AgentScorerProfile>;

/**
 * I-04 — build the scorer set that matches an execution plan: plans that
 * require evidence (research/report routes) get the research profile; every
 * other route gets the conversation profile. Call sites that already hold a
 * plan should use this instead of choosing a profile by hand.
 */
export function buildScorersForExecutionPlan(
  plan: Pick<ExecutionPlan, 'evidencePolicy'>,
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): BuiltScorers {
  return buildAgentScorers(
    settings,
    env,
    plan.evidencePolicy.required ? 'research' : 'conversation',
  );
}

/**
 * Convenience — conversation-capable scorer set at the default 5% sampling,
 * plus the always-on deterministic custom scorers. With a Jev endpoint the
 * Jev rubric replaces the sampled prebuilt judges at 100% coverage.
 */
export function buildConversationScorers(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  sampling: ScorerSampling = AGENT_SCORER_PROFILES.conversation.sampling,
): BuiltScorers {
  return buildAgentScorers(settings, env, 'conversation', sampling);
}

/**
 * Convenience — research/report scorer set at the default 10% sampling, plus
 * the always-on deterministic custom scorers. With a Jev endpoint the Jev
 * rubric replaces the sampled prebuilt judges at 100% coverage.
 */
export function buildResearchScorers(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  sampling: ScorerSampling = AGENT_SCORER_PROFILES.research.sampling,
): BuiltScorers {
  return buildAgentScorers(settings, env, 'research', sampling);
}
