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

// collect-packet step of the comparison committee workflow (DEC-05 split of
// comparison-workflow.ts). Extracted verbatim from the former module.

import type { Symbol } from '@kestrel/shared';
import { createStep } from '@mastra/core/workflows';

import { recordCommitteeStepSpan } from '../step-spans';
import { CollectPacketOutputSchema, zeroStats } from '../types';
import { CommitteeWorkflowInputSchema } from '../workflow-shared';
import type { ComparisonStepContext } from './context';

export function createComparisonCollectStep(ctx: ComparisonStepContext) {
  const {
    deps,
    collectComparisonPackets,
    symbols: comparisonSymbols,
    runSignal,
    progressStages,
  } = ctx;

  return createStep({
    id: 'collect-packet',
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, bail }) => {
      const signal = runSignal ?? abortSignal;
      await deps.onProgress?.(progressStages[0]!);
      // P-01: the input schema already validates each symbol, so the typed
      // list needs no cast at the collector boundary.
      const symbols: readonly Symbol[] = inputData.symbols ?? comparisonSymbols;
      const packets = await collectComparisonPackets(symbols, signal);
      const entries = [...packets.entries()];
      for (const [entrySymbol, packet] of entries) {
        recordCommitteeStepSpan({
          step: 'collect-packet',
          runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
          symbol: entrySymbol,
          mode: inputData.mode,
          packetId: packet.packetId,
          ok: packet.status === 'ready',
        });
      }
      // F-01: one blocked symbol must not fail the whole comparison. Only a
      // fully blocked collection is terminal; otherwise the healthy subset
      // is compared and the fusion discloses the excluded symbols.
      const healthy = entries.filter(([, packet]) => packet.status === 'ready');
      const blocked = entries.filter(([, packet]) => packet.status !== 'ready');
      const primary = healthy[0]?.[1] ?? entries[0]?.[1];
      if (!primary) throw new Error('Comparison packet collection returned no packets.');
      if (healthy.length === 0) {
        const text = `I could not complete the comparison because required market data is unavailable for every requested symbol.\n\n${blocked
          .flatMap(([, packet]) => packet.missingData)
          .join('\n')}`;
        return bail({
          status: 'blocked' as const,
          blockedText: text,
          opinions: [],
          critiques: [],
          packet: primary,
          packets: Object.fromEntries(entries),
          blockedSymbols: blocked.map(([entrySymbol]) => entrySymbol),
          stats: zeroStats(),
          failedAgents: [],
          totalCostUsd: 0,
        });
      }
      return {
        packet: primary,
        packets: Object.fromEntries(healthy),
        ...(blocked.length > 0
          ? {
              blockedSymbols: blocked.map(([entrySymbol]) => entrySymbol),
              blockedMissingData: blocked.flatMap(([, packet]) => packet.missingData),
            }
          : {}),
        prompt: inputData.prompt,
        // Comparison v1 always runs the one-desk read per symbol; the
        // durable full-committee queue never carries a comparison.
        mode: 'single' as const,
      };
    },
  });
}
