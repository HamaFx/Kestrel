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

import { verifyXauusdReport } from './report-verifier';
import type { XauusdResearchPacket } from './research-types';

export interface XauusdReportEvaluationCase {
  id: string;
  packet: XauusdResearchPacket;
  candidate: unknown;
  expectedValid: boolean;
}

export interface XauusdReportEvaluation {
  id: string;
  expectedValid: boolean;
  actualValid: boolean;
  passed: boolean;
  findings: string[];
}

export interface XauusdReportEvaluationSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

/** Run deterministic report-contract cases without calling a model or provider. */
export function evaluateXauusdReportCase(
  testCase: XauusdReportEvaluationCase,
): XauusdReportEvaluation {
  const verification = verifyXauusdReport(testCase.candidate, testCase.packet);
  const actualValid = verification.ok;
  const passed = actualValid === testCase.expectedValid;

  metrics.increment('eval_case_total', {
    tags: {
      suite: 'mastra_xauusd_report',
      result: passed ? 'ok' : 'fail',
    },
  });

  return {
    id: testCase.id,
    expectedValid: testCase.expectedValid,
    actualValid,
    passed,
    findings: verification.findings,
  };
}

export function summarizeXauusdReportEvaluations(
  evaluations: readonly XauusdReportEvaluation[],
): XauusdReportEvaluationSummary {
  const passed = evaluations.filter((evaluation) => evaluation.passed).length;
  return {
    total: evaluations.length,
    passed,
    failed: evaluations.length - passed,
    passRate: evaluations.length === 0 ? 0 : passed / evaluations.length,
  };
}
