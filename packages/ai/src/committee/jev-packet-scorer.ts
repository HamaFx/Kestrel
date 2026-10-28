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
 * Phase 2 (Jev System One) — "Jev Scores, LLM Explains" pre-specialist packet
 * calibration.
 *
 * Before any specialist LLM runs, one parallel `/v1/systemone` batch scores
 * the deterministic `SymbolResearchPacket` into calibrated
 * `bullish/bearish/neutral` probabilities, a volatility regime and a setup
 * clarity score. The distributions travel into the desk prompts as a
 * statistical reference anchor and blend into each desk's reported confidence
 * (70% Jev / 30% LLM).
 *
 * Security invariant (Check Point indirect evidence poisoning): the request
 * `state` is built ONLY from deterministic numeric/metadata fields —
 * `newsHeadlines`, `genericMacro.news`, and every other free-form external
 * prose field are stripped before the call. A poisoned headline can therefore
 * never flip the calibrated probability the desks anchor on.
 */

import { clamp01 } from '../jev/calibration';
import { evaluateJev } from '../jev/client';
import type {
  JevChoiceAnswer,
  JevEnv,
  JevGenerationLedger,
  JevScoreAnswer,
  JevSettings,
} from '../jev/types';
import { sanitizeExternalText } from '../mastra-v2/packets/external-content';
import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import type { MastraSpecialistName } from './types';

/** Per-call budget. Calibration is an auxiliary call — must never stall a run. */
export const JEV_PACKET_SCORER_TIMEOUT_MS = 800;

/** Weight of the calibrated Jev confidence in the specialist blend. */
export const JEV_CONFIDENCE_BLEND_WEIGHT = 0.7;

/** Max candles per timeframe carried into the Jev state. */
const STATE_CANDLES_PER_TIMEFRAME = 5;

/** Max macro series points per series carried into the Jev state. */
const STATE_MACRO_SERIES_POINTS = 5;

/** Event names are truncated/sanitized before leaving the process. */
const STATE_EVENT_NAME_CHARS = 60;

export interface JevPacketCalibration {
  /** Calibrated technical desk distribution (bullish/bearish/neutral). */
  technicalBias: JevChoiceAnswer;
  /** Calibrated fundamental desk distribution (bullish/bearish/neutral). */
  fundamentalBias: JevChoiceAnswer;
  /** Volatility regime score: Compressed | Normal | Elevated | Extreme. */
  riskRegime: JevScoreAnswer;
  /** Setup clarity score: Noisy/Choppy | Moderate | High-Clarity. */
  setupQualityScore: JevScoreAnswer;
  /** Mean calibrated confidence across the four answers. */
  calibratedConfidence: number;
  providerId: string;
  model: string;
  latencyMs: number;
  costUsd: number;
}

export interface ScorePacketWithJevOptions {
  settings?: JevSettings | null | undefined;
  env?: JevEnv | null | undefined;
  signal?: AbortSignal | null | undefined;
  fetchImpl?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
  ledger?: JevGenerationLedger | null | undefined;
  ledgerEntryId?: string | undefined;
}

/** Last `n` numeric points of a macro series, dropping prose fields. */
function lastSeriesPoints(
  series: readonly { asOf: string; value: number }[] | undefined,
  n = STATE_MACRO_SERIES_POINTS,
): Array<{ asOf: string; value: number }> {
  if (!Array.isArray(series)) return [];
  return series.slice(-n).map((point) => ({ asOf: point.asOf, value: point.value }));
}

/**
 * Build the ONLY state ever sent to the packet-calibration Jev call.
 * Deterministic numerics and metadata only: prices, candles, indicators,
 * market structure, macro series, and numeric calendar prints. Free-form
 * external prose (news headlines, macro news) is never included.
 */
