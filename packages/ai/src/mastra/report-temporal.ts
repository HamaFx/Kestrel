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

import type { XauusdResearchReport } from './report-types';
import type { XauusdResearchPacket } from './research-types';

export function verifyTemporalDisclosure(
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  findings: string[],
): void {
  const reportTime = Date.parse(report.asOf);
  const packetTime = Date.parse(packet.generatedAt);
  if (reportTime > packetTime + 5_000) {
    findings.push(
      'The report timestamp is later than the research packet by more than five seconds.',
    );
  }

  const hasStaleEvidence = packet.warnings.some((warning) => /\bstale\b/i.test(warning));
  if (hasStaleEvidence) {
    const disclosure = [...report.missingData, ...report.contradictions].some((text) =>
      /\bstale\b|outdated|freshness/i.test(text),
    );
    if (!disclosure) findings.push('The report did not disclose stale or outdated evidence.');
  }
}
