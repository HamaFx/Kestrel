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

import type { XauusdResearchPacket } from '@ai/mastra-v2/packets/research-types';
import type { XauusdResearchReport } from './report-types';

export function availableEvidenceIds(packet: XauusdResearchPacket): Set<string> {
  return new Set([
    ...(packet.price ? [packet.price.evidenceId] : []),
    ...packet.candles.map((evidence) => evidence.evidenceId),
    ...packet.indicators.map((evidence) => evidence.evidenceId),
    ...(packet.macro ? [packet.macro.evidenceId] : []),
  ]);
}

export function addUnsupportedIds(
  ids: readonly string[],
  available: ReadonlySet<string>,
  findings: string[],
  field: string,
): void {
  for (const id of ids) {
    if (!available.has(id)) findings.push(`${field} references unknown evidence ID: ${id}`);
  }
}

function numericEvidenceValues(packet: XauusdResearchPacket): Map<string, number[]> {
  const values = new Map<string, number[]>();
  if (packet.price) {
    values.set(packet.price.evidenceId, [
      packet.price.data.tick.bid,
      packet.price.data.tick.ask,
      packet.price.data.tick.mid,
    ]);
  }
  for (const evidence of packet.candles) {
    values.set(
      evidence.evidenceId,
      evidence.data.candles.flatMap((candle) => [candle.o, candle.h, candle.l, candle.c]),
    );
  }
  for (const evidence of packet.indicators) {
    const indicatorValues: number[] = [];
    for (const result of evidence.data.results) {
      for (const value of result.values) {
        if (typeof value === 'number' && Number.isFinite(value)) indicatorValues.push(value);
        else if (value && typeof value === 'object') {
          for (const nested of Object.values(value)) {
            if (typeof nested === 'number' && Number.isFinite(nested)) indicatorValues.push(nested);
          }
        }
      }
    }
    values.set(evidence.evidenceId, indicatorValues);
  }
  if (packet.macro) {
    values.set(packet.macro.evidenceId, [
      ...packet.macro.data.dollarIndex.map((item) => item.value),
      ...packet.macro.data.realYields.map((item) => item.value),
      ...packet.macro.data.breakevenInflation.map((item) => item.value),
      ...packet.macro.data.events.flatMap((item) =>
        [item.actual, item.forecast, item.previous].filter(
          (value): value is number => value !== null,
        ),
      ),
    ]);
  }
  return values;
}

/**
 * Audit plan §1.6 (P0-6) — projection band. A forward-looking value is exempt
 * from exact-value grounding only while it stays PLAUSIBLY derived from the
 * evidence it cites: within ±25% of at least one numeric value of the
 * referenced evidence. The band is deliberately generous (a quarter move in
 * gold is already an extreme scenario) yet still rejects invented levels such
 * as a 9,999 target cited against a 2,345 price.
 */
const PROJECTION_BAND_RATIO = 0.25;

function withinProjectionBand(projection: number, evidenceValue: number): boolean {
  return Math.abs(projection - evidenceValue) <= Math.abs(evidenceValue) * PROJECTION_BAND_RATIO;
}

/**
 * Audit plan §1.6 (P0-6) — numeric claims are grounded by the explicit schema
 * `role` field, never by keywords in the model-authored `label`. The previous
 * `isStructuralParameterClaim`/`isScenarioProjectionClaim` label exemptions
 * let the model label any fabricated number (for example "Target 9999") to
 * skip verification entirely.
 *
 * - `role: 'observed'` (the schema default): the value must match the cited
 *   evidence within the claim's tolerance, as before.
 * - `role: 'projection'`: a forward-looking level exempt from the exact
 *   match, but only while it lies inside the projection band of the cited
 *   evidence values.
 *
 * Claims citing an evidence ID that carries no numeric values fail closed;
 * unknown evidence IDs are reported separately by the verifier.
 */
