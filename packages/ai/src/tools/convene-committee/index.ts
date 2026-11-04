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

// Tool: convene_committee (Audit v3 Phase 8 — Decision Q11).
//
// Scores a proposed trade setup (symbol, side, entry, optional stop/target)
// with the deterministic, packet-grounded 4-desk scorecard and returns the
// structured `ConveneCommitteeOutput` card rendered by the chat part.
//
// Audit 2026-11-04 §3.1.B: the tool must not spawn a nested 4-specialist +
// fusion workflow inside a normal chat turn. It is an instant deterministic
// scorecard; the model-reviewed committee is the `full` chat mode, which
// streams its own progress and fails closed on any desk failure.
//
// Verdict synthesis lives in `verdicts.ts`; grade thresholds in `grading.ts`.

import {
  ConveneCommitteeInputSchema,
  ConveneCommitteeOutputSchema,
  type ConveneCommitteeOutput,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

import { collectSymbolResearchPacketCached } from '../../mastra-v2/packets/packet-cache';
import { enrichPacketForUser } from '../../plugins/enrichers';
import { maybeGetToolContext } from '../../runtime/tool-context';
import { computeGradeAndGoNoGo } from './grading';
import { buildPacketGroundedFallbackVerdicts } from './verdicts';

const InputSchema = ConveneCommitteeInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    convene_committee: { input: z.infer<typeof InputSchema> };
  }
}

export const conveneCommitteeTool: Tool<z.infer<typeof InputSchema>, ConveneCommitteeOutput> = tool(
  {
    description:
      'Score a proposed trade setup (symbol, side, entry, stop, target) with the instant packet-grounded 4-desk committee scorecard (Technical, Macro & News, Risk, Sentiment) and return a graded Go/Caution/No-Go card. Deterministic and instant; the user can switch to Full mode for a model-reviewed committee.',
    inputSchema: InputSchema,
    execute: async (
      { symbol, side, entry, stop, target },
      options?: { abortSignal?: AbortSignal },
    ): Promise<ConveneCommitteeOutput> => {
      const ctx = maybeGetToolContext();
      const signal = options?.abortSignal ?? ctx?.signal ?? undefined;
      const basePacket = await collectSymbolResearchPacketCached(symbol, signal);
      const packet = ctx?.userId
        ? await enrichPacketForUser(basePacket, ctx.userId, signal)
        : basePacket;
      if (packet.status === 'blocked' || !packet.price?.tick) {
        throw new Error(
          `Market data unavailable for ${symbol} (${packet.warnings.join(', ') || 'missing live price'}). Cannot convene committee without verified market data.`,
        );
      }

      const verdicts = buildPacketGroundedFallbackVerdicts({
        symbol,
        side,
        entry,
        ...(stop !== undefined ? { stop } : {}),
        ...(target !== undefined ? { target } : {}),
        packet,
      });

      const { grade, goNoGo } = computeGradeAndGoNoGo({
        side,
        entry,
        ...(stop !== undefined ? { stop } : {}),
        ...(target !== undefined ? { target } : {}),
        verdicts,
      });

      const verdictSummary = verdicts
        .map((v) => `${v.persona.replace('_', ' ')}: ${v.verdict} (${v.confidence}/10)`)
        .join(', ');
      // P2-05/F-02: the packet-grounded review is a heuristic, not a verified
      // committee verdict. The card must always say so.
      const consensusText = `Heuristic review (no LLM) — Team grade ${grade} (${goNoGo.toUpperCase()}) for ${side.toUpperCase()} ${symbol} at ${entry}${stop !== undefined ? `, stop ${stop}` : ''}${target !== undefined ? `, target ${target}` : ''}. Breakdown — ${verdictSummary}.`;

      return ConveneCommitteeOutputSchema.parse({
        symbol,
        side,
        entry,
        ...(stop !== undefined ? { stop } : {}),
        ...(target !== undefined ? { target } : {}),
        verdicts,
        grade,
        goNoGo,
        consensus: consensusText,
      });
    },
  },
);
