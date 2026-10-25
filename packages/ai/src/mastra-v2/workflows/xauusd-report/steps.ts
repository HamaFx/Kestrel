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
 * Step bodies for the XAUUSD verified-report workflow (DEC-05 split of
 * xauusd-report.ts). Extracted verbatim from the former module: collect →
 * generate → bounded repair → finalize, with every repair attempt and
 * verification result observable as a workflow step.
 */

import { metrics } from '@kestrel/shared';
import type { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';

import { repairPrompt } from '../../agents/xauusd/report/report-generation';
import { patchTimeframeConflictDisclosure } from '../../agents/xauusd/report/report-repair';
import { blockedXauusdResearchText } from '../../agents/xauusd/report/report-text';
import { XauusdReportVerificationError } from '../../agents/xauusd/report/report-verifier';
import { collectXauusdResearchPacket } from '../../packets/research-packet';
import type { XauusdResearchPacket } from '../../packets/research-types';
import type { MastraGenerationStats } from '../../shared/stats';
import type { XauusdRequestContext } from '../../shared/types';
import { generateAndVerify } from './generation';
import {
  CollectPacketOutputSchema,
  GenerationStepOutputSchema,
  XauusdReportWorkflowInputSchema,
  XauusdReportWorkflowOutputSchema,
  zeroStats,
  type XauusdReportWorkflowDeps,
} from './schemas';

export const MAX_REPAIR_ATTEMPTS = 2; // additional generations beyond the initial attempt

export function createCollectPacketStep(deps: XauusdReportWorkflowDeps) {
  return createStep({
    id: 'collect-packet',
    inputSchema: XauusdReportWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, abortSignal, bail }) => {
      const signal = deps.signal ?? abortSignal;
      const packet = await collectXauusdResearchPacket(signal);
      if (packet.status === 'blocked') {
        return bail({
          status: 'blocked' as const,
          blockedText: blockedXauusdResearchText(packet),
          packet,
          attempts: 0,
          stats: zeroStats(),
        });
      }
      return { packet, prompt: inputData.prompt };
    },
  });
}

export function createGenerateStep(deps: XauusdReportWorkflowDeps) {
  return createStep({
    id: 'generate',
    inputSchema: CollectPacketOutputSchema,
    outputSchema: GenerationStepOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal }) => {
      const signal = deps.signal ?? abortSignal;
      const { verified, report, result, findings, stats } = await generateAndVerify(
        deps,
        inputData.prompt,
        requestContext as RequestContext<XauusdRequestContext>,
        inputData.packet,
        signal,
      );
      if (!verified) {
        // A repair attempt is scheduled (the dowhile always runs once).
        metrics.increment('mastra_report_repair_total', { tags: { result: 'requested' } });
      }
      return { verified, report, result, findings, attempt: 1, stats };
    },
  });
}

export function createRepairStep(deps: XauusdReportWorkflowDeps) {
  return createStep({
    id: 'repair',
    inputSchema: GenerationStepOutputSchema,
    outputSchema: GenerationStepOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, getStepResult, getInitData }) => {
      // The dowhile always executes once; pass through when already verified.
      if (inputData.verified) return inputData;
      const signal = deps.signal ?? abortSignal;
      const packet = (getStepResult('collect-packet') as { packet: XauusdResearchPacket }).packet;
      const prompt = repairPrompt((getInitData() as { prompt: string }).prompt, inputData.findings);
      const { verified, report, result, findings, stats } = await generateAndVerify(
        deps,
        prompt,
        requestContext as RequestContext<XauusdRequestContext>,
        packet,
        signal,
      );
      const nextStats: MastraGenerationStats = {
        inputTokens: inputData.stats.inputTokens + stats.inputTokens,
        outputTokens: inputData.stats.outputTokens + stats.outputTokens,
        toolCalls: inputData.stats.toolCalls + stats.toolCalls,
        steps: inputData.stats.steps + stats.steps,
      };
      if (verified) {
        metrics.increment('mastra_report_repair_total', { tags: { result: 'passed' } });
      } else if (inputData.attempt < MAX_REPAIR_ATTEMPTS) {
        // Another repair is still scheduled (the loop condition allows it).
        metrics.increment('mastra_report_repair_total', { tags: { result: 'requested' } });
      }
      return {
        verified,
        report,
        result,
        findings,
        attempt: inputData.attempt + 1,
        stats: nextStats,
      };
    },
  });
}

export function createFinalizeStep() {
  return createStep({
    id: 'finalize',
    inputSchema: GenerationStepOutputSchema,
    outputSchema: XauusdReportWorkflowOutputSchema,
    execute: async ({ inputData, getStepResult }) => {
      const packet = (getStepResult('collect-packet') as { packet: XauusdResearchPacket }).packet;
      if (inputData.verified && inputData.report) {
        return {
          status: 'ready' as const,
          report: inputData.report,
          result: inputData.result,
          packet,
          attempts: inputData.attempt,
          stats: inputData.stats,
        };
      }
      // Repair budget exhausted: try the deterministic disclosure patch before
      // failing closed (same recovery as the pre-workflow repair loop).
      const candidate = (inputData.result as { object?: unknown } | null | undefined)?.object;
      const patched = patchTimeframeConflictDisclosure(candidate, packet, inputData.findings);
      if (patched) {
        metrics.increment('mastra_report_repair_total', { tags: { result: 'patched' } });
        return {
          status: 'ready' as const,
          report: patched,
          result: inputData.result,
          packet,
          attempts: inputData.attempt,
          stats: inputData.stats,
        };
      }
      metrics.increment('mastra_report_repair_total', { tags: { result: 'failed' } });
      throw new XauusdReportVerificationError(inputData.findings);
    },
  });
}
