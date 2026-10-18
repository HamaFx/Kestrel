/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { EVIDENCE_TOLERANCE } from '@ai/committee/grounding';
import {
  extractNarrativeNumbers,
  extractNarrativeNumberTokens,
  type NarrativeNumberToken,
} from '../xauusd/report/report-grounding';

export interface CanonicalToolEvidence {
  name: string;
  resultText: string;
}

export interface CanonicalEvidenceCheck {
  ok: boolean;
  findings: string[];
  numericClaimCount: number;
}

const MARKET_TOOL_PATTERN =
  /price|candle|indicator|market|news|calendar|cot|sentiment|correlation|volatility|technical|fundamental|session|seasonality|risk|position|portfolio|journal|replay|verify|committee|knowledge|web_search|chart|packet|research/i;

/**
 * Market-move/reading context that promotes an unsigned percentage to a claim.
 * Advice vocabulary (risk, size, account, equity) is deliberately absent so
 * "keep risk at 1%" and "size 0.5%" stay free.
 */
const PERCENT_CLAIM_CONTEXT_PATTERN =
  /\b(?:rsi|sma|ema|atr|macd|bollinger|adx|cot|positioning|sentiment|price|candles?|indicators?|session|swing|support|resistance|trend|momentum|volatility|yield|spread|rall(?:y|ied|ies)|sell-?off|drop(?:ped|s)?|gain(?:ed|s)?|loss|lost|rose|risen|rising|fall(?:ing|s|en)?|fell|declin\w*|surg\w*|climb(?:ed|s)?|mov(?:e|es|ed|ing)|chang(?:e|ed|es)|higher|lower|up|down)\b/i;

/**
 * Market-reading context that promotes a small integer to a claim (e.g. "RSI
 * at 72"). Indicator-period notation ("RSI 14") is structural and already
 * excluded before tokens reach this check.
 */
const READING_CLAIM_CONTEXT_PATTERN =
  /\b(?:rsi|sma|ema|atr|macd|bollinger|adx|stoch(?:astic)?|cot|positioning|percentile)\b/i;

const CLAIM_CONTEXT_RADIUS = 32;

/**
 * Price-band filter (audit plan §1.3): only market-like magnitudes count as
 * claims — decimal fractions (quotes, rates) and thousand-plus values (metals,
 * indices, crypto). Small integers stay free unless they read as an indicator
 * or positioning value (P1-06), so benign prose never trips the gate.
 */
function isMarketLikeClaim(value: number): boolean {
  return !Number.isInteger(value) || Math.abs(value) >= 1000;
}

function contextAround(text: string, token: NarrativeNumberToken): string {
  return text.slice(
    Math.max(0, token.start - CLAIM_CONTEXT_RADIUS),
    Math.min(text.length, token.end + CLAIM_CONTEXT_RADIUS),
  );
}

function isPercentToken(text: string, token: NarrativeNumberToken): boolean {
  return /^\s*%/.test(text.slice(token.end, token.end + 2));
}

/**
 * P1-06: percentages used to be stripped from the text and never verified, so
 * "gold is up 4%" could never fail the gate. A percentage is now a claim when:
 * - it carries an explicit `+`/`-` sign that is not a range continuation
 *   ("0.5%-1.0% account risk" stays free), or
 * - a market keyword (never advice vocabulary) appears beside it.
 */
function isPercentClaim(text: string, token: NarrativeNumberToken): boolean {
  const leading = text[token.start];
  if (leading === '+' || leading === '-') {
    const isRangeContinuation =
      leading === '-' && /[0-9%]\s*$/.test(text.slice(Math.max(0, token.start - 2), token.start));
    if (!isRangeContinuation) return true;
  }
  return PERCENT_CLAIM_CONTEXT_PATTERN.test(contextAround(text, token));
}

function collectCanonicalClaims(text: string): number[] {
  const claims = new Set<number>();
  for (const token of extractNarrativeNumberTokens(text)) {
    if (isPercentToken(text, token)) {
      if (isPercentClaim(text, token)) claims.add(token.value);
      continue;
    }
    if (isMarketLikeClaim(token.value)) {
      claims.add(token.value);
      continue;
    }
    if (READING_CLAIM_CONTEXT_PATTERN.test(contextAround(text, token))) {
      claims.add(token.value);
    }
  }
  return [...claims];
}

/**
 * Post-generation guard for canonical chat (audit plan §1.3, P0-3). A numeric
 * market claim requires a market-data tool result, and the claimed value must
 * actually appear in that tool's output — tool presence alone is not evidence.
 * Dates, years, and timeframes are structural and never claimed. Percentages
 * are claims when signed or next to market context, and small integers are
 * claims when they read as an indicator/positioning value (P1-06).
 */
export function checkCanonicalEvidence(
  text: string,
  toolEvidence: readonly CanonicalToolEvidence[],
): CanonicalEvidenceCheck {
  const claims = collectCanonicalClaims(text);
  const marketTools = toolEvidence.filter((tool) => MARKET_TOOL_PATTERN.test(tool.name));
  const findings: string[] = [];
  if (claims.length > 0 && marketTools.length === 0) {
    findings.push('numeric market claims were generated without a market-data tool result');
  } else if (claims.length > 0) {
    const evidenceValues = extractNarrativeNumbers(
      marketTools.map((tool) => tool.resultText).join('\n'),
    );
    const ungrounded = claims.filter(
      (claim) => !evidenceValues.some((value) => Math.abs(value - claim) <= EVIDENCE_TOLERANCE),
    );
    if (ungrounded.length > 0) {
      findings.push(
        `numeric market claim(s) ${ungrounded.join(', ')} were not found in the market-data tool output`,
      );
    }
  }
  return { ok: findings.length === 0, findings, numericClaimCount: claims.length };
}

export const CANONICAL_EVIDENCE_BLOCKED_MESSAGE =
  'I could not verify the numbers in that answer against market data, so I did not return it. Please ask again or request a fresh market check.';

/**
 * Thrown instead of returning an answer whose numeric claims are unsupported
 * (audit plan §1.3, Q1: block hard, no repaired or degraded answer).
 */
export class CanonicalEvidenceBlockedError extends Error {
  readonly code = 'CANONICAL_EVIDENCE_BLOCKED';

  constructor(readonly findings: readonly string[]) {
    super(CANONICAL_EVIDENCE_BLOCKED_MESSAGE);
    this.name = 'CanonicalEvidenceBlockedError';
  }
}

export function assertCanonicalEvidence(evidence: CanonicalEvidenceCheck): void {
  if (!evidence.ok) throw new CanonicalEvidenceBlockedError(evidence.findings);
}
