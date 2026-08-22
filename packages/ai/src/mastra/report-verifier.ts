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

import { metrics } from '@kestrel/shared';

import {
  addUnsupportedIds,
  availableEvidenceIds,
  verifyNarrativeNumericClaims,
  verifyNumericClaims,
} from './report-grounding';
import { verifyReportSafety } from './report-safety';
import { verifyTemporalDisclosure } from './report-temporal';
import { XauusdResearchReportSchema, type XauusdResearchReport } from './report-types';
import type { XauusdResearchPacket } from './research-types';

export interface XauusdReportVerification {
  ok: boolean;
  report: XauusdResearchReport | null;
  findings: string[];
}

export class XauusdReportVerificationError extends Error {
  readonly findings: readonly string[];

  constructor(findings: readonly string[]) {
    super('XAUUSD report failed deterministic verification');
    this.name = 'XauusdReportVerificationError';
    this.findings = findings;
  }
}

function verificationReason(findings: readonly string[]): string {
  if (findings.some((finding) => /numericClaims|evidence ID/.test(finding))) return 'grounding';
  if (findings.some((finding) => /timestamp|stale|outdated|freshness/.test(finding)))
    return 'temporal';
  if (
    findings.some((finding) =>
      /scenario|confidence|blocked|missing-data|quality|timeframe/.test(finding),
    )
  )
    return 'safety';
  return 'schema';
}

function emitVerificationMetrics(ok: boolean, findings: readonly string[]): void {
  const reason = ok ? 'none' : verificationReason(findings);
  metrics.increment('mastra_report_verification_total', {
    tags: { result: ok ? 'ok' : 'fail', reason },
  });
  if (!ok) {
    metrics.increment('mastra_report_verification_failed_total', { tags: { reason } });
  }
}

/** Validate structure, evidence references, data quality, and scenario safety. */
export function verifyXauusdReport(
  candidate: unknown,
  packet: XauusdResearchPacket,
): XauusdReportVerification {
  const parsed = XauusdResearchReportSchema.safeParse(candidate);
  if (!parsed.success) {
    const findings = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'report'}: ${issue.message}`,
    );
    emitVerificationMetrics(false, findings);
    return { ok: false, report: null, findings };
  }

  const report = parsed.data;
  const findings: string[] = [];
  const available = availableEvidenceIds(packet);
  addUnsupportedIds(report.evidenceIds, available, findings, 'report.evidenceIds');
  report.sources.forEach((source) =>
    addUnsupportedIds([source.evidenceId], available, findings, 'report.sources'),
  );
  report.numericClaims.forEach((claim) =>
    addUnsupportedIds([claim.evidenceId], available, findings, 'report.numericClaims'),
  );
  report.scenarios.forEach((scenario, index) =>
    addUnsupportedIds(
      scenario.evidenceIds,
      available,
      findings,
      `report.scenarios[${index}].evidenceIds`,
    ),
  );

  verifyReportSafety(report, packet, findings);
  verifyNumericClaims(report, packet, findings);
  verifyNarrativeNumericClaims(report, packet, findings);
  verifyTemporalDisclosure(report, packet, findings);

  const ok = findings.length === 0;
  emitVerificationMetrics(ok, findings);
  return { ok, report: ok ? report : null, findings };
}

export function requireVerifiedXauusdReport(
  candidate: unknown,
  packet: XauusdResearchPacket,
): XauusdResearchReport {
  const verification = verifyXauusdReport(candidate, packet);
  if (!verification.ok || !verification.report) {
    throw new XauusdReportVerificationError(verification.findings);
  }
  return verification.report;
}
