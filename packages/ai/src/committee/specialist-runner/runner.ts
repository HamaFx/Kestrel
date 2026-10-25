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

// Specialist runner loop (DEC-05 split from specialist-runner.ts).
//
// Reusable specialist runner (Phase 6 + Audit v3 Phase 4, Owner Decision Q8).
// Each specialist desk runs with its own dedicated skill playbook and domain
// read-only toolset (`resolveSpecialistDeskTools(name)`, `maxSteps: 3`),
// captures any tool outputs into the run's verified evidence ledger, and
// validates its structured opinion via `verifyMastraOpinion`.

import { estimateCostUsd } from '../../budget/cost';
import {
  extractToolPartsFromMessages,
  type MastraToolInvocationPart,
} from '../../mastra-v2/agents/xauusd/legacy-tool-adapter';
import { getMastraGenerationStats } from '../../mastra-v2/shared/telemetry';
import {
  buildPluginMastraTools,
  getInstalledPluginRuntime,
  mergePluginTools,
  resolvePluginSkills,
  resolvePluginToolsForAgent,
} from '../../plugins';
import { withRetry } from '../../runtime/retry';
import { maybeGetToolContext, withToolContext } from '../../runtime/tool-context';
import { extractNumbersFromToolOutput } from '../grounding';
import { specialistInstructionsForRequest } from '../prompts';
import {
  createCommitteeAgent,
  resolveSpecialistDeskTools,
  SPECIALIST_DEFINITIONS,
} from '../specialists';
import { jsonPromptInjectionForModel } from '../structured-output';
import {
  committeeModelMetadata,
  contextWithPacket,
  OpinionSchema,
  readOnlyMemoryOptions,
  type MastraModeOpinion,
} from '../types';
import { verifyMastraOpinion } from '../verifier';
import { isAbort, isTransientProviderError } from './errors';
import type { SpecialistStepResult } from './step-result';
import type { RunSpecialistGenerationArgs } from './types';

/**
 * P1-01 (audit 2026-10-18) — one bounded normalization retry. A specialist
 * whose opinion fails deterministic verification gets exactly one more
 * generation with the findings restated; the workflow's strict verify step
 * still fails the run when the retry cannot produce a grounded opinion.
 */
function verificationRetryFragment(findings: readonly string[]): string {
  return [
    'Your previous structured opinion failed deterministic grounding verification.',
    'Rewrite the opinion: keep every numeric claim tied to the packet evidence or your tool outputs, disclose stale/missing/degraded packet data, and populate details.missingEvidence when the packet quality is not complete.',
    `Verification findings to fix:\n${findings.map((finding) => `- ${finding}`).join('\n')}`,
  ].join('\n');
}