export function verifyNumericClaims(
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  findings: string[],
): void {
  const evidenceValues = numericEvidenceValues(packet);
  for (const [index, claim] of report.numericClaims.entries()) {
    const values = evidenceValues.get(claim.evidenceId);
    if (!values) continue;
    if (claim.role === 'projection') {
      const anchored = values.some((value) => withinProjectionBand(claim.value, value));
      if (!anchored) {
        findings.push(
          `report.numericClaims[${index}] projection is not plausibly derived from evidence ${claim.evidenceId}: ${claim.label}`,
        );
      }
      continue;
    }
    const supported = values.some((value) => Math.abs(value - claim.value) <= claim.tolerance);
    if (!supported) {
      findings.push(
        `report.numericClaims[${index}] is not supported by evidence ${claim.evidenceId}: ${claim.label}`,
      );
    }
  }
}

const STRUCTURAL_NUMERIC_PATTERN =
  /(?:\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:in|since|year|years|by)\s+\d{4}\b|\b\d+(?:\s*[- ]?(?:minute|hour|day|week|year)s?)\b|\b\d+(?:m|h|d|w|y)\b|\b(?:ema|rsi|atr|bollinger(?:\s+bands)?|bb|macd)\s*\d+(?:\s*\/\s*\d+)*\b|\b\d+(?:\s*\/\s*\d+)+\s*(?:ema|sma|ma|macd)\b|\b\d+(?:\s*(?:-|and|&|,)\s*\d+)*\s*(?:period|bar|length|window|lookback)s?\b|\b(?:period|bar|length|window|lookback)\s*\d+\b|\b\d+\s*(?:-|\/)?\s*(?:period|bar|length|window|lookback)\s*(?:ema|sma|ma|macd|rsi)\b)/gi;
const NARRATIVE_NUMBER_PATTERN = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

type NarrativeField = readonly [name: string, text: string];

function narrativeFields(report: XauusdResearchReport): NarrativeField[] {
  const fields: NarrativeField[] = [
    ['bottomLine', report.bottomLine],
    ['regime', report.regime],
    ['technicalSummary', report.technicalSummary],
    ['fundamentalSummary', report.fundamentalSummary],
    ...report.contradictions.map((text, index) => [`contradictions[${index}]`, text] as const),
    ...report.missingData.map((text, index) => [`missingData[${index}]`, text] as const),
  ];

  report.scenarios.forEach((scenario, index) => {
    // Scenario trigger, entryZone, targets, and invalidation are projections,
    // not factual claims: their numbers are exempt from exact-value narrative
    // grounding and are instead anchored by scenario.evidenceIds plus the
    // projection band (see verifyScenarioProjectionClaims).
    fields.push(
      [`scenarios[${index}].name`, scenario.name],
      ...scenario.risks.map(
        (text, riskIndex) => [`scenarios[${index}].risks[${riskIndex}]`, text] as const,
      ),
    );
  });

  return fields;
}

