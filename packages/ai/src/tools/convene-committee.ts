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

import {
  ConveneCommitteeInputSchema,
  ConveneCommitteeOutputSchema,
  type CommitteeVerdict,
  type ConveneCommitteeOutput,
} from '@kestrel/shared';
import type { UserSettingsRow } from '@kestrel/db/schema';
import { tool } from 'ai';
import type { z } from 'zod';

import type { MastraModeOpinion } from '../committee/types';
import { sanitizeExternalText } from '../mastra-v2/packets/external-content';
import { collectSymbolResearchPacketCached } from '../mastra-v2/packets/packet-cache';
import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import { runMastraMode } from '../mastra-v2/planning/mode-runner';
import { maybeGetToolContext } from '../tool-context';

const InputSchema = ConveneCommitteeInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    convene_committee: { input: z.infer<typeof InputSchema> };
  }
}

function opinionToVerdict(
  persona: CommitteeVerdict['persona'],
  opinion: MastraModeOpinion | undefined,
  fallback: CommitteeVerdict,
): CommitteeVerdict {
  if (!opinion) return fallback;
  const sentences = opinion.reasoning
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const keyPoints = sentences.slice(0, 3);
  const missingEvidence = Array.isArray(opinion.rawData?.missingEvidence)
    ? (opinion.rawData.missingEvidence as string[])
    : [];
  const assumptions = Array.isArray(opinion.rawData?.assumptions)
    ? (opinion.rawData.assumptions as string[])
    : [];

  return {
    persona,
    verdict: opinion.bias,
    confidence: Math.max(1, Math.min(10, Math.round(opinion.confidence * 10))),
    keyPoints: keyPoints.length > 0 ? keyPoints : [opinion.reasoning.slice(0, 200)],
    risk:
      missingEvidence[0] ??
      assumptions[0] ??
      fallback.risk,
    recommendation: sentences[sentences.length - 1] ?? fallback.recommendation,
  };
}

