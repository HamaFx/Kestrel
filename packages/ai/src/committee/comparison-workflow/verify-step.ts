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

// verify step of the comparison committee workflow (DEC-05 split of
// comparison-workflow.ts). Extracted verbatim from the former module: verify
// is strict for real desk failures (F-01), while the `data-unavailable` skip
// marker for a blocked symbol is disclosed by the fusion instead.

import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { readSpecialistStepResultById } from '../specialist-runner';
import { recordCommitteeStepSpan } from '../step-spans';
import { MastraModeStrictFailureError, type MastraSpecialistName } from '../types';
import { VerifyOutputSchema } from '../workflow-shared';
import type { ComparisonStepContext } from './context';

export function createComparisonVerifyStep(ctx: ComparisonStepContext) {
  const {
    deps,
    mode,
    symbols: comparisonSymbols,
    deskNames: comparisonDeskNames,
    stepIdFor: comparisonStepId,
  } = ctx;

  return createStep({
    id: 'verify',
    inputSchema: z.unknown(),
    outputSchema: VerifyOutputSchema,
    execute: async ({ requestContext, getStepResult }) => {
      await deps.onProgress?.('verify');
      const failedDesks = new Set<MastraSpecialistName>();
      const failedLabels: string[] = [];
      let sawDeadline = false;
      for (const symbol of comparisonSymbols) {
        for (const desk of comparisonDeskNames) {
          const marker = readSpecialistStepResultById(
            getStepResult,
            comparisonStepId(desk, symbol),
          );
          // F-01: `data-unavailable` is the skip marker for a blocked symbol
          // — the fusion discloses it; only real desk failures are terminal.
          if (marker?.ok === false && marker.error !== 'data-unavailable') {
            failedDesks.add(desk);
            failedLabels.push(`${desk} desk on ${symbol}`);
            if (marker.error === 'deadline') sawDeadline = true;
          }
        }
      }
      recordCommitteeStepSpan({
        step: 'verify',
        runId: (requestContext?.get('runId') as string | undefined) ?? 'unknown',
        symbol: comparisonSymbols.join('/'),
        mode,
        ok: failedLabels.length === 0,
        ...(failedLabels.length > 0 ? { error: failedLabels.join(', ') } : {}),
      });
      if (failedLabels.length > 0) {
        throw new MastraModeStrictFailureError(
          [...failedDesks],
          undefined,
          sawDeadline
            ? `Comparison analysis timed out (${failedLabels.join(', ')} did not complete) — please retry. No partial answer was returned.`
            : `Comparison analysis could not complete (${failedLabels.join(', ')}). No partial answer was returned — please retry.`,
        );
      }
      return { failedAgents: [] };
    },
  });
}
