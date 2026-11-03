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
// single-workflow.ts). The strict 4-of-4 hard gate: every required specialist
// must have succeeded and passed deterministic verification. One missing or
// failed desk aborts the run before fusion — a partial answer is never
// returned to the user.

import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { readCollectPacketResult, readSpecialistStepResult } from '../specialist-runner';
import { recordCommitteeStepSpan } from '../step-spans';
import { MastraModeStrictFailureError, type MastraSpecialistName } from '../types';
import { VerifyOutputSchema } from '../workflow-shared';
import type { SingleStepContext } from './context';

export function createSingleVerifyStep(ctx: SingleStepContext) {
  const { deps, mode, specialists, strict } = ctx;

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
        // Hard gate: a desk that did not produce a verified opinion (missing
        // marker, failed generation, or failed grounding) is a failure. Never
        // let an absent marker pass as success.
        if (!marker?.ok) {
          failedAgents.push(name);
          if (marker?.error === 'deadline') deadlineAgents.push(name);
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
