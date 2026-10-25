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

// collect-packet step of the single-symbol committee workflow (DEC-05 split
// of single-workflow.ts). Extracted verbatim from the former module.

import { createStep } from '@mastra/core/workflows';

import { enrichPacketForUser } from '../../plugins/enrichers';
import { recordCommitteeStepSpan } from '../step-spans';
import { CollectPacketOutputSchema, zeroStats } from '../types';
import { CommitteeWorkflowInputSchema } from '../workflow-shared';
import type { SingleStepContext } from './context';

export function createSingleCollectStep(ctx: SingleStepContext) {
  const { deps, collectPacket, runSignal, progressStages } = ctx;

  return createStep({
    id: 'collect-packet',
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, bail }) => {
      const signal = runSignal ?? abortSignal;
      await deps.onProgress?.(progressStages[0]!);
      const basePacket = await collectPacket(inputData.symbol, signal);
      const userId = requestContext.get('userId') as string | undefined;
      const packet = userId ? await enrichPacketForUser(basePacket, userId, signal) : basePacket;
      recordCommitteeStepSpan({
        step: 'collect-packet',
        runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
        symbol: packet.symbol,
        mode: inputData.mode,
        packetId: packet.packetId,
        ok: packet.status === 'ready',
      });
      if (packet.status === 'blocked') {
        const text = `I could not complete ${packet.symbol} ${inputData.mode} analysis because required market data is unavailable.\n\n${packet.missingData.join('\n')}`;
        return bail({
          status: 'blocked' as const,
          blockedText: text,
          opinions: [],
          critiques: [],
          packet,
          stats: zeroStats(),
          failedAgents: [],
          totalCostUsd: 0,
        });
      }
      return { packet, prompt: inputData.prompt, mode: inputData.mode };
    },
  });
}