export function buildDeterministicNumericPacketState(
  packet: SymbolResearchPacket,
): Record<string, unknown> {
  const state: Record<string, unknown> = {
    symbol: packet.symbol,
    status: packet.status,
    dataQuality: packet.dataQuality,
  };

  if (packet.price) {
    state.price = {
      freshness: packet.price.freshness,
      quality: packet.price.quality,
      tick: packet.price.tick
        ? {
            bid: packet.price.tick.bid,
            ask: packet.price.tick.ask,
            mid: packet.price.tick.mid,
            ts: packet.price.tick.ts,
          }
        : null,
    };
  }

  if (packet.marketStructure) {
    state.marketStructure = {
      recentSwingHigh: packet.marketStructure.recentSwingHigh,
      recentSwingLow: packet.marketStructure.recentSwingLow,
      rangeSize: packet.marketStructure.rangeSize,
    };
  }

  state.timeframes = packet.timeframes.map((tf) => ({
    timeframe: tf.timeframe,
    freshness: tf.freshness,
    quality: tf.quality,
    candles: tf.candles.slice(-STATE_CANDLES_PER_TIMEFRAME).map((candle) => ({
      t: candle.t,
      o: candle.o,
      h: candle.h,
      l: candle.l,
      c: candle.c,
    })),
    indicators: tf.indicators.map((indicator) => ({
      kind: indicator.kind,
      params: indicator.params,
      latest: indicator.values.slice(-STATE_CANDLES_PER_TIMEFRAME),
    })),
  }));

  const macro = packet.xauusdExtension;
  if (macro) {
    state.xauusdExtension = {
      dollarIndex: lastSeriesPoints(macro.dollarIndex),
      realYields: lastSeriesPoints(macro.realYields),
      breakevenInflation: lastSeriesPoints(macro.breakevenInflation),
      events: macro.events.slice(-STATE_MACRO_SERIES_POINTS).map((event) => ({
        name: sanitizeExternalText(event.name, STATE_EVENT_NAME_CHARS),
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
      })),
      // Count only — the headline titles themselves are untrusted prose and
      // must never reach a calibration/routing Jev call.
      newsCount: macro.newsCount,
    };
  }

  const generic = packet.genericMacro;
  if (generic) {
    state.genericMacro = {
      events: generic.events.slice(-STATE_MACRO_SERIES_POINTS).map((event) => ({
        date: event.date,
        currency: event.currency,
        name: sanitizeExternalText(event.name, STATE_EVENT_NAME_CHARS),
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
      })),
      cot: (generic.cot ?? []).slice(-1).map((row) => ({
        reportDate: row.reportDate,
        dealerNet: row.dealerNet,
        assetNet: row.assetNet,
        leveragedNet: row.leveragedNet,
        otherNet: row.otherNet,
      })),
    };
  }

  return state;
}

/**
 * "Jev Scores, LLM Explains" — ask Jev for calibrated technical/fundamental
 * bias distributions and regime/clarity scores in one parallel batch.
 * Returns null when Jev is unconfigured, times out, or the packet is not
 * ready; callers then keep the uncalibrated LLM-only flow.
 */
