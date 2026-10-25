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

// verify step of the single-symbol committee workflow (DEC-05 split of
// single-workflow.ts). Extracted verbatim from the former module: both modes
// are strict — any required specialist failure (including a failed critique or
// debate round) is terminal.

import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { readCritiqueStepResult, readDebateStepResult } from '../critique';
import { readCollectPacketResult, readSpecialistStepResult } from '../specialist-runner';
import { recordCommitteeStepSpan } from '../step-spans';
import { MastraModeStrictFailureError, type MastraSpecialistName } from '../types';
import { VerifyOutputSchema } from '../workflow-shared';
import type { SingleVerifyStepContext } from './context';

export function createSingleVerifyStep(ctx: SingleVerifyStepContext) {
  const { deps, mode, specialists, strict, critiqueEnabled, debateEnabled } = ctx;

  return createStep({
    id: 'verify',
    inputSchema: z.unknown(),
    outputSchema: VerifyOutputSchema,
    execute: async ({ requestContext, getStepResult }) => {
      await deps.onProgress?.('verify' as const);
      const failedAgents: MastraSpecialistName[] = [];
      const deadlineAgents: string[] = [];
      for (const name of specialists) {
        const marker = readSpecialistStepResult(getStepResult, name);
        if (marker?.ok === false) {
          failedAgents.push(name);
          if (marker.error === 'deadline') deadlineAgents.push(name);
        }
      }
      if (critiqueEnabled) {
        const critiqueOutput = readCritiqueStepResult(getStepResult);
        for (const failed of critiqueOutput?.failedAgents ?? []) {
          const name = failed as MastraSpecialistName;
          if (!failedAgents.includes(name)) failedAgents.push(name);
        }
      }
      if (debateEnabled) {
        const debateOutput = readDebateStepResult(getStepResult);
        for (const failed of debateOutput?.failedAgents ?? []) {
          const name = failed as MastraSpecialistName;
          if (!failedAgents.includes(name)) failedAgents.push(name);
        }
      }
      const collectForSpan = readCollectPacketResult(getStepResult);
      recordCommitteeStepSpan({
        step: 'verify',
        runId: (requestContext?.get('runId') as string | undefined) ?? 'unknown',
        symbol: collectForSpan?.packet.symbol ?? 'unknown',
        mode,
        ...(collectForSpan?.packet.packetId ? { packetId: collectForSpan.packet.packetId } : {}),
        ok: failedAgents.length === 0,
        ...(failedAgents.length > 0 ? { error: failedAgents.join(',') } : {}),
      });
      if (strict && failedAgents.length > 0) {
        throw new MastraModeStrictFailureError(
          failedAgents,
          undefined,
          deadlineAgents.length > 0
            ? `Committee analysis timed out (${deadlineAgents.join(', ')} did not complete) — please retry. No partial answer was returned.`
            : undefined,
        );
      }
      return { failedAgents };
    },
  });
}
