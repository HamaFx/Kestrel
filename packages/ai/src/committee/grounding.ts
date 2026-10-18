// SPDX-License-Identifier: Apache-2.0

/**
 * Shared numeric grounding for committee text. Specialist opinions and the
 * fusion answer are both checked against the same packet evidence plus any
 * verified tool outputs returned by the specialist desks (Audit v3 Q8), so the
 * two verifiers cannot disagree about what counts as a supported number.
 */

import { extractNarrativeNumbers } from '../mastra-v2/agents/xauusd/report/report-grounding';
import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import type { MastraModeOpinion } from './types';

/** Evidence tolerance: legitimate integer rounding of indicator readings. */
export const EVIDENCE_TOLERANCE = 0.5;

/** Scenario-projection wording exempts forward-looking numbers from grounding. */
const SCENARIO_PROJECTION_TERMS =
  /\b(?:target|entry(?:\s+zone)?|invalidation|trigger|take.?profit|stop.?loss|tp|sl|risk.?reward)\b/i;

/** Characters on either side of a number that may carry its scenario wording. */
const SCENARIO_CONTEXT_CHARS = 24;

/**
 * Recursively extract finite numeric values from structured tool outputs so
 * numbers fetched by a specialist's domain tools are grounded in the verifier.
 */
export function extractNumbersFromToolOutput(value: unknown, depth = 0): number[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === 'number') {
    return Number.isFinite(value) ? [value] : [];
  }
  if (typeof value === 'string') {
    return extractNarrativeNumbers(value);
  }
  if (Array.isArray(value)) {
    const out: number[] = [];
    for (const item of value) {
      out.push(...extractNumbersFromToolOutput(item, depth + 1));
    }
    return out;
  }
  if (typeof value === 'object') {
    const out: number[] = [];
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === 't' || key === 'ts' || key === 'fetchedAt' || key === 'producedAt') continue;
      out.push(...extractNumbersFromToolOutput(entry, depth + 1));
    }
    return out;
  }
  return [];
}

export function packetEvidenceValues(
  packet: SymbolResearchPacket,
  opinions?: readonly Pick<MastraModeOpinion, 'rawData'>[],
): number[] {
  const values: number[] = [];
  if (packet.price) {
    values.push(packet.price.tick.bid, packet.price.tick.ask, packet.price.tick.mid);
  }
  if (packet.marketStructure) {
    values.push(
      packet.marketStructure.recentSwingHigh,
      packet.marketStructure.recentSwingLow,
      packet.marketStructure.rangeSize,
    );
  }
  for (const evidence of packet.timeframes ?? []) {
    for (const candle of evidence.candles ?? []) {
      values.push(candle.o, candle.h, candle.l, candle.c);
    }
    for (const indicator of evidence.indicators ?? []) {
      for (const result of indicator.values) {
        if (typeof result === 'number' && Number.isFinite(result)) values.push(result);
        else if (result && typeof result === 'object') {
          for (const nested of Object.values(result)) {
            if (typeof nested === 'number' && Number.isFinite(nested)) values.push(nested);
          }
        }
      }
    }
  }
  // §4.2: the XAUUSD macro extension is grounding evidence for macro
  // numbers (dollar index, real yields, event prints, headline numbers).
  for (const series of [
    packet.xauusdExtension?.dollarIndex,
    packet.xauusdExtension?.realYields,
    packet.xauusdExtension?.breakevenInflation,
  ]) {
    for (const point of series ?? []) values.push(point.value);
  }
  for (const event of packet.xauusdExtension?.events ?? []) {
    for (const print of [event.actual, event.forecast, event.previous]) {
      if (typeof print === 'number' && Number.isFinite(print)) values.push(print);
    }
  }
  for (const headline of packet.xauusdExtension?.newsHeadlines ?? []) {
    values.push(...extractNarrativeNumbers(headline.title));
  }
  // Audit v3 Phase 4 (Q8): merge numbers returned by specialist domain tools.
  for (const opinion of opinions ?? []) {
    const toolVals = opinion.rawData?.toolEvidenceValues;
    if (Array.isArray(toolVals)) {
      for (const v of toolVals) {
        if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
      }
    }
  }
  return values;
}

export function isSupportedByEvidence(value: number, evidenceValues: readonly number[]): boolean {
  return evidenceValues.some(
    (evidenceValue) => Math.abs(evidenceValue - value) <= EVIDENCE_TOLERANCE,
  );
}

/**
 * Narrative numbers in `text` that packet evidence cannot explain, excluding
 * scenario-projection wording. Each value is reported once, in order.
 */
export function ungroundedNarrativeNumbers(
  text: string,
  evidenceValues: readonly number[],
): number[] {
  const unsupported: number[] = [];
  for (const value of extractNarrativeNumbers(text)) {
    if (unsupported.includes(value)) continue;
    if (isSupportedByEvidence(value, evidenceValues)) continue;
    if (hasScenarioProjectionContext(text, value)) continue;
    unsupported.push(value);
  }
  return unsupported;
}

/**
 * Scenario wording must sit next to the number itself. Positions come from a
 * real `matchAll` over the same token pattern, so a repeated value is checked
 * at every occurrence rather than only at its first `indexOf` hit.
 */
function hasScenarioProjectionContext(text: string, value: number): boolean {
  for (const match of text.matchAll(NUMBER_TOKEN_PATTERN)) {
    if (Number(match[0].replaceAll(',', '')) !== value) continue;
    const start = match.index ?? 0;
    const windowStart = Math.max(0, start - SCENARIO_CONTEXT_CHARS);
    const windowEnd = Math.min(text.length, start + match[0].length + SCENARIO_CONTEXT_CHARS);
    if (SCENARIO_PROJECTION_TERMS.test(text.slice(windowStart, windowEnd))) return true;
  }
  return false;
}

const NUMBER_TOKEN_PATTERN = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
