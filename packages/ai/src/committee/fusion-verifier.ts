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
 * Committee fusion verifier (audit plan §1.4, P0-1 + Audit v3 Phase 4 Q8).
 * Every numeric value in the fusion text must be supported by packet evidence,
 * verified specialist tool outputs, structural notation, or scenario-projection
 * wording.
 *
 * Q3 decision: a failed verification is terminal after one bounded repair —
 * never a degraded partial answer.
 */

import { metrics } from '@kestrel/shared';

import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import { packetEvidenceValues, ungroundedNarrativeNumbers } from './grounding';
import type { MastraModeOpinion } from './types';

export interface FusionVerification {
  ok: boolean;
  findings: string[];
}

function emitVerificationMetrics(ok: boolean, findings: readonly string[]): void {
  metrics.increment('committee_fusion_verification_total', {
    tags: { result: ok ? 'ok' : 'fail' },
  });
  if (!ok) {
    metrics.increment('committee_fusion_verification_failed_total', {
      tags: { reason: findings.some((f) => /empty/.test(f)) ? 'empty' : 'grounding' },
    });
  }
}

interface VerifyPacketsGroundedOptions {
  /** Finding used when a comparison supplied no packets. */
  emptyPacketsFinding?: string;
  /** Wording for the evidence source in unsupported-number findings. */
  sourceLabel?: 'packet' | 'packets';
}

/**
 * Deterministically verify a fusion answer against the union of one or more
 * packets' evidence and the specialists' verified tool evidence (Q8). Single
 * and comparison fusion differ only in wording and the empty-set finding.
 */
function verifyPacketsGroundedText(
  text: string,
  packets: readonly SymbolResearchPacket[],
  opinions?: readonly Pick<MastraModeOpinion, 'rawData'>[],
  options: VerifyPacketsGroundedOptions = {},
): FusionVerification {
  const findings: string[] = [];

  if (!text || !text.trim()) {
    findings.push('fusion answer is empty');
    emitVerificationMetrics(false, findings);
    return { ok: false, findings };
  }

  if (packets.length === 0) {
    findings.push(options.emptyPacketsFinding ?? 'fusion has no packets to verify against');
    emitVerificationMetrics(false, findings);
    return { ok: false, findings };
  }

  // Only when every packet is unavailable are numeric claims categorically
  // rejected (mirrors the single-packet blocked path).
  const allBlocked = packets.every((packet) => packet.status !== 'ready');
  if (allBlocked) {
    if (/\d/.test(text)) {
      findings.push('numeric claims are not allowed when packet data is unavailable');
    }
    emitVerificationMetrics(findings.length === 0, findings);
    return { ok: findings.length === 0, findings };
  }

  const evidenceValues = packets.flatMap((packet) => packetEvidenceValues(packet, opinions));
  for (const value of ungroundedNarrativeNumbers(text, evidenceValues)) {
    findings.push(
      `fusion answer contains unsupported numeric value ${value}; it must come from the ${options.sourceLabel ?? 'packet'} or be labeled as a scenario projection`,
    );
  }

  emitVerificationMetrics(findings.length === 0, findings);
  return { ok: findings.length === 0, findings };
}

/** Verify a single-symbol fusion answer against its packet. */
export function verifyFusionAnswer(
  text: string,
  packet: SymbolResearchPacket,
  opinions?: readonly Pick<MastraModeOpinion, 'rawData'>[],
): FusionVerification {
  return verifyPacketsGroundedText(text, [packet], opinions);
}

/** Verify a cross-symbol fusion answer against the union of its packets. */
export function verifyComparisonFusionAnswer(
  text: string,
  packets: readonly SymbolResearchPacket[],
  opinions?: readonly Pick<MastraModeOpinion, 'rawData'>[],
): FusionVerification {
  return verifyPacketsGroundedText(text, packets, opinions, {
    emptyPacketsFinding: 'comparison fusion has no packets to verify against',
    sourceLabel: 'packets',
  });
}

/**
 * Repair prompt for the single bounded fusion regeneration (audit plan
 * §1.4). Mirrors `repairPrompt` from the XAUUSD report path.
 */
export function fusionRepairPrompt(prompt: string, findings: readonly string[]): string {
  return [
    prompt,
    '',
    'The previous committee synthesis failed deterministic verification.',
    'Return a corrected answer using only the trusted packet and the specialist opinions.',
    'Do not remove evidence, disclosure, or scenario language to bypass verification.',
    `Verification findings to fix:\n${findings.map((finding) => `- ${finding}`).join('\n')}`,
  ].join('\n');
}
