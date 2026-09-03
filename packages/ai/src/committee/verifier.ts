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
 * Committee opinion verifier (Phase 6). Moved out of the workflow file so
 * verification is a reusable, testable committee stage shared by every mode.
 */

import type { SymbolResearchPacket } from '../mastra/symbol-research';
import type { MastraModeOpinion } from './types';

export interface OpinionVerification {
  ok: boolean;
  findings: string[];
}

/**
 * Lightweight deterministic checks for committee opinions. This intentionally
 * does not attempt to judge prose quality; it catches identity, confidence,
 * and unsupported numeric claims before synthesis.
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
  if (packet.symbol.length === 0) findings.push('packet symbol is missing');

  return { ok: findings.length === 0, findings };
}
