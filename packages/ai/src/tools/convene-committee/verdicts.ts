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

// Verdict synthesis for the convene_committee tool: LLM opinion → verdict
// mapping and the deterministic packet-grounded fallback committee.

import { priceDecimals, type CommitteeVerdict, type ConveneCommitteeOutput } from '@kestrel/shared';

import type { MastraModeOpinion } from '../../committee/types';
import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';

export function opinionToVerdict(
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
    risk: missingEvidence[0] ?? assumptions[0] ?? fallback.risk,
    recommendation: sentences[sentences.length - 1] ?? fallback.recommendation,
  };
}

export function buildPacketGroundedFallbackVerdicts(args: {
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
      `Cannot synthesize fallback committee verdicts for ${symbol}: live market data packet is blocked (${packet.warnings.join(', ') || 'no live tick'}).`,
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
    (side === 'long' && techBias === 'bullish') || (side === 'short' && techBias === 'bearish');

  const stopDistance = stop !== undefined ? Math.abs(entry - stop) : null;
  const rewardDistance = target !== undefined ? Math.abs(target - entry) : null;
  const rrRatio =
    stopDistance && stopDistance > 0 && rewardDistance !== null
      ? rewardDistance / stopDistance
      : null;

  const stopGeometryValid =
    stop === undefined ? false : side === 'long' ? stop < entry : stop > entry;

  const riskVerdict: CommitteeVerdict['verdict'] =
    stopGeometryValid && (rrRatio === null || rrRatio >= 1.5)
      ? side === 'long'
        ? 'bullish'
        : 'bearish'
      : 'neutral';

  const macroEventsCount = packet.xauusdExtension?.events?.length ?? 0;
  const econVerdict: CommitteeVerdict['verdict'] = macroEventsCount > 2 ? 'neutral' : techBias;

  const candles = primaryEvidence?.candles ?? [];
  const openPrice = candles[0]?.o ?? liveMid;
  const changePct = openPrice > 0 ? ((liveMid - openPrice) / openPrice) * 100 : 0;

  const dec = priceDecimals(symbol);
  const atrDec = Math.max(2, dec);

  return [
    {
      persona: 'economist',
      verdict: econVerdict,
      confidence: macroEventsCount > 0 ? 7 : 6,
      keyPoints: [
        `${symbol} live mid price is ${liveMid.toFixed(dec)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%).`,
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
          ? `EMA20 (${ema20.toFixed(dec)}) is ${trendBullish ? 'above' : 'below'} EMA50 (${ema50.toFixed(dec)}), with RSI14 at ${rsi14.toFixed(1)}.`
          : `${symbol} trading at ${liveMid.toFixed(dec)}; technical indicators incomplete.`,
        packet.marketStructure
          ? `50-bar range spans ${packet.marketStructure.recentSwingLow} to ${packet.marketStructure.recentSwingHigh}.`
          : `Proposed ${side} entry at ${entry} vs. live mid ${liveMid.toFixed(dec)}.`,
      ],
      risk:
        atr14 !== null
          ? `1H ATR14 is ${atr14.toFixed(atrDec)}; stops tighter than 1x ATR risk premature sweep.`
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
    {
      persona: 'sentiment',
      verdict: 'neutral',
      confidence: 5,
      keyPoints: [
        `No live positioning or sentiment feed is attached to this deterministic review; ${symbol} last printed at ${liveMid.toFixed(dec)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%).`,
        macroEventsCount > 0
          ? `${macroEventsCount} scheduled macro event(s) can still reprice positioning before the setup resolves.`
          : 'No scheduled macro events are queued to reprice positioning near-term.',
      ],
      risk: 'Crowded one-way positioning can amplify a countertrend squeeze around key levels.',
      recommendation:
        'Treat sentiment as neutral and require price confirmation plus strict risk limits.',
    },
  ];
}
