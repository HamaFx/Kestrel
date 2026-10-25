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
 * Committee workflow shared types and mode policy (Phase 6).
 *
 * The committee is a bounded multi-agent workflow: deterministic packet
 * collection, parallel read-only specialists, verification, then a single
 * synthesizer. Agents communicate only through these typed step outputs.
 * Q2 decision (docs/plans/decisions.log.md): exactly two modes exist —
 * `single` (one technical desk) and `full` (the 4-desk committee). Q3
 * decision: both are strict all-or-nothing.
 *
 * Barrel for the domain files: mode policy, opinion shapes, packet collection,
 * and request context.
 */

export {
  CollectPacketOutputSchema,
  type CollectComparisonPacketsFn,
  type CollectPacketFn,
  type CollectPacketOutput,
} from './collection';
export {
  REQUEST_CONTEXT_SCHEMA,
  contextWithPacket,
  contextWithPackets,
  readOnlyMemoryOptions,
  type ModeRequestContext,
} from './context';
export {
  COMMITTEE_DEADLINE_MS,
  MODE_POLICY,
  MastraAnalysisModeSchema,
  MastraModeStrictFailureError,
  MastraSpecialistNameSchema,
  SPECIALISTS_BY_MODE,
  committeeModePolicy,
  committeeProgressStages,
  type CommitteeAgentId,
  type CommitteeModePolicy,
  type CommitteeStepId,
  type MastraAnalysisMode,
  type MastraSpecialistName,
} from './mode';
export {
  CommitteeCritiqueSchema,
  CritiqueSchema,
  MastraModeOpinionSchema,
  OpinionSchema,
  StatsSchema,
  committeeModelMetadata,
  zeroStats,
  type CommitteeCritique,
  type CommitteeModelMetadata,
  type MastraModeOpinion,
} from './opinion';