export async function scorePacketWithJev(
  packet: SymbolResearchPacket,
  options: ScorePacketWithJevOptions = {},
): Promise<JevPacketCalibration | null> {
  if (packet.status !== 'ready') return null;

  const result = await evaluateJev({
    state: buildDeterministicNumericPacketState(packet),
    questions: {
      technical_bias: {
        type: 'choice',
        instructions:
          'Given only the deterministic price, candle, indicator, and market-structure data, what is the technical desk directional bias for this symbol?',
        criteria: {
          bullish: 'Structure, momentum, and levels favor upside continuation',
          bearish: 'Structure, momentum, and levels favor downside continuation',
          neutral: 'Range-bound or contradictory technical evidence',
        },
      },
      fundamental_bias: {
        type: 'choice',
        instructions:
          'Given only the deterministic macro series and calendar prints, what is the fundamental desk directional bias for this symbol?',
        criteria: {
          bullish: 'Macro transmission favors upside (e.g. softer real yields / weaker USD for gold)',
          bearish: 'Macro transmission favors downside',
          neutral: 'Macro evidence is balanced or insufficient',
        },
      },
      volatility_regime: {
        type: 'score',
        instructions: 'Classify the current volatility regime from recent candle ranges and ATR.',
        criteria: ['Compressed', 'Normal', 'Elevated', 'Extreme'],
      },
      setup_clarity: {
        type: 'score',
        instructions:
          'How clear and institutional-quality is the current setup, given structure, alignment, and data quality?',
        criteria: ['Noisy/Choppy', 'Moderate', 'High-Clarity Institutional Setup'],
      },
    },
    ...(options.settings !== undefined ? { settings: options.settings } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    timeoutMs: options.timeoutMs ?? JEV_PACKET_SCORER_TIMEOUT_MS,
    ...(options.ledger !== undefined ? { ledger: options.ledger } : {}),
    ledgerEntryId: options.ledgerEntryId ?? 'packet-calibration',
  });
  if (!result) return null;

  const { technical_bias, fundamental_bias, volatility_regime, setup_clarity } = result.answers;
  return {
    technicalBias: technical_bias,
    fundamentalBias: fundamental_bias,
    riskRegime: volatility_regime,
    setupQualityScore: setup_clarity,
    calibratedConfidence: clamp01(
      (technical_bias.confidence +
        fundamental_bias.confidence +
        volatility_regime.confidence +
        setup_clarity.confidence) /
        4,
    ),
    providerId: result.providerId,
    model: result.model,
    latencyMs: result.latencyMs,
    costUsd: result.costUsd,
  };
}

/**
 * The calibrated confidence a desk anchors on:
 *   - technical  → technical bias distribution
 *   - fundamental→ fundamental bias distribution
 *   - risk       → volatility regime score
 *   - sentiment  → aggregate calibrated confidence (positioning has no
 *                  dedicated Jev question)
 */
export function deskJevConfidence(
  calibration: JevPacketCalibration,
  desk: MastraSpecialistName,
): number {
  switch (desk) {
    case 'technical':
      return calibration.technicalBias.confidence;
    case 'fundamental':
      return calibration.fundamentalBias.confidence;
    case 'risk':
      return calibration.riskRegime.confidence;
    case 'sentiment':
      return calibration.calibratedConfidence;
  }
}

/**
 * Blend the LLM's self-reported confidence with the calibrated Jev
 * confidence: 70% Jev / 30% LLM. Without a calibration the LLM value passes
 * through unchanged.
 */
export function blendSpecialistConfidence(
  llmConfidence: number,
  jevConfidence?: number | null,
): number {
  const llm = clamp01(llmConfidence);
  if (jevConfidence === undefined || jevConfidence === null || !Number.isFinite(jevConfidence)) {
    return llm;
  }
  const jev = clamp01(jevConfidence);
  return clamp01(JEV_CONFIDENCE_BLEND_WEIGHT * jev + (1 - JEV_CONFIDENCE_BLEND_WEIGHT) * llm);
}

/** One-line distribution renderer for the specialist prompt anchor. */
function renderDistribution(probabilities: Record<string, number>): string {
  const entries = Object.entries(probabilities);
  if (entries.length === 0) return 'n/a';
  return entries.map(([label, p]) => `${label} ${p.toFixed(2)}`).join(', ');
}

/**
 * Compact "statistical reference anchor" block appended to every desk prompt
 * when a calibration is present. The desks may disagree with it, but they must
 * reason in its presence.
 */
export function jevCalibrationBlock(calibration: JevPacketCalibration): string {
  return [
    'JEV CALIBRATED REFERENCE (deterministic statistical anchor; you may disagree, but address it):',
    `- Technical bias: ${renderDistribution(calibration.technicalBias.probabilities)}`,
    `- Fundamental bias: ${renderDistribution(calibration.fundamentalBias.probabilities)}`,
    `- Volatility regime score: ${calibration.riskRegime.score.toFixed(2)} (Compressed..Extreme)`,
    `- Setup clarity score: ${calibration.setupQualityScore.score.toFixed(2)} (Noisy..High-Clarity)`,
  ].join('\n');
}
