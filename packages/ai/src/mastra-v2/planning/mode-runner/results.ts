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

// Mapping of the committee workflow's raw output onto the mode-result
// contract, plus the strict-failure specialist scan.

import {
  SPECIALISTS_BY_MODE,
  type CommitteeCritique,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
} from '@ai/committee/types';
import type { ChatModelResolution } from '@ai/models/model';

import type { SymbolResearchPacket } from '../../packets/symbol-research';
import type { MastraGenerationStats } from '../../shared/telemetry';
import type { MastraModeResult } from './types';

/** Payload the committee workflow returns on a successful run. */
export type ModeWorkflowOutput = {
  status: 'ready' | 'blocked';
  blockedText?: string;
  finalText?: string;
  opinions: MastraModeOpinion[];
  critiques?: CommitteeCritique[];
  packet: SymbolResearchPacket;
  packets?: Record<string, SymbolResearchPacket>;
  stats: MastraGenerationStats;
  totalCostUsd?: number;
};

export function failedAgentsFromRun(
  result: { steps?: Record<string, { status?: string; output?: { ok?: boolean } }> },
  mode: MastraAnalysisMode,
): MastraSpecialistName[] {
  const failed: MastraSpecialistName[] = [];
  for (const name of SPECIALISTS_BY_MODE[mode]) {
    const step = result.steps?.[name];
    if (step?.status === 'failed' || step?.output?.ok === false) failed.push(name);
  }
  return failed;
}

/**
 * A-01: comparison runs return one packet per compared symbol in prompt order.
 * Non-comparison runs spread no comparison fields at all.
 */
function comparisonFields(
  isComparison: boolean,
  comparisonSymbols: string[],
  packets: ModeWorkflowOutput['packets'],
): { symbols?: string[]; comparisonPackets?: SymbolResearchPacket[] } {
  if (!isComparison) return {};
  const comparisonPackets = comparisonSymbols
    .map((symbol) => packets?.[symbol])
    .filter((packet): packet is SymbolResearchPacket => Boolean(packet));
  return {
    symbols: comparisonSymbols,
    ...(comparisonPackets && comparisonPackets.length > 0 ? { comparisonPackets } : {}),
  };
}

/** Blocked/degraded outcome: no committee answer, packet still returned. */
export function mapBlockedResult(args: {
  output: ModeWorkflowOutput;
  mode: MastraAnalysisMode;
  /** Requested run symbol — the blocked message names it. */
  runSymbol: string;
  stats: MastraGenerationStats;
  isComparison: boolean;
  comparisonSymbols: string[];
  resolution: ChatModelResolution;
  memoryMode: 'native' | 'degraded';
  memoryBackfill: boolean;
  startedAt: number;
}): MastraModeResult {
  const text =
    args.output.blockedText ??
    `I could not complete ${args.runSymbol} ${args.mode} analysis because required market data is unavailable.`;
  return {
    finalText: text,
    agentOpinions: [],
    committeeCritiques: [],
    mode: args.mode,
    symbol: args.output.packet.symbol,
    packet: args.output.packet,
    ...comparisonFields(args.isComparison, args.comparisonSymbols, args.output.packets),
    modelId: args.resolution.modelId,
    providerId: args.resolution.providerId,
    stats: args.stats,
    totalCostUsd: 0,
    totalLatencyMs: Date.now() - args.startedAt,
    answerOutcome: 'blocked',
    memoryMode: args.memoryMode,
    memoryBackfill: args.memoryBackfill,
    modelSnapshot: {
      providerId: args.resolution.providerId,
      bareModelId: args.resolution.bareModelId,
    },
  };
}

/** Successful outcome with a committee answer. */
export function mapReadyResult(args: {
  output: ModeWorkflowOutput & { finalText: string };
  mode: MastraAnalysisMode;
  isComparison: boolean;
  comparisonSymbols: string[];
  resolution: ChatModelResolution;
  totalCostUsd: number;
  memoryMode: 'native' | 'degraded';
  memoryBackfill: boolean;
  startedAt: number;
}): MastraModeResult {
  return {
    finalText: args.output.finalText,
    agentOpinions: args.output.opinions,
    committeeCritiques: args.output.critiques ?? [],
    mode: args.mode,
    symbol: args.output.packet.symbol,
    packet: args.output.packet,
    ...comparisonFields(args.isComparison, args.comparisonSymbols, args.output.packets),
    modelId: args.resolution.modelId,
    providerId: args.resolution.providerId,
    stats: args.output.stats,
    totalCostUsd: args.totalCostUsd,
    totalLatencyMs: Date.now() - args.startedAt,
    answerOutcome: args.output.packet.dataQuality === 'complete' ? 'ready' : 'degraded',
    memoryMode: args.memoryMode,
    memoryBackfill: args.memoryBackfill,
    modelSnapshot: {
      providerId: args.resolution.providerId,
      bareModelId: args.resolution.bareModelId,
    },
  };
}