function buildPacketGroundedFallbackVerdicts(args: {
  symbol: ConveneCommitteeOutput['symbol'];
  side: ConveneCommitteeOutput['side'];
  entry: number;
  stop?: number;
  target?: number;
  packet: SymbolResearchPacket;
}): CommitteeVerdict[] {
  const { symbol, side, entry, stop, target, packet } = args;
  const tick = packet.price?.tick;
  if (!tick || packet.status === 'blocked') {
    throw new Error(
      `Cannot synthesize fallback committee verdicts for ${symbol}: live market data packet is blocked (${packet.blockReason ?? 'no live tick'}).`,
    );
  }
  const liveMid = tick.mid;
  const primaryEvidence =
    packet.timeframes.find((tf) => tf.timeframe === '1h') ?? packet.timeframes[0];
  const indicators = primaryEvidence?.indicators ?? [];
  const getIndicatorVal = (kind: string, period?: number): number | null => {
    const ind = indicators.find(
      (i) => i.kind === kind && (period === undefined || i.params?.period === period),
    );
    if (!ind || !Array.isArray(ind.values) || ind.values.length === 0) return null;
    const last = ind.values[ind.values.length - 1];
    return typeof last === 'number' && Number.isFinite(last) ? last : null;
  };

  const ema20 = getIndicatorVal('ema', 20);
  const ema50 = getIndicatorVal('ema', 50);
  const rsi14 = getIndicatorVal('rsi', 14);
  const atr14 = getIndicatorVal('atr', 14);

  const hasTrend = ema20 !== null && ema50 !== null;
  const trendBullish = hasTrend ? ema20 >= ema50 : false;
  const techBias: CommitteeVerdict['verdict'] =
    hasTrend && rsi14 !== null
      ? ema20 > ema50 && rsi14 >= 50
        ? 'bullish'
        : ema20 < ema50 && rsi14 < 50
          ? 'bearish'
          : 'neutral'
      : 'neutral';
  const techAligned =
    (side === 'long' && techBias === 'bullish') ||
    (side === 'short' && techBias === 'bearish');

  const stopDistance = stop !== undefined ? Math.abs(entry - stop) : null;
  const rewardDistance = target !== undefined ? Math.abs(target - entry) : null;
  const rrRatio =
    stopDistance && stopDistance > 0 && rewardDistance !== null
      ? rewardDistance / stopDistance
      : null;

  const stopGeometryValid =
    stop === undefined
      ? false
      : side === 'long'
        ? stop < entry
        : stop > entry;

  const riskVerdict: CommitteeVerdict['verdict'] =
    stopGeometryValid && (rrRatio === null || rrRatio >= 1.5)
      ? side === 'long'
        ? 'bullish'
        : 'bearish'
      : 'neutral';

  const macroEventsCount = packet.xauusdExtension?.events?.length ?? 0;
  const econVerdict: CommitteeVerdict['verdict'] =
    macroEventsCount > 2 ? 'neutral' : techBias;

  const candles = primaryEvidence?.candles ?? [];
  const openPrice = candles[0]?.o ?? liveMid;
  const changePct = openPrice > 0 ? ((liveMid - openPrice) / openPrice) * 100 : 0;

  return [
    {
      persona: 'economist',
      verdict: econVerdict,
      confidence: macroEventsCount > 0 ? 7 : 6,
      keyPoints: [
        `${symbol} live mid price is ${liveMid} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%).`,
        macroEventsCount > 0
          ? `${macroEventsCount} high-impact macro event(s) on the radar; size conservatively around releases.`
          : 'No immediate high-impact macro release blocking execution.',
      ],
      risk:
        macroEventsCount > 0
          ? 'Upcoming macro releases can widen spreads and trigger two-way volatility.'
          : 'Watch US yield and dollar shifts during session transitions.',
      recommendation:
        econVerdict === (side === 'long' ? 'bullish' : 'bearish')
          ? `Macro backdrop supports ${side} setups above invalidation.`
          : 'Wait for clean post-event confirmation before committing full size.',
    },
    {
      persona: 'technician',
      verdict: techBias,
      confidence: techAligned ? 8 : 6,
      keyPoints: [
        hasTrend && rsi14 !== null
          ? `EMA20 (${ema20.toFixed(2)}) is ${trendBullish ? 'above' : 'below'} EMA50 (${ema50.toFixed(2)}), with RSI14 at ${rsi14.toFixed(1)}.`
          : `${symbol} trading at ${liveMid.toFixed(2)}; technical indicators incomplete.`,
        packet.marketStructure
          ? `50-bar range spans ${packet.marketStructure.recentSwingLow} to ${packet.marketStructure.recentSwingHigh}.`
          : `Proposed ${side} entry at ${entry} vs. live mid ${liveMid}.`,
      ],
      risk:
        atr14 !== null
          ? `1H ATR14 is ${atr14.toFixed(2)}; stops tighter than 1x ATR risk premature sweep.`
          : 'Ensure stop sits beyond the nearest structural swing.',
      recommendation: techAligned
        ? `Technical structure aligns with the ${side} bias from ${entry}.`
        : `Momentum is ${techBias}; require a confirmed break-and-retest at ${entry}.`,
    },
    {
      persona: 'risk_manager',
      verdict: riskVerdict,
      confidence: stopGeometryValid ? (rrRatio && rrRatio >= 2 ? 8 : 7) : 4,
      keyPoints: [
        stop !== undefined
          ? `Stop at ${stop} (${stopGeometryValid ? 'valid side' : 'INVALID side of entry'}).`
          : 'No stop-loss provided — trade risk is uncapped.',
        rrRatio !== null
          ? `Reward-to-risk ratio is ${rrRatio.toFixed(2)}R (target ${target}).`
          : 'Target not specified; define a minimum 1.5R–2.0R objective.',
      ],
      risk: !stopGeometryValid
        ? 'Missing or inverted stop-loss is a hard risk violation.'
        : rrRatio !== null && rrRatio < 1.5
          ? `R:R of ${rrRatio.toFixed(2)}R is below the 1.5R institutional floor.`
          : 'Keep per-trade risk at or below 1% of account equity.',
      recommendation:
        stopGeometryValid && (rrRatio === null || rrRatio >= 1.5)
          ? 'Risk geometry passes; size position to 0.5%–1.0% account risk.'
          : 'Adjust stop and target to achieve at least 1.5R before entering.',
    },
  ];
}

