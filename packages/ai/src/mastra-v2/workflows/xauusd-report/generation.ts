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

// One generation attempt for the XAUUSD verified-report workflow (DEC-05
// split of xauusd-report.ts): run the agent, then classify the outcome as
// verified, repair-needed, or a hard error for the caller.

import { RequestContext } from '@mastra/core/request-context';

import {
  generateXauusdReport,
  verificationFindings,
} from '../../agents/xauusd/report/report-generation';
import {
  XauusdResearchReportSchema,
  type XauusdResearchReport,
} from '../../agents/xauusd/report/report-types';
import { requireVerifiedXauusdReport } from '../../agents/xauusd/report/report-verifier';
import type { XauusdResearchPacket } from '../../packets/research-types';
import type { MastraGenerationResultLike, MastraGenerationStats } from '../../shared/stats';
import { getMastraGenerationStats } from '../../shared/telemetry';
import type { XauusdRequestContext } from '../../shared/types';
import {
  resolveXauusdReportOutputPolicy,
  zeroStats,
  type XauusdReportWorkflowDeps,
} from './schemas';

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}

/** Rebuild the per-run request context with the trusted packet present. */
export function contextWithPacket(
  base: RequestContext<XauusdRequestContext>,
  packet: XauusdResearchPacket,
): RequestContext<XauusdRequestContext> {
  const entries: Array<
    | ['userId', string]
    | ['runId', string]
    | ['threadId', string]
    | ['researchPacket', XauusdResearchPacket]
  > = [
    ['userId', base.get('userId') as string],
    ['runId', base.get('runId') as string],
    ['researchPacket', packet],
  ];
  const threadId = base.get('threadId');
  if (threadId) entries.push(['threadId', threadId as string]);
  return new RequestContext<XauusdRequestContext>(entries);
}

/**
 * Run one generation attempt and classify the outcome: verified report,
 * repair-needed (verifier or structured-output findings), or throw for
 * hard provider errors (which the caller surfaces as a failed run).
 */
export async function generateAndVerify(
  deps: XauusdReportWorkflowDeps,
  prompt: string,
  requestContext: RequestContext<XauusdRequestContext>,
  packet: XauusdResearchPacket,
  signal: AbortSignal | undefined,
): Promise<{
  verified: boolean;
  report: XauusdResearchReport | null;
  result: unknown;
  findings: string[];
  stats: MastraGenerationStats;
}> {
  try {
    const result = await generateXauusdReport(
      deps.agent,
      prompt,
      contextWithPacket(requestContext, packet),
      deps.providerId,
      signal,
      deps.callOptions,
    );
    const stats = getMastraGenerationStats(result as MastraGenerationResultLike);
    // Phase 7: the output policy decides whether deterministic verification
    // (grounding/safety/temporal) gates the report. `schema` accepts the
    // schema-valid structured output directly; `verified` keeps the strong
    // report verifier and its bounded repair loop.
    if (resolveXauusdReportOutputPolicy(deps.outputPolicy) === 'schema') {
      const parsed = XauusdResearchReportSchema.safeParse((result as { object?: unknown }).object);
      if (!parsed.success) {
        const findings = parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || 'report'}: ${issue.message}`,
        );
        return { verified: false, report: null, result, findings, stats };
      }
      return { verified: true, report: parsed.data, result, findings: [], stats };
    }
    try {
      const report = requireVerifiedXauusdReport((result as { object?: unknown }).object, packet);
      return { verified: true, report, result, findings: [], stats };
    } catch (error) {
      if (isAbort(error, signal)) throw error;
      const findings = verificationFindings(error);
      if (!findings) throw error;
      return { verified: false, report: null, result, findings: findings.slice(), stats };
    }
  } catch (error) {
    // Structured-output validation can reject the object before the verifier
    // runs (e.g. a missing second scenario), surfacing as a throw from the
    // generate call itself. Treat those issues as repair findings so the loop
    // can retry instead of failing closed on a single malformed object.
    if (isAbort(error, signal)) throw error;
    const findings = verificationFindings(error);
    if (!findings) throw error;
    return {
      verified: false,
      report: null,
      result: null,
      findings: findings.slice(),
      stats: zeroStats(),
    };
  }
}