function structuralNumericRanges(text: string): Array<readonly [start: number, end: number]> {
  return [...text.matchAll(STRUCTURAL_NUMERIC_PATTERN)].map(
    (match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as const,
  );
}

/**
 * One tokenized narrative number with its source position. Positions let
 * callers classify the token from its surrounding context (P1-06: "RSI at 72"
 * is a market claim, "risk 1%" is not) without re-tokenizing the text.
 */
export interface NarrativeNumberToken {
  /** Numeric value with thousands separators stripped. */
  value: number;
  /** Exact matched text, including a leading sign when present. */
  raw: string;
  /** Index of the first matched character in the source text. */
  start: number;
  /** Index just past the last matched character in the source text. */
  end: number;
}

/**
 * Audit plan §1.4 — narrative number extraction is shared with the committee
 * fusion verifier so both grounding checks tokenize market prose identically.
 * Structural numerics (timeframes, indicator periods, date-like notation) are
 * excluded; every other numeric token is returned with its source position.
 */
export function extractNarrativeNumberTokens(text: string): NarrativeNumberToken[] {
  const structuralRanges = structuralNumericRanges(text);
  const tokens: NarrativeNumberToken[] = [];
  for (const match of text.matchAll(NARRATIVE_NUMBER_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (structuralRanges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd)) {
      continue;
    }
    const value = Number(match[0].replaceAll(',', ''));
    if (Number.isFinite(value)) tokens.push({ value, raw: match[0], start, end });
  }
  return tokens;
}

/**
 * Audit plan §1.4 — value-only view of the shared narrative tokenizer.
 */
export function extractNarrativeNumbers(text: string): number[] {
  return extractNarrativeNumberTokens(text).map((token) => token.value);
}

function narrativeNumbers(text: string): number[] {
  return extractNarrativeNumbers(text);
}

/**
 * Narrative text may explain a verified number, but it cannot introduce a
 * second numeric channel. Timeframe and indicator-period notation is
 * structural context; every other numeric value must match a verified claim.
 *
 * Scenario trigger/entryZone/targets/invalidation fields are deliberately
 * excluded: those are forward-looking projections anchored by their
 * evidenceIds and the projection band (verifyScenarioProjectionClaims)
 * rather than exact-value matches.
 */
export function verifyNarrativeNumericClaims(
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  findings: string[],
): void {
  const claims = report.numericClaims.map((claim) => ({
    value: claim.value,
    tolerance: claim.tolerance,
  }));
  // A narrative number is grounded when it matches a formal numericClaim OR
  // when it appears directly in the evidence packet (for example an indicator
  // reading the model quotes in prose but did not duplicate into numericClaims).
  // Requiring every quoted indicator value to be re-listed as a numericClaim
  // made the lite models fail closed on values they had read correctly.
  const evidenceValues = [...numericEvidenceValues(packet).values()].flatMap((values) => values);
  const reported = new Set<string>();

  for (const [field, text] of narrativeFields(report)) {
    for (const value of narrativeNumbers(text)) {
      const key = `${field}:${value}`;
      if (reported.has(key)) continue;
      reported.add(key);
      const supported =
        claims.some((claim) => Math.abs(claim.value - value) <= claim.tolerance) ||
        evidenceValues.some(
          // The evidence-value channel accepts legitimate integer rounding of
          // indicator readings (e.g. quoting RSI as 60 when the packet has
          // 60.42). Formal numericClaims still require the tight 0.01 window.
          (evidenceValue) => Math.abs(evidenceValue - value) <= 0.5,
        );
      if (!supported) {
        findings.push(
          `${field} contains unsupported numeric value ${value}; add it to numericClaims with supporting evidence.`,
        );
      }
    }
  }
}

/**
 * Audit plan §1.3 precedent (see canonical evidence): free-text prose only
 * carries market-like magnitudes — decimal fractions (rates, quotes) and
 * thousand-plus values (metals, indices). Small integers stay free (counts,
 * RSI-style readings) so benign scenario wording never trips the band gate.
 */
function isMarketLikeProjection(value: number): boolean {
  return !Number.isInteger(value) || Math.abs(value) >= 1000;
}

/**
 * Audit plan §1.6 (P0-6) — scenario trigger, entryZone, targets, and
 * invalidation are the schema's explicit projection channel. They stay exempt
 * from exact-value grounding, but each market-like number they contain must
 * now be anchored: within the projection band of at least one value of the
 * scenario's own evidenceIds. A scenario number is no longer unchecked merely
 * because the cited evidence IDs exist — a "9,999 target" fails against a
 * 2,345 price.
 */
export function verifyScenarioProjectionClaims(
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  findings: string[],
): void {
  const evidenceValues = numericEvidenceValues(packet);
  report.scenarios.forEach((scenario, index) => {
    const anchoredValues = scenario.evidenceIds.flatMap((id) => evidenceValues.get(id) ?? []);
    const fields: NarrativeField[] = [
      [`scenarios[${index}].trigger`, scenario.trigger],
      [`scenarios[${index}].invalidation`, scenario.invalidation],
    ];
    if (scenario.entryZone) fields.push([`scenarios[${index}].entryZone`, scenario.entryZone]);
    scenario.targets.forEach((text, targetIndex) =>
      fields.push([`scenarios[${index}].targets[${targetIndex}]`, text]),
    );

    for (const [field, text] of fields) {
      const seen = new Set<number>();
      for (const value of narrativeNumbers(text)) {
        if (!isMarketLikeProjection(value) || seen.has(value)) continue;
        seen.add(value);
        const anchored = anchoredValues.some((evidenceValue) =>
          withinProjectionBand(value, evidenceValue),
        );
        if (!anchored) {
          findings.push(
            `${field} contains projection value ${value} outside the grounding band of the referenced evidence ID values`,
          );
        }
      }
    }
  });
}
