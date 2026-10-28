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
 * Phase 6 evals barrel (DEC-05 split of scorers.ts) — prebuilt
 * LLM-as-judge scorers.
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
 *
 *   - types.ts         — scorer ids, sampling, options, result contracts
 *   - judge.ts         — BYOK judge-model resolution
 *   - prebuilt.ts      — `@mastra/evals` prebuilt registry + builder
 *   - custom.ts        — deterministic grounding/citation scorers
 *   - profiles.ts      — per-agent profiles (conversation / research)
 *   - deterministic.ts — local predicate scorer (gates, offline tests)
 */

export {
  type AgentScorerProfile,
  type BuildScorersOptions,
  type BuiltScorers,
  type ScorerId,
  type ScorerSampling,
} from './types';
export { resolveJudgeModel } from './judge';
export { buildPrebuiltScorers, PREBUILT_SCORER_IDS } from './prebuilt';
export { buildCustomScorers } from './custom';
export {
  AGENT_SCORER_PROFILES,
  buildConversationScorers,
  buildResearchScorers,
  buildScorersForExecutionPlan,
} from './profiles';
export {
  JEV_RUBRIC_SCORER_ID,
  buildJevRubricScorers,
  createJevRubricScorer,
  evaluateJevRubricScores,
  type JevRubricScores,
} from './jev-scorers';
export { createDeterministicScorer } from './deterministic';
