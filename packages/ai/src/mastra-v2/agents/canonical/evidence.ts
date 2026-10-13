/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { EVIDENCE_TOLERANCE } from '../../../committee/grounding';
import { extractNarrativeNumbers } from '../xauusd/report/report-grounding';

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
  /price|candle|indicator|market|news|calendar|cot|sentiment|correlation|volatility/i;

const PERCENT_CLAIM_PATTERN = /\d+(?:\.\d+)?\s*%/g;

/**
 * Price-band filter (audit plan §1.3): only market-like magnitudes count as
 * claims — decimal fractions (quotes, rates) and thousand-plus values (metals,
 * indices, crypto). Small integers stay free (counts, arithmetic, RSI-style
 * readings), so benign prose never trips the gate.
 */
function isMarketLikeClaim(value: number): boolean {
  return !Number.isInteger(value) || Math.abs(value) >= 1000;
}

/**
 * Post-generation guard for canonical chat (audit plan §1.3, P0-3). A numeric
 * market claim requires a market-data tool result, and the claimed value must
 * actually appear in that tool's output — tool presence alone is not evidence.
 * Dates, years, timeframes, and percentages are structural and never claimed.
 */
export function checkCanonicalEvidence(
  text: string,
  toolEvidence: readonly CanonicalToolEvidence[],
): CanonicalEvidenceCheck {
  const claimText = text.replace(PERCENT_CLAIM_PATTERN, ' ');
  const claims = [
    ...new Set(extractNarrativeNumbers(claimText).filter(isMarketLikeClaim)),
  ];
  const marketTools = toolEvidence.filter((tool) => MARKET_TOOL_PATTERN.test(tool.name));
  const findings: string[] = [];
  if (claims.length > 0 && marketTools.length === 0) {
    findings.push('numeric market claims were generated without a market-data tool result');
  } else if (claims.length > 0) {
    const evidenceValues = extractNarrativeNumbers(
      marketTools.map((tool) => tool.resultText).join('\n'),
    );
    const ungrounded = claims.filter(
      (claim) =>
        !evidenceValues.some((value) => Math.abs(value - claim) <= EVIDENCE_TOLERANCE),
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
