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
 * Committee fusion verifier (audit plan §1.4, P0-1). Specialists are
 * verified per-opinion, but the free-form fusion answer previously reached
 * the user unverified and could hallucinate prices/levels that appear in
 * neither the packet nor any specialist opinion. This verifier mirrors the
 * XAUUSD report grounding discipline: every numeric value in the fusion
 * text must be supported by packet evidence, a verified specialist opinion,
 * structural notation, or scenario-projection wording.
 *
 * Q3 decision: a failed verification is terminal after one bounded repair —
 * never a degraded partial answer.
 */

import { metrics } from '@kestrel/shared';

import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import { packetEvidenceValues, ungroundedNarrativeNumbers } from './grounding';

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

/**
 * Deterministically verify the free-form fusion answer against packet evidence.
 * Specialist opinions are verified individually before fusion, so they are not
 * a second source of grounded numbers here.
 */
export function verifyFusionAnswer(text: string, packet: SymbolResearchPacket): FusionVerification {
  const findings: string[] = [];

  if (!text || !text.trim()) {
    findings.push('fusion answer is empty');
    emitVerificationMetrics(false, findings);
    return { ok: false, findings };
  }

  // A blocked/degraded packet has no numeric evidence to ground against;
  // numeric answers over missing data are rejected (mirrors verifyMastraOpinion).
  if (packet.status !== 'ready') {
    if (/\d/.test(text)) {
      findings.push('numeric claims are not allowed when packet data is unavailable');
    }
    emitVerificationMetrics(findings.length === 0, findings);
    return { ok: findings.length === 0, findings };
  }

  // Specialist numbers are not trusted by proxy: each opinion is grounded
  // against the same packet evidence (verifyMastraOpinion), and the fusion
  // answer is grounded against that evidence directly.
  for (const value of ungroundedNarrativeNumbers(text, packetEvidenceValues(packet))) {
    findings.push(
      `fusion answer contains unsupported numeric value ${value}; it must come from the packet or be labeled as a scenario projection`,
    );
  }

  emitVerificationMetrics(findings.length === 0, findings);
  return { ok: findings.length === 0, findings };
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
