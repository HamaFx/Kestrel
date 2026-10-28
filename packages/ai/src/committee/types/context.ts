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

/**
 * Committee request context: the per-run context schema every step reads, the
 * builders that inject the packet/opinions, and the read-only memory option
 * applied to every specialist call.
 */

import type { AgentMemoryOption } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import type { CommitteeCritique, MastraModeOpinion } from './opinion';

export const REQUEST_CONTEXT_SCHEMA = z.object({
  userId: z.string().min(1),
  runId: z.string().min(1),
  threadId: z.string().min(1),
  symbol: z.string().min(1),
  packet: z.unknown().optional(),
  /** A-01: per-symbol packets injected for the comparison fusion call. */
  packets: z.unknown().optional(),
  /** Typed committee opinions injected for the fusion call (§2.2). */
  opinions: z.unknown().optional(),
  /** Cross-critique records injected for the fusion call (§3.2). */
  critiques: z.unknown().optional(),
  /** F-01: symbols whose packet was blocked and excluded from the comparison. */
  blockedSymbols: z.unknown().optional(),
  /** F-01: the blocked packets' `missingData` lines for the fusion disclosure. */
  blockedMissingData: z.unknown().optional(),
  /** Phase 1 plugins — installed + enabled plugin ids for this request. */
  installedPlugins: z.array(z.string()).optional(),
  /**
   * Phase 2 (Jev) — "Jev Scores, LLM Explains" calibration written by the
   * collect step and read by every specialist prompt/runner. Absent when Jev
   * is unconfigured or the packet is not ready.
   */
  jevCalibration: z.unknown().optional(),
  /**
   * Phase 2 (Jev) — the consensus-gate decision written by the critique step
   * and reused by the debate step (one Jev gate call per run).
   */
  committeeDeliberationDecision: z.unknown().optional(),
});

export type ModeRequestContext = z.infer<typeof REQUEST_CONTEXT_SCHEMA>;

/** Rebuild the per-run request context with the packet (and opinions) present. */
export function contextWithPacket(
  base: RequestContext<ModeRequestContext>,
  packet: SymbolResearchPacket,
  opinions?: MastraModeOpinion[],
  critiques?: CommitteeCritique[],
): RequestContext<ModeRequestContext> {
  const entries: [string, unknown][] = [
    ['userId', base.get('userId') as string],
    ['runId', base.get('runId') as string],
    ['threadId', base.get('threadId') as string],
    ['symbol', packet.symbol],
    ['packet', packet],
  ];
  // Installed plugin ids travel with the base context; dropping them here
  // would silently disable plugin tools for every specialist desk.
  const installedPlugins = base.get('installedPlugins');
  if (installedPlugins !== undefined) {
    entries.push(['installedPlugins', installedPlugins]);
  }
  // Phase 2 (Jev): the calibrated packet anchor travels into every desk's
  // agent call so its instructions include the statistical reference.
  const jevCalibration = base.get('jevCalibration');
  if (jevCalibration !== undefined) {
    entries.push(['jevCalibration', jevCalibration]);
  }
  if (opinions) entries.push(['opinions', opinions]);
  if (critiques) entries.push(['critiques', critiques]);
  return new RequestContext<ModeRequestContext>(entries as never);
}

/**
 * A-01 — comparison-run context: every per-symbol packet is injected under
 * `packets` (the primary packet stays under `packet` for compatibility with
 * the shared specialist context). F-01: blocked symbols are injected under
 * `blockedSymbols` so the comparison fusion prompt discloses the gap.
 */
export function contextWithPackets(
  base: RequestContext<ModeRequestContext>,
  packets: readonly SymbolResearchPacket[],
  opinions?: MastraModeOpinion[],
  blockedSymbols?: readonly string[],
  blockedMissingData?: readonly string[],
): RequestContext<ModeRequestContext> {
  const primary = packets[0];
  if (!primary) throw new Error('Comparison context requires at least one packet.');
  const packetRecord: Record<string, SymbolResearchPacket> = {};
  for (const packet of packets) packetRecord[packet.symbol] = packet;
  const entries: [string, unknown][] = [
    ['userId', base.get('userId') as string],
    ['runId', base.get('runId') as string],
    ['threadId', base.get('threadId') as string],
    ['symbol', packets.map((packet) => packet.symbol).join('/')],
    ['packet', primary],
    ['packets', packetRecord],
  ];
  if (opinions) entries.push(['opinions', opinions]);
  if (blockedSymbols && blockedSymbols.length > 0) entries.push(['blockedSymbols', blockedSymbols]);
  if (blockedMissingData && blockedMissingData.length > 0) {
    entries.push(['blockedMissingData', blockedMissingData]);
  }
  return new RequestContext<ModeRequestContext>(entries as never);
}

/**
 * Specialists read thread context but must not write their internal opinions
 * into the conversation thread; only the fusion/output layer writes
 * user-visible assistant messages. This is applied by default to every
 * specialist call regardless of what the caller passes.
 */
export function readOnlyMemoryOptions(callOptions: AgentMemoryOption): AgentMemoryOption {
  return { ...callOptions, options: { ...callOptions.options, readOnly: true } };
}
