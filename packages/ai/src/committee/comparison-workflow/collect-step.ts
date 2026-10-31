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

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import { enrichPacketForUser } from '../../plugins/enrichers';
import { scorePacketWithJev, type JevPacketCalibration } from '../jev-packet-scorer';
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
    generationLedger,
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
      // Phase 3 (Jev roadmap) — apply installed-plugin packet enrichers per
      // user before calibration and prompting, mirroring the single-symbol
      // collect step. Enrichment is fail-open and never mutates the cache.
      const userId = requestContext.get('userId') as string | undefined;
      const entries: Array<[string, SymbolResearchPacket]> = [];
      for (const [entrySymbol, rawPacket] of packets.entries()) {
        entries.push([
          entrySymbol,
          userId ? await enrichPacketForUser(rawPacket, userId, signal) : rawPacket,
        ]);
      }
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
      // Phase 2/3 (Jev) — "Jev Scores, LLM Explains" for every compared
      // symbol: calibrate each healthy packet in parallel and publish the
      // per-symbol anchors so each desk pass blends its own calibrated Jev
      // confidence. Best-effort: no Jev provider / timeout leaves a symbol
      // uncalibrated and the run continues on the LLM-only flow.
      const runId = (requestContext.get('runId') as string | undefined) ?? 'run';
      const calibrations = await Promise.all(
        healthy.map(async ([entrySymbol, packet]) => {
          const calibration = await scorePacketWithJev(packet, {
            settings: deps.jevSettings ?? null,
            env: deps.jevEnv ?? null,
            signal,
            ledger: generationLedger,
            ledgerEntryId: `${runId}:packet-calibration:${entrySymbol}`,
          });
          return [entrySymbol, calibration] as const;
        }),
      );
      const calibrationsBySymbol: Record<string, JevPacketCalibration> = {};
      for (const [entrySymbol, calibration] of calibrations) {
        if (calibration) calibrationsBySymbol[entrySymbol] = calibration;
      }
      const contextWithSet = requestContext as unknown as {
        set?: (k: string, v: unknown) => void;
      };
      if (Object.keys(calibrationsBySymbol).length > 0) {
        contextWithSet.set?.('jevCalibrationsBySymbol', calibrationsBySymbol);
      }
      // The primary symbol's anchor stays published under the original
      // single-symbol key for backward compatibility.
      const primaryCalibration = calibrationsBySymbol[primary.symbol];
      if (primaryCalibration) contextWithSet.set?.('jevCalibration', primaryCalibration);

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
