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
 * Phase 2 (Jev System One) — semantic disclosure verifier.
 *
 * The deterministic `DISCLOSURE_TERMS` regex accepts any sentence containing a
 * disclosure word — including adversarial negations such as "The packet data
 * is not stale or degraded". This module adds two layers:
 *
 *   1. `hasNegatedDisclosure` — a deterministic negation detector used by
 *      `verifyMastraOpinion` so a negated phrase can never satisfy the
 *      disclosure requirement.
 *   2. `verifySemanticDisclosureWithJev` — one parallel `/v1/systemone` batch
 *      that checks whether a claimed disclosure is honest, whether
 *      forward-looking levels are framed as scenarios, and whether an explicit
 *      invalidation level is present. Honesty is blocking; scenario framing and
 *      invalidation presence are advisory findings (logged, non-blocking).
 *
 * Security: this is one of the designated call sites allowed to send prose to
 * Jev (the model's own sanitized output plus deterministic packet metadata).
 * Routing, packet scoring, and consensus gating never receive prose.
 */

import { metrics } from '@kestrel/shared';

import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import { evaluateJev } from './client';
import type { JevEnv, JevGenerationLedger, JevNoulAnswer, JevSettings } from './types';

/** Per-call budget for the semantic verification batch. */
export const JEV_SEMANTIC_VERIFIER_TIMEOUT_MS = 800;

/** Chars of the candidate text carried into the Jev state. */
const VERIFIER_TEXT_CHARS = 4_000;

/** Words that count as a disclosure of degraded/missing packet context. */
export const DISCLOSURE_TERMS =
  /\b(?:stale|missing|unavailable|incomplete|degraded|partial|outdated|delayed|limited|provisional)\b/i;

const DISCLOSURE_WORDS =
  'stale|missing|unavailable|incomplete|degraded|partial|outdated|delayed|limited|provisional';

/**
 * Negated disclosure chains: `not stale`, `never degraded`, `no missing data`,
 * `without delayed data`, including chained forms like `not stale or degraded`.
 */
export const NEGATED_DISCLOSURE_PATTERN = new RegExp(
  `\\b(?:not|never|no|without)\\s+(?:${DISCLOSURE_WORDS})(?:\\s+(?:or|and|nor)\\s+(?:${DISCLOSURE_WORDS}))*`,
  'i',
);

/**
 * True when the text negates a disclosure term ("data is not stale"). Such a
 * phrase must never satisfy the temporal/disclosure requirement, because it
 * asserts the opposite of the packet's own metadata.
 */
export function hasNegatedDisclosure(text: string): boolean {
  return NEGATED_DISCLOSURE_PATTERN.test(text);
}

/**
 * True when the packet's own metadata demands a disclosure sentence.
 * Defensive against injected/test packets that predate these fields.
 */
export function packetNeedsDisclosure(packet: SymbolResearchPacket): boolean {
  const warnings = Array.isArray(packet.warnings) ? packet.warnings : [];
  const missingData = Array.isArray(packet.missingData) ? packet.missingData : [];
  const dataQuality = (packet as { dataQuality?: string }).dataQuality;
  return (
    warnings.length > 0 ||
    missingData.length > 0 ||
    (dataQuality !== undefined && dataQuality !== 'complete')
  );
}

export interface JevSemanticVerificationOptions {
  settings?: JevSettings | null | undefined;
  env?: JevEnv | null | undefined;
  signal?: AbortSignal | null | undefined;
  fetchImpl?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
  ledger?: JevGenerationLedger | null | undefined;
  ledgerEntryId?: string | undefined;
}

export interface SemanticDisclosureVerification {
  ok: boolean;
  /** Blocking findings (failed honesty) and `advisory:`-prefixed observations. */
  findings: string[];
  /** Raw calibrated probabilities for observability / tests. */
  probabilities: {
    honesty: number;
    scenarioFraming: number;
    invalidationLevel: number;
  };
}

/**
 * Verify the semantic honesty of a disclosure claim in one Jev batch.
 * Returns null when Jev is unconfigured / unreachable — callers then keep the
 * deterministic-only verification path.
 */
export async function verifySemanticDisclosureWithJev(
  text: string,
  packet: SymbolResearchPacket,
  options: JevSemanticVerificationOptions = {},
): Promise<SemanticDisclosureVerification | null> {
  const candidate = text.trim();
  if (!candidate) {
    return {
      ok: false,
      findings: ['candidate text is empty'],
      probabilities: { honesty: 0, scenarioFraming: 0, invalidationLevel: 0 },
    };
  }

  const result = await evaluateJev({
    state: {
      symbol: packet.symbol,
      status: packet.status,
      dataQuality: packet.dataQuality,
      warningCount: Array.isArray(packet.warnings) ? packet.warnings.length : 0,
      missingDataCount: Array.isArray(packet.missingData) ? packet.missingData.length : 0,
      // The model's own sanitized output — a designated prose call site.
      text: candidate.slice(0, VERIFIER_TEXT_CHARS),
    },
    questions: {
      honestly_discloses_degraded_data: {
        type: 'noul',
        instructions:
          'Does the text honestly disclose that the underlying market data is stale, missing, or degraded (matching the packet metadata), rather than denying or downplaying it?',
      },
      uses_scenario_framing: {
        type: 'noul',
        instructions:
          'Does the text frame forward-looking levels as scenario projections rather than as certainties?',
      },
      includes_invalidation_level: {
        type: 'noul',
        instructions:
          'Does the text state an explicit invalidation level or condition that would invalidate the view?',
      },
    },
    ...(options.settings !== undefined ? { settings: options.settings } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    timeoutMs: options.timeoutMs ?? JEV_SEMANTIC_VERIFIER_TIMEOUT_MS,
    ...(options.ledger !== undefined ? { ledger: options.ledger } : {}),
    ledgerEntryId: options.ledgerEntryId ?? 'semantic-disclosure',
  });
  if (!result) return null;

  const honesty = result.answers.honestly_discloses_degraded_data as JevNoulAnswer;
  const scenario = result.answers.uses_scenario_framing as JevNoulAnswer;
  const invalidation = result.answers.includes_invalidation_level as JevNoulAnswer;

  const findings: string[] = [];
  // Honesty is the blocking check — but only when the packet's own metadata
  // says there is something to disclose. Otherwise the question is vacuous
  // for complete packets and must never fail verification.
  if (packetNeedsDisclosure(packet) && !honesty.value) {
    findings.push(
      `text does not honestly disclose stale/missing/degraded packet data (Jev honesty ${honesty.probability.toFixed(2)})`,
    );
  }
  if (!scenario.value) {
    findings.push(
      `advisory: forward-looking levels are not framed as scenario projections (${scenario.probability.toFixed(2)})`,
    );
  }
  if (!invalidation.value) {
    findings.push(
      `advisory: no explicit invalidation level or condition detected (${invalidation.probability.toFixed(2)})`,
    );
  }

  const ok = findings.every((finding) => finding.startsWith('advisory:'));
  metrics.increment('committee_disclosure_verification_total', {
    tags: { result: ok ? 'ok' : 'fail' },
  });
  return {
    ok,
    findings,
    probabilities: {
      honesty: honesty.probability,
      scenarioFraming: scenario.probability,
      invalidationLevel: invalidation.probability,
    },
  };
}
