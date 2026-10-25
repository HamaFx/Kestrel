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
// Convene Kestrel's multi-agent specialist committee on a proposed trade
// setup (symbol, side, entry, optional stop/target/notes) right inside
// canonical chat and return the structured `ConveneCommitteeOutput` card
// rendered by `ConveneCommitteePart` (`apps/web/src/components/chat/parts/convene-committee.tsx`).
//
// Verdict mapping + fallback synthesis live in `verdicts.ts`, the grade
// thresholds in `grading.ts`, and the LLM committee execution in
// `committee-run.ts`.

import {
  ConveneCommitteeInputSchema,
  ConveneCommitteeOutputSchema,
  type CommitteeVerdict,
  type ConveneCommitteeOutput,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

import { collectSymbolResearchPacketCached } from '../../mastra-v2/packets/packet-cache';
import { enrichPacketForUser } from '../../plugins/enrichers';
import { maybeGetToolContext } from '../../runtime/tool-context';
import { runLlmCommittee } from './committee-run';
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
      'Convene the Kestrel 4-Expert Committee (Technical, Macro & News, Risk Manager, and Sentiment) to evaluate a specific trade setup (symbol, side, entry, stop, target) and return a graded Go/Caution/No-Go verdict card.',
    inputSchema: InputSchema,
    execute: async (
      { symbol, side, entry, stop, target, notes },
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
      const fallbackVerdicts = buildPacketGroundedFallbackVerdicts({
        symbol,
        side,
        entry,
        ...(stop !== undefined ? { stop } : {}),
        ...(target !== undefined ? { target } : {}),
        packet,
      });

      let verdicts: CommitteeVerdict[] = fallbackVerdicts;
      let consensusText = '';
      let llmVerdictsUsed = false;

      // The LLM committee requires a per-turn ToolContext: without it there is
      // no attributable user, thread, or budget ledger, and unattributable model
      // spend must never be created. Direct callers outside chat get the
      // deterministic packet-grounded verdicts below.
      if (ctx) {
        const result = await runLlmCommittee({
          ctx,
          symbol,
          side,
          entry,
          ...(stop !== undefined ? { stop } : {}),
          ...(target !== undefined ? { target } : {}),
          ...(notes !== undefined ? { notes } : {}),
          signal,
          fallbackVerdicts,
        });
        verdicts = result.verdicts;
        consensusText = result.consensusText;
        llmVerdictsUsed = result.llmVerdictsUsed;
      }

      const { grade, goNoGo } = computeGradeAndGoNoGo({
        side,
        entry,
        ...(stop !== undefined ? { stop } : {}),
        ...(target !== undefined ? { target } : {}),
        verdicts,
      });

      if (!consensusText) {
        const verdictSummary = verdicts
          .map((v) => `${v.persona.replace('_', ' ')}: ${v.verdict} (${v.confidence}/10)`)
          .join(', ');
        // P2-05/F-02: the deterministic packet-grounded review is a heuristic
        // (no LLM ran), not a verified committee verdict — say so, so a card
        // rendered without a model can never read as model-reviewed.
        const heuristicPrefix = llmVerdictsUsed ? '' : 'Heuristic review (no LLM) — ';
        consensusText = `${heuristicPrefix}Team grade ${grade} (${goNoGo.toUpperCase()}) for ${side.toUpperCase()} ${symbol} at ${entry}${stop !== undefined ? `, stop ${stop}` : ''}${target !== undefined ? `, target ${target}` : ''}. Breakdown — ${verdictSummary}.`;
      }

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
