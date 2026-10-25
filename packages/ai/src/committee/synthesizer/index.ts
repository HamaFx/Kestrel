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

// Committee synthesizer barrel (DEC-05 split of synthesizer.ts).
//
// Committee synthesizer (Phase 6 + Audit v3 Phase 4, Owner Decision Q12).
// The fusion/output layer is the only committee component allowed to produce
// the final user-facing answer: it owns writes to the conversation thread and
// is the only layer that may emit a user-visible assistant message.

export { FusionAnswerSchema, renderFusionAnswer, type FusionAnswer } from './fusion-answer';
export { synthesizeCommitteeAnswer } from './synthesis';
export { synthesizeComparisonAnswer } from './comparison';
export type {
  CommitteeComparisonSynthesisArgs,
  CommitteeSynthesisArgs,
  CommitteeSynthesisDeps,
  CommitteeSynthesisResult,
} from './types';
