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
 * Committee prompts, specialist skill playbooks, goals, and policy fragments
 * (Phase 6 + Audit v3 Phase 4, Owner Decisions Q8, Q9, Q12).
 *
 * Audit plan §2.2: prompts no longer interpolate the serialized packet at
 * build time. Each committee agent receives an *instructions function* that
 * reads the packet (and opinions) from `requestContext`, mirroring the
 * XAUUSD agent's `instructionsForRequest` pattern, and the serialized
 * packet string is computed once per packet object and shared by every
 * specialist and the fusion call in the same run.
 *
 * Barrel for the domain files: specialist, fusion, critique/debate, and
 * comparison prompts.
 */

export { comparisonFusionInstructionsForRequest } from './comparison';
export { critiqueInstructionsForRequest, debateRevisionInstructionsForRequest } from './critique';
export { fusionInstructions, fusionInstructionsForRequest } from './fusion';
export {
  COMMITTEE_HARD_RULES,
  SPECIALIST_DESK_TOOL_NAMES,
  SPECIALIST_FOCUS,
  SPECIALIST_GOALS,
  SPECIALIST_SKILL_PLAYBOOKS,
  specialistInstructions,
  specialistInstructionsForRequest,
} from './specialist';
