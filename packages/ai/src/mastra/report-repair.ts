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

import { XauusdResearchReportSchema, type XauusdResearchReport } from './report-types';
import { verifyXauusdReport } from './report-verifier';
import type { XauusdResearchPacket } from './research-types';

const TIMEFRAME_CONFLICT_FINDING =
  'The report did not disclose a conflict between timeframe trend signals.';

/**
 * Add only a deterministic disclosure when the verifier has already proved
 * that timeframe signals conflict. No prices, levels, or trading conclusions
 * are generated here.
 */
export function patchTimeframeConflictDisclosure(
  candidate: unknown,
  packet: XauusdResearchPacket,
  findings: readonly string[],
): XauusdResearchReport | null {
  if (findings.length !== 1 || findings[0] !== TIMEFRAME_CONFLICT_FINDING) return null;

  const parsed = XauusdResearchReportSchema.safeParse(candidate);
  if (!parsed.success) return null;

  const patched = {
    ...parsed.data,
    contradictions: [
      ...parsed.data.contradictions,
      'Timeframe trend signals are mixed; higher and lower timeframes do not fully agree.',
    ],
  };
  const verification = verifyXauusdReport(patched, packet);
  return verification.ok ? verification.report : null;
}
