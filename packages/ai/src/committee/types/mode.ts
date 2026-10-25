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
 * Committee analysis modes, specialist roster, step ids, and orchestration
 * policy (Phase 6).
 *
 * The committee is a bounded multi-agent workflow: deterministic packet
 * collection, parallel read-only specialists, verification, then a single
 * synthesizer. Q2 decision (docs/plans/decisions.log.md): exactly two modes
 * exist — `single` (one technical desk) and `full` (the 4-desk committee).
 * Q3 decision: both are strict all-or-nothing.
 */

import { z } from 'zod';

export type MastraAnalysisMode = 'single' | 'full';
export type MastraSpecialistName = 'technical' | 'fundamental' | 'risk' | 'sentiment';

/** Committee step ids extend specialists with the orchestration stages. */
export type CommitteeAgentId = MastraSpecialistName | 'fusion';

export const MastraAnalysisModeSchema = z.enum(['single', 'full']);
export const MastraSpecialistNameSchema = z.enum(['technical', 'fundamental', 'risk', 'sentiment']);

/** Which specialists participate in each mode (single source of truth). */
export const SPECIALISTS_BY_MODE: Record<MastraAnalysisMode, readonly MastraSpecialistName[]> = {
  single: ['technical'],
  full: ['technical', 'fundamental', 'risk', 'sentiment'],
};

/**
 * Committee deadline for synchronous runs (audit plan §1.7). Leaves ~10s of
 * headroom under the chat route's 55s window so a deadline surfaces as an
 * explicit strict failure instead of an opaque route abort.
 *
 * P-05 (audit 2026-10-18): the value is defined in `mastra-v2/shared/constants`
 * and re-exported here for existing importers.
 */
export { COMMITTEE_DEADLINE_MS } from '../../mastra-v2/shared/constants';

/** One logical workflow stage, emitted as progress exactly once per run. */
export type CommitteeStepId =
  MastraSpecialistName | 'collect-packet' | 'critique' | 'debate' | 'verify' | 'fusion';

/** Ordered progress stages for a mode (stable across runs and snapshots). */
export function committeeProgressStages(mode: MastraAnalysisMode): readonly CommitteeStepId[] {
  // Full mode runs one cross-critique round after the specialists (Q6 ON by
  // default); single is a one-desk read with nothing to critique.
  const critique: CommitteeStepId[] = mode === 'full' ? ['critique'] : [];
  return ['collect-packet', ...SPECIALISTS_BY_MODE[mode], ...critique, 'verify', 'fusion'];
}

export interface CommitteeModePolicy {
  readonly mode: MastraAnalysisMode;
  /**
   * Strict modes fail closed (Q3 decision): any specialist failure —
   * including a fusion-verifier failure or a deadline — is terminal and no
   * partial committee answer is returned to the user.
   */
  readonly strict: boolean;
  /** Participating specialists, in stable execution order. */
  readonly specialists: readonly MastraSpecialistName[];
  /** Q3: strict all-or-nothing for every mode; never continue on partial. */
  readonly continueOnPartialFailure: boolean;
}

export const MODE_POLICY: Record<MastraAnalysisMode, CommitteeModePolicy> = {
  single: {
    mode: 'single',
    strict: true,
    specialists: SPECIALISTS_BY_MODE.single,
    continueOnPartialFailure: false,
  },
  full: {
    mode: 'full',
    strict: true,
    specialists: SPECIALISTS_BY_MODE.full,
    continueOnPartialFailure: false,
  },
};

export function committeeModePolicy(mode: MastraAnalysisMode): CommitteeModePolicy {
  return MODE_POLICY[mode];
}

/** Committee failure (specialist, fusion, or deadline): terminal, no partial result. */
export class MastraModeStrictFailureError extends Error {
  readonly code = 'MASTRA_MODE_INCOMPLETE';
  readonly failedAgents: CommitteeAgentId[];

  constructor(failedAgents: CommitteeAgentId[], cause?: unknown, detail?: string) {
    super(
      [
        `Mastra analysis could not complete. Failed agents: ${failedAgents.join(', ')}.`,
        // Q3/§1.7: surfaces the retry guidance the user should see.
        detail ?? 'No partial answer was returned — please retry.',
      ].join(' '),
      { cause },
    );
    this.name = 'MastraModeStrictFailureError';
    this.failedAgents = failedAgents;
  }
}
