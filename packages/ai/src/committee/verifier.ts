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
 * Committee opinion verifier (Phase 6 + Audit v3 Phase 4 + P1-01 audit
 * 2026-10-18). Moved out of the workflow file so verification is a reusable,
 * testable committee stage shared by every mode. P1-01 adds the
 * temporal/degraded disclosure check: an opinion over a packet with warnings,
 * missing data, or non-complete quality must say so.
 */

import { metrics } from '@kestrel/shared';

import { hasNegatedDisclosure, packetNeedsDisclosure } from '../jev/semantic-verifier';
import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import {
  isSupportedByEvidence,
  packetEvidenceValues,
  ungroundedNarrativeNumbers,
} from './grounding';
import type { MastraModeOpinion } from './types';

export interface OpinionVerification {
  ok: boolean;
  findings: string[];
}

/** Audit plan §5.2 — surface rejected opinions in the admin dashboards. */
function emitVerificationMetrics(ok: boolean, findings: readonly string[]): void {
  metrics.increment('committee_opinion_verification_total', {
    tags: { result: ok ? 'ok' : 'fail' },
  });
  if (!ok) {
    metrics.increment('committee_grounding_rejected_total', {
      tags: {
        reason: findings.some((f) => /unsupported numeric value|not allowed when packet/.test(f))
          ? 'grounding'
          : 'invalid',
      },
    });
  }
}

/**
 * Deterministic checks for committee opinions. Checks identity, confidence,
 * narrative numbers, and structured `rawData.keyLevels` (P1-5) against the
 * union of packet evidence and the specialist's own tool outputs (Q8).
 */
export function verifyMastraOpinion(
  opinion: MastraModeOpinion,
  packet: SymbolResearchPacket,
): OpinionVerification {
  const findings: string[] = [];
  if (!opinion.agentName) findings.push('missing specialist identity');
  if (!Number.isFinite(opinion.confidence) || opinion.confidence < 0 || opinion.confidence > 1) {
    findings.push('confidence must be between 0 and 1');
  }
  if (!opinion.reasoning.trim()) findings.push('reasoning is empty');
  if (opinion.rawData && typeof opinion.rawData !== 'object')
    findings.push('rawData must be an object');

  // Numeric assertions must be accompanied by packet context. We do not
  // reject numbers in generic prose when the packet itself contains numeric
  // evidence; we do reject numeric prose for an empty packet.
  if (/\d/.test(opinion.reasoning) && packet.status !== 'ready') {
    findings.push('numeric reasoning is not allowed when packet data is unavailable');
  }
  if (packet.status === 'ready') {
    const evidenceValues = packetEvidenceValues(packet, [opinion]);
    for (const value of ungroundedNarrativeNumbers(opinion.reasoning, evidenceValues)) {
      findings.push(
        `reasoning cites unsupported numeric value ${value} not found in packet evidence`,
      );
    }
    // Audit v3 P1-5: verify support/resistance keyLevels in rawData so
    // ungrounded levels cannot bypass specialist verification and poison fusion.
    const keyLevels = opinion.rawData?.keyLevels;
    if (Array.isArray(keyLevels) && evidenceValues.length > 0) {
      for (const item of keyLevels) {
        if (!item || typeof item !== 'object') continue;
        const level = item as { price?: unknown; kind?: unknown };
        if (typeof level.price !== 'number' || !Number.isFinite(level.price)) continue;
        // Forward-looking trigger/invalidation projections are exempt like narrative scenario terms;
        // observed support/resistance levels must match packet or tool evidence.
        if (level.kind === 'trigger' || level.kind === 'invalidation') continue;
        if (!isSupportedByEvidence(level.price, evidenceValues)) {
          findings.push(
            `keyLevels cites unsupported numeric value ${level.price} not found in packet evidence`,
          );
        }
      }
    }
  }
  if (packet.symbol.length === 0) findings.push('packet symbol is missing');

  // P1-01 (audit 2026-10-18) — temporal/degraded disclosure. When the packet
  // carries warnings, missing data, or a non-complete quality, the opinion
  // must say so (reasoning disclosure or an explicit missingEvidence list);
  // otherwise fusion can present a degraded read as complete.
  //
  // Phase 2 (Jev) — a NEGATED disclosure ("the data is not stale") asserts the
  // opposite of the packet metadata and must never satisfy the requirement;
  // the naive DISCLOSURE_TERMS regex previously accepted it.
  if (packet.status === 'ready' && packetNeedsDisclosure(packet)) {
    const reason = opinion.reasoning;
    const missingEvidence = opinion.rawData?.missingEvidence;
    const disclosedInReasoning = DISCLOSURE_TERMS.test(reason) && !hasNegatedDisclosure(reason);
    const disclosedInRawData = Array.isArray(missingEvidence) && missingEvidence.length > 0;
    if (!disclosedInReasoning && !disclosedInRawData) {
      findings.push(
        'packet data is stale, missing, or degraded but the opinion does not disclose it',
      );
    }
  }

  emitVerificationMetrics(findings.length === 0, findings);
  return { ok: findings.length === 0, findings };
}

/** Words that count as a disclosure of degraded/missing packet context. */
const DISCLOSURE_TERMS =
  /\b(?:stale|missing|unavailable|incomplete|degraded|partial|outdated|delayed|limited|provisional)\b/i;
