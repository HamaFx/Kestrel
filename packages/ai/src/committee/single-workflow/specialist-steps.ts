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

// Parallel specialist steps of the single-symbol committee workflow (DEC-05
// split of single-workflow.ts). Extracted verbatim from the former module.

import type { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';

import { isDeadlineAbort } from '../../utils/timeout';
import { runSpecialistGeneration, SpecialistStepResultSchema } from '../specialist-runner';
import { recordCommitteeStepSpan } from '../step-spans';
import type { ModeRequestContext } from '../types';
import { SpecialistStepInputSchema } from '../workflow-shared';
import type { SingleStepContext } from './context';

export function createSingleSpecialistSteps(ctx: SingleStepContext) {
  const { deps, mode, specialists, specialistDeps, runSignals, runSignal } = ctx;

  return specialists.map((name) =>
    createStep({
      id: name,
      inputSchema: SpecialistStepInputSchema,
      outputSchema: SpecialistStepResultSchema,
      retries: 1,
      execute: async ({ inputData, requestContext, abortSignal }) => {
        await deps.onProgress?.(name);
        const startedAt = Date.now();
        const signal = runSignal ?? abortSignal;
        let result: Awaited<ReturnType<typeof runSpecialistGeneration>>;
        try {
          result = await runSpecialistGeneration({
            name,
            prompt: inputData.prompt,
            packet: inputData.packet,
            requestContext: requestContext as RequestContext<ModeRequestContext>,
            signal,
            startedAt,
            deps: specialistDeps,
          });
        } catch (error) {
          if (isDeadlineAbort(runSignals)) {
            recordCommitteeStepSpan({
              step: name,
              runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
              symbol: inputData.packet.symbol,
              mode,
              packetId: inputData.packet.packetId,
              latencyMs: Date.now() - startedAt,
              ok: false,
              error: 'deadline',
            });
            return {
              ok: false,
              agentName: name,
              error: 'deadline',
              latencyMs: Date.now() - startedAt,
            };
          }
          throw error;
        }
        recordCommitteeStepSpan({
          step: name,
          runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
          symbol: inputData.packet.symbol,
          mode,
          packetId: inputData.packet.packetId,
          ...(result.model ? { modelId: result.model } : {}),
          ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
          ...(result.costUsd !== undefined ? { tokenCostUsd: result.costUsd } : {}),
          ...(result.stats
            ? { inputTokens: result.stats.inputTokens, outputTokens: result.stats.outputTokens }
            : {}),
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
        });
        return result;
      },
    }),
  );
}
