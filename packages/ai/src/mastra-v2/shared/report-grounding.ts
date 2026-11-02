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

// Shared narrative-number tokenizer (Phase 4 move from the retired XAUUSD
// report verifier). The committee fusion verifier and the canonical evidence
// checks both use it so market prose is tokenized identically everywhere.
//
// Audit plan §1.4: structural numerics (timeframes, indicator periods,
// date-like notation) are excluded; every other numeric token is returned with
// its source position so callers can classify it from context.

const STRUCTURAL_NUMERIC_PATTERN =
  /(?:\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:in|since|year|years|by)\s+\d{4}\b|\b\d+(?:\s*[- ]?(?:minute|hour|day|week|year)s?)\b|\b\d+(?:m|h|d|w|y)\b|\b(?:ema|rsi|atr|bollinger(?:\s+bands)?|bb|macd)\s*\d+(?:\s*\/\s*\d+)*\b|\b\d+(?:\s*\/\s*\d+)+\s*(?:ema|sma|ma|macd)\b|\b\d+(?:\s*(?:-|and|&|,)\s*\d+)*\s*(?:period|bar|length|window|lookback)s?\b|\b(?:period|bar|length|window|lookback)\s*\d+\b|\b\d+\s*(?:-|\/)?\s*(?:period|bar|length|window|lookback)\s*(?:ema|sma|ma|macd|rsi)\b)/gi;
const NARRATIVE_NUMBER_PATTERN = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

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

function structuralNumericRanges(text: string): Array<readonly [start: number, end: number]> {
  return [...text.matchAll(STRUCTURAL_NUMERIC_PATTERN)].map(
    (match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as const,
  );
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
