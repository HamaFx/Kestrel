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
 * Phase 2 (Jev System One) — adaptive committee consensus & debate gate.
 *
 * After Wave 1 (the four specialist desks), the full-mode Critique and Debate
 * rounds cost 4–8 additional LLM calls. When every desk independently agrees,
 * those waves add little; when any two desks conflict, they are essential.
 *
 * Decision order:
 *   1. Deterministic pre-check (zero-cost, NO network call):
 *      a) both `bullish` and `bearish` biases present → deliberate;
 *      b) max−min desk confidence spread > 0.35 → deliberate;
 *      c) fewer than the four required desks succeeded → deliberate.
 *   2. One parallel Jev batch asking for material contradiction, whether a
 *      second debate round would help, and consensus strength.
 *   3. Skip BOTH waves only when contradiction < 0.30, consensus strength
 *      >= 0.75, AND Jev does not ask for a debate round (< 0.50).
 *
 * Any Jev failure (no provider, timeout, malformed batch) returns "run both":
 * the gate can only save spend, never weaken deliberation by accident.
 *
 * Security: the desk summaries are quoted model prose about the trusted
 * packet; they are sanitized and truncated here, and the reply can only skip
 * LLM waves — it can never cause writes, alerts, or blocks.
 */

import { metrics } from '@kestrel/shared';

import { evaluateJev } from '../jev/client';
import type { JevEnv, JevGenerationLedger, JevSettings } from '../jev/types';
import { sanitizeExternalText } from '../mastra-v2/packets/external-content';
import type { MastraModeOpinion, MastraSpecialistName } from './types';

/** Per-call budget for the gate evaluation. */
export const JEV_CONSENSUS_GATE_TIMEOUT_MS = 800;

/** All four required desks must have completed Wave 1 to ever skip. */
export const REQUIRED_DELIBERATION_DESKS: readonly MastraSpecialistName[] = [
  'technical',
  'fundamental',
  'risk',
  'sentiment',
];

/** Skip threshold: Jev material-contradiction probability must be below this. */
export const JEV_CONTRADICTION_SKIP_MAX = 0.3;

/** Skip threshold: consensus strength score must be at least this. */
export const JEV_CONSENSUS_STRENGTH_MIN = 0.75;

/** Skip threshold: a requested debate round (>= this) always runs Debate. */
export const JEV_DEBATE_REQUEST_RUN_MIN = 0.5;

/** Deterministic pre-check: confidence spread that always triggers critique. */
export const JEV_CONFIDENCE_SPREAD_RUN_MIN = 0.35;

/** Chars of each desk reasoning quoted into the Jev state. */
const OPINION_SUMMARY_CHARS = 300;

export interface ConsensusGateOptions {
  /** Whether the Critique wave is enabled for this run (mode/flag policy). */
  critiqueEnabled?: boolean | undefined;
  /** Whether the Debate wave is enabled for this run. */
  debateEnabled?: boolean | undefined;
  settings?: JevSettings | null | undefined;
  env?: JevEnv | null | undefined;
  signal?: AbortSignal | null | undefined;
  fetchImpl?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
  ledger?: JevGenerationLedger | null | undefined;
  ledgerEntryId?: string | undefined;
}

export interface CommitteeDeliberationDecision {
  shouldCritique: boolean;
  shouldDebate: boolean;
  /** Machine-readable reason — also used as the skip metric tag. */
  reason: string;
}

/**
 * Decide whether the Critique and Debate waves should run for this set of
 * Wave-1 opinions. Never throws; degrades to "run both" on any failure.
 */
export async function shouldRunCommitteeDeliberation(
  opinions: readonly MastraModeOpinion[],
  options: ConsensusGateOptions = {},
): Promise<CommitteeDeliberationDecision> {
  const critiqueEnabled = options.critiqueEnabled ?? true;
  const debateEnabled = options.debateEnabled ?? true;
  const runBoth = (reason: string): CommitteeDeliberationDecision => {
    metrics.increment('committee_consensus_gate_total', {
      tags: { decision: 'run', reason },
    });
    return { shouldCritique: critiqueEnabled, shouldDebate: debateEnabled, reason };
  };

  // 1a. Deterministic directional conflict — a bullish and a bearish desk can
  // never be "high consensus", whatever the confidence numbers say.
  if (opinions.some((o) => o.bias === 'bullish') && opinions.some((o) => o.bias === 'bearish')) {
    return runBoth('deterministic-bias-conflict');
  }

  // 1b. Deterministic confidence spread — desks disagreeing by more than 0.35
  // of confidence warrant the Critique round.
  if (opinions.length > 0) {
    const confidences = opinions.map((o) => o.confidence);
    const spread = Math.max(...confidences) - Math.min(...confidences);
    if (spread > JEV_CONFIDENCE_SPREAD_RUN_MIN) {
      return runBoth('deterministic-confidence-spread');
    }
  }

  // 1c. The early exit requires a complete Wave 1: all four desks succeeded.
  const desks = new Set(opinions.map((o) => o.agentName));
  const wave1Complete =
    opinions.length === REQUIRED_DELIBERATION_DESKS.length &&
    REQUIRED_DELIBERATION_DESKS.every((desk) => desks.has(desk));
  if (!wave1Complete) return runBoth('incomplete-wave1');

  const result = await evaluateJev({
    state: JSON.stringify({
      opinions: opinions.map((opinion) => ({
        desk: opinion.agentName,
        bias: opinion.bias,
        confidence: opinion.confidence,
        summary: sanitizeExternalText(opinion.reasoning, OPINION_SUMMARY_CHARS),
      })),
    }),
    // Contradiction detection across desks is judgement, not classification —
    // complex tier (d1-ultra).
    tier: 'complex',
    questions: {
      has_material_contradiction: {
        type: 'noul',
        instructions:
          'Do the specialist desks rely on mutually incompatible invalidation levels or contradictory premises?',
      },
      needs_debate_round: {
        type: 'noul',
        instructions:
          'Would a second debate round materially resolve a risk or structural conflict between desks?',
      },
      consensus_strength: {
        type: 'score',
        instructions: 'How unified are the desks on the directional read and its invalidation?',
        criteria: ['Weak/Fragmented', 'Moderate', 'Strong Unified Consensus'],
      },
    },
    ...(options.settings !== undefined ? { settings: options.settings } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    timeoutMs: options.timeoutMs ?? JEV_CONSENSUS_GATE_TIMEOUT_MS,
    ...(options.ledger !== undefined ? { ledger: options.ledger } : {}),
    ledgerEntryId: options.ledgerEntryId ?? 'consensus-gate',
  });
  // No provider / timeout / malformed batch: keep the previous always-run
  // behavior rather than risk skipping deliberation on missing evidence.
  if (!result) return runBoth('jev-unavailable');

  const contradiction = result.answers.has_material_contradiction.probability;
  const needsDebate = result.answers.needs_debate_round.probability;
  const consensusStrength = result.answers.consensus_strength.score;

  if (
    contradiction < JEV_CONTRADICTION_SKIP_MAX &&
    consensusStrength >= JEV_CONSENSUS_STRENGTH_MIN &&
    needsDebate < JEV_DEBATE_REQUEST_RUN_MIN
  ) {
    metrics.increment('committee_consensus_gate_total', {
      tags: { decision: 'skip', reason: 'jev-high-consensus-early-exit' },
    });
    return {
      shouldCritique: false,
      shouldDebate: false,
      reason: 'jev-high-consensus-early-exit',
    };
  }

  return runBoth('jev-deliberation-required');
}