function computeGradeAndGoNoGo(args: {
  side: 'long' | 'short';
  stop?: number;
  entry: number;
  target?: number;
  verdicts: CommitteeVerdict[];
}): { grade: ConveneCommitteeOutput['grade']; goNoGo: ConveneCommitteeOutput['goNoGo'] } {
  const { side, stop, entry, target, verdicts } = args;
  const desiredVerdict = side === 'long' ? 'bullish' : 'bearish';
  const alignedCount = verdicts.filter((v) => v.verdict === desiredVerdict).length;
  const opposedCount = verdicts.filter(
    (v) => v.verdict !== 'neutral' && v.verdict !== desiredVerdict,
  ).length;
  const validStop =
    stop !== undefined && (side === 'long' ? stop < entry : stop > entry);
  const rr =
    validStop && target !== undefined && Math.abs(entry - stop) > 0
      ? Math.abs(target - entry) / Math.abs(entry - stop)
      : null;

  if (!validStop && stop !== undefined) {
    return { grade: 'F', goNoGo: 'no-go' };
  }
  if (alignedCount === 3 && validStop && (rr === null || rr >= 1.8)) {
    return { grade: 'A', goNoGo: 'go' };
  }
  if (alignedCount >= 2 && (validStop || stop === undefined) && opposedCount === 0) {
    return { grade: 'B', goNoGo: validStop ? 'go' : 'caution' };
  }
  if (alignedCount >= 1 && opposedCount <= 1) {
    return { grade: 'C', goNoGo: 'caution' };
  }
  return { grade: 'D', goNoGo: 'no-go' };
}

export const conveneCommitteeTool = tool({
  description:
    'Convene the Kestrel 4-Expert Committee (Technical, Macro & News, Risk Manager, and Sentiment) to evaluate a specific trade setup (symbol, side, entry, stop, target) and return a graded Go/Caution/No-Go verdict card.',
  inputSchema: InputSchema,
  execute: async (
    { symbol, side, entry, stop, target, notes },
    options?: { abortSignal?: AbortSignal },
  ): Promise<ConveneCommitteeOutput> => {
    const ctx = maybeGetToolContext();
    const signal = options?.abortSignal ?? ctx?.signal ?? undefined;
    const packet = await collectSymbolResearchPacketCached(symbol, signal);
    if (packet.status === 'blocked' || !packet.price?.tick) {
      throw new Error(
        `Market data unavailable for ${symbol} (${packet.blockReason ?? 'missing live price'}). Cannot convene committee without verified market data.`,
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

    // Attempt full Mastra committee workflow when an operator/default model is available.
    try {
      const runId = crypto.randomUUID();
      const sanitizedNotes = notes ? sanitizeExternalText(notes, { maxChars: 300 }) : '';
      const prompt = [
        `Evaluate this proposed ${side.toUpperCase()} setup on ${symbol}:`,
        `- Entry: ${entry}`,
        stop !== undefined ? `- Stop: ${stop}` : '- Stop: not specified',
        target !== undefined ? `- Target: ${target}` : '- Target: not specified',
        sanitizedNotes ? `- Trader notes: ${sanitizedNotes}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const modeResult = await runMastraMode({
        prompt,
        symbol,
        userId: ctx?.userId ?? '00000000-0000-0000-0000-000000000000',
        threadId: ctx?.threadId ?? `convene-committee-${runId}`,
        runId,
        mode: 'full',
        ...(signal ? { signal } : {}),
        settings: {
          chatModel:
            ctx?.userSettings?.chatModel ??
            (process.env.AI_DEFAULT_MODEL as UserSettingsRow['chatModel']) ??
            'google:gemini-2.5-flash',
          aiApiKeys: (ctx?.userSettings?.aiApiKeys as Record<string, string> | null) ?? null,
          embeddingModel: ctx?.userSettings?.embeddingModel,
          agentModelOverrides: ctx?.userSettings?.agentModelOverrides,
        },
        env: {
          AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
          GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      });

      if (modeResult.agentOpinions && modeResult.agentOpinions.length > 0) {
        const opinions = modeResult.agentOpinions;
        const fundOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'fundamental');
        const techOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'technical');
        const riskOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'risk');
        const sentOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'sentiment');
        const economistVerdict = opinionToVerdict('economist', fundOp, fallbackVerdicts[0]!);
        if (sentOp?.reasoning && economistVerdict.keyPoints.length < 5) {
          economistVerdict.keyPoints.push(
            `Sentiment desk: ${sentOp.bias} (${Math.round(sentOp.confidence * 10)}/10)`,
          );
        }
        verdicts = [
          economistVerdict,
          opinionToVerdict('technician', techOp, fallbackVerdicts[1]!),
          opinionToVerdict('risk_manager', riskOp, fallbackVerdicts[2]!),
        ];
        consensusText = modeResult.finalText ?? '';
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      // Gracefully use deterministic packet-grounded verdicts when no LLM key is configured or on timeout.
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
      consensusText = `Team grade ${grade} (${goNoGo.toUpperCase()}) for ${side.toUpperCase()} ${symbol} at ${entry}${stop !== undefined ? `, stop ${stop}` : ''}${target !== undefined ? `, target ${target}` : ''}. Breakdown — ${verdictSummary}.`;
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
});
