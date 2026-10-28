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

// Jev sub-barrel: the TypeSafe System One `/v1/systemone` decision-model
// client, its free-first provider resolver, and the calibration formulas.
// Re-exported by `src/index.ts`.

export {
  clamp01,
  computeChoiceConfidence,
  computeNoulConfidence,
  computeScoreConfidence,
  type JevChoiceConfidence,
  type JevNoulConfidence,
  type JevScoreConfidence,
} from '../jev/calibration';
export {
  JEV_ENDPOINTS,
  LIQUID_COST_PER_MTOK_COMPLEX,
  LIQUID_COST_PER_MTOK_SIMPLE,
  LIQUID_MODEL_COMPLEX,
  LIQUID_MODEL_SIMPLE,
  jevCircuitKey,
  resolveJevEndpoint,
} from '../jev/resolve-endpoint';
export {
  DEFAULT_JEV_TIMEOUT_MS,
  estimateJevCostUsd,
  evaluateJev,
  parseJevAnswer,
  type EvaluateJevArgs,
} from '../jev/client';
export type {
  JevAnswer,
  JevAnswerFor,
  JevAnswersOf,
  JevChoiceAnswer,
  JevChoiceQuestion,
  JevEnv,
  JevEvaluationResult,
  JevGenerationLedger,
  JevNoulAnswer,
  JevNoulQuestion,
  JevProviderId,
  JevQuestion,
  JevScoreAnswer,
  JevScoreQuestion,
  JevSettings,
  JevTaskTier,
  JevUsage,
  ResolvedJevEndpoint,
} from '../jev/types';
