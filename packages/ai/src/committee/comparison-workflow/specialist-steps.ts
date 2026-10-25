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

// Per-symbol desk passes of the comparison committee workflow (DEC-05 split
// of comparison-workflow.ts). Extracted verbatim from the former module: each
// compared symbol gets its own desk steps (technical + risk by default,
// P1-04) in parallel.

import type { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';

import { isDeadlineAbort } from '../../utils/timeout';
import { runSpecialistGeneration, SpecialistStepResultSchema } from '../specialist-runner';
import { recordCommitteeStepSpan } from '../step-spans';
import type { ModeRequestContext } from '../types';
import { ComparisonSpecialistStepInputSchema } from '../workflow-shared';
import type { ComparisonStepContext } from './context';

export function createComparisonSpecialistSteps(ctx: ComparisonStepContext) {
  const {
    deps,
    mode,
    symbols: comparisonSymbols,
    deskNames: comparisonDeskNames,
    stepIdFor: comparisonStepId,
    specialistDeps,
    runSignals,
    runSignal,
  } = ctx;

  return comparisonSymbols.flatMap((symbol) =>
    comparisonDeskNames.map((desk) =>
      createStep({
        id: comparisonStepId(desk, symbol),
        inputSchema: ComparisonSpecialistStepInputSchema,
        outputSchema: SpecialistStepResultSchema,
        retries: 1,
        execute: async ({ inputData, requestContext, abortSignal }) => {
          const packet = inputData.packets?.[symbol];
          if (!packet) {
            // F-01: the symbol's packet was blocked and excluded by the
            // collect step. The desk is skipped (not failed); the fusion
            // discloses the missing symbol.
            return {
              ok: false,
              agentName: desk,
              error: 'data-unavailable',
            };
          }
          await deps.onProgress?.(desk);
          const startedAt = Date.now();
          const signal = runSignal ?? abortSignal;
          let result: Awaited<ReturnType<typeof runSpecialistGeneration>>;
          try {
            result = await runSpecialistGeneration({
              name: desk,
              prompt: inputData.prompt,
              packet,
              symbol,
              requestContext: requestContext as RequestContext<ModeRequestContext>,
              signal,
              startedAt,
              deps: specialistDeps,
            });
          } catch (error) {
            if (isDeadlineAbort(runSignals)) {
              recordCommitteeStepSpan({
                step: desk,
                runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
                symbol,
                mode,
                packetId: packet.packetId,
                latencyMs: Date.now() - startedAt,
                ok: false,
                error: 'deadline',
              });
              return {
                ok: false,
                agentName: desk,
                error: 'deadline',
                latencyMs: Date.now() - startedAt,
              };
            }
            throw error;
          }
          recordCommitteeStepSpan({
            step: desk,
            runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
            symbol,
            mode,
            packetId: packet.packetId,
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
    ),
  );
}