export async function runSpecialistGeneration(
  args: RunSpecialistGenerationArgs,
): Promise<SpecialistStepResult> {
  const { name, prompt, packet, requestContext, signal, startedAt, deps } = args;
  // §3.1: resolve the specialist's own top-tier model when configured;
  // otherwise the run's primary (always top-tier) model is used.
  const agentModel = deps.resolveModelForAgent?.(name) ?? {
    model: deps.model,
    modelId: deps.modelId,
    providerId: deps.providerId,
  };
  try {
    const toolPartsBuffer: MastraToolInvocationPart[] = [];
    const packetContext = contextWithPacket(requestContext, packet);
    (packetContext as unknown as { set?: (k: string, v: unknown) => void }).set?.(
      'toolParts',
      toolPartsBuffer,
    );

    // Audit v3 Phase 4 (Q8): bind each specialist's dedicated read-only
    // domain toolset. Phase 1 plugin extension: merge only the tools from
    // plugins this user installed and that target this desk.
    const coreDeskTools = resolveSpecialistDeskTools(name, deps.disabledTools);
    const pluginUserId = requestContext.get('userId');
    const pluginRuntime =
      typeof pluginUserId === 'string' && pluginUserId.length > 0
        ? await getInstalledPluginRuntime(pluginUserId)
        : null;
    const pluginTools = pluginRuntime
      ? buildPluginMastraTools({
          runtime: pluginRuntime,
          tools: resolvePluginToolsForAgent(pluginRuntime, name, deps.disabledTools ?? []),
          ...(signal ? { signal } : {}),
          requestContext: packetContext,
        })
      : {};
    const deskTools = mergePluginTools(coreDeskTools, pluginTools);
    const pluginSkills = pluginRuntime ? resolvePluginSkills(pluginRuntime) : [];

    const agent = createCommitteeAgent(
      agentModel.model,
      SPECIALIST_DEFINITIONS[name].agentId,
      (ctx: {
        requestContext: Parameters<typeof specialistInstructionsForRequest>[0]['requestContext'];
      }) => specialistInstructionsForRequest({ name, requestContext: ctx.requestContext }),
      deps.memory,
      deps.researchInputProcessors ?? deps.inputProcessors,
      deps.scorers,
      deskTools,
      pluginSkills,
    );
    const effectiveMaxSteps = Math.max(deps.maxSteps, 3);
    const toolCtx = deps.toolContext ?? maybeGetToolContext();

    /** Build one verified candidate opinion from one generation attempt. */
    const attempt = async (attemptPrompt: string) => {
      const generateFn = () =>
        agent.generate(attemptPrompt, {
          requestContext: packetContext,
          // Specialists never persist their internal opinions; the fusion/output
          // layer owns user-visible assistant writes (Phase 6).
          ...(deps.specialistCallOptions
            ? { memory: readOnlyMemoryOptions(deps.specialistCallOptions) }
            : {}),
          toolChoice: 'auto',
          maxSteps: effectiveMaxSteps,
          structuredOutput: {
            schema: OpinionSchema,
            jsonPromptInjection: jsonPromptInjectionForModel(agentModel.model),
            instructions:
              'Return a complete opinion object. Keep numeric claims tied to packet evidence or your tool outputs and mention packet quality when it is not complete.',
          },
          ...(signal ? { abortSignal: signal } : {}),
        });
      const result = toolCtx
        ? await withToolContext(toolCtx, () => withRetry(generateFn, { maxAttempts: 2, signal }))
        : await withRetry(generateFn, { maxAttempts: 2, signal });
      const stats = getMastraGenerationStats(result);
      const rawOpinion = OpinionSchema.parse(result.object);
      const capturedToolParts = extractToolPartsFromMessages(
        (result as unknown as { response?: { messages?: readonly unknown[] } }).response?.messages,
        toolPartsBuffer,
      );
      const toolEvidenceValues: number[] = [];
      const toolsCalled: string[] = [];
      for (const tp of capturedToolParts) {
        toolsCalled.push(tp.toolName);
        if (tp.state === 'output-available' && tp.output !== undefined) {
          toolEvidenceValues.push(...extractNumbersFromToolOutput(tp.output));
        }
      }
      const enrichedDetails = {
        ...rawOpinion.details,
        ...(toolsCalled.length > 0 ? { toolsCalled: [...new Set(toolsCalled)] } : {}),
        ...(toolEvidenceValues.length > 0
          ? { toolEvidenceValues: [...new Set(toolEvidenceValues)] }
          : {}),
      };
      const opinion = {
        ...rawOpinion,
        details: enrichedDetails,
      };
      const candidateOpinion: MastraModeOpinion = {
        agentName: name,
        ...(args.symbol ? { symbol: args.symbol } : {}),
        bias: opinion.bias,
        confidence: opinion.confidence,
        reasoning: opinion.reasoning,
        rawData: opinion.details,
        ...committeeModelMetadata(
          agentModel.modelId,
          agentModel.providerId,
          stats,
          0,
          Date.now() - startedAt,
        ),
      };
      const costUsd = estimateCostUsd(agentModel.modelId, stats.inputTokens, stats.outputTokens);
      return { opinion, candidateOpinion, stats, costUsd };
    };

    // P1-01: max one verification-driven retry; the spend of every attempt is
    // folded into the single idempotent ledger entry.
    const maxAttempts = 2;
    let totalCostUsd = 0;
    let lastFindings: string[] = [];
    for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
      const attemptPrompt =
        attemptIndex === 1 ? prompt : `${prompt}\n\n${verificationRetryFragment(lastFindings)}`;
      const { opinion, candidateOpinion, stats, costUsd } = await attempt(attemptPrompt);
      totalCostUsd += costUsd;
      const opinionVerification = verifyMastraOpinion(candidateOpinion, packet);
      if (opinionVerification.ok) {
        deps.ledger.recordCost(`specialist:${name}`, 'specialist', totalCostUsd);
        return {
          ok: true,
          agentName: name,
          opinion,
          stats,
          model: agentModel.modelId,
          providerId: agentModel.providerId,
          costUsd: totalCostUsd,
          latencyMs: Date.now() - startedAt,
        };
      }
      lastFindings = opinionVerification.findings;
    }

    // Both attempts failed verification: bill the spend and mark the desk
    // failed (the strict verify step turns this into a terminal failure).
    deps.ledger.recordCost(`specialist:${name}`, 'specialist', totalCostUsd);
    return {
      ok: false,
      agentName: name,
      error: `Opinion verification failed after retry: ${lastFindings.join('; ')}`,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    if (isTransientProviderError(error)) throw error;
    return {
      ok: false,
      agentName: name,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    };
  }
}
