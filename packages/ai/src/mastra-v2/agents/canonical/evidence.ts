/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { pluginHost } from '@kestrel/plugin-sdk';

import { EVIDENCE_TOLERANCE } from '@ai/committee/grounding';

import {
  extractNarrativeNumbers,
  extractNarrativeNumberTokens,
  type NarrativeNumberToken,
} from '../xauusd/report/report-grounding';
import { partitionNumbersByFreshness, type StaleNumber } from './freshness';

export interface CanonicalToolEvidence {
  name: string;
  resultText: string;
}

/**
 * A claim refused because its only freshness support was stale (R8): the
 * emitter's own envelope said the value came from a fallback cache or was
 * older than the tool's live window. Carried on the check so the refusal
 * message can name the datum and its age.
 */
export interface CanonicalStaleDatum {
  /** The claimed value whose only support is stale. */
  value: number;
  /** Datum label from the freshness envelope (`XAUUSD`, `XAUUSD 1h`). */
  label: string;
  /** `flagged` = fallback cache; `aged` = older than the emitter's live window. */
  reason: 'flagged' | 'aged';
  /** Seconds since the upstream observed the value; null when the envelope does not say. */
  ageSeconds: number | null;
}

export interface CanonicalEvidenceCheck {
  ok: boolean;
  findings: string[];
  numericClaimCount: number;
  /** Present when a claim was refused because its only support was stale (R8). */
  staleData?: CanonicalStaleDatum[];
}

/**
 * Tool names that count as evidence for numeric claims in a canonical reply.
 *
 * Core market tools match the lexical namespaces; the plugin namespaces
 * (`backtest_*`, `paper_*`, `custom_agent_run_script`, `delegate_to_agent_*`,
 * `telegram_*`, …) are included so plugin results can ground their own numbers
 * instead of tripping `CanonicalEvidenceBlockedError` (P0-5).
 */
const MARKET_TOOL_PATTERN =
  /price|candle|indicator|market|news|calendar|cot|sentiment|correlation|volatility|technical|fundamental|session|seasonality|risk|position|portfolio|journal|replay|verify|committee|knowledge|web_search|chart|packet|research|backtest|sweep|strategy|paper|account|order|agent|delegate|script|telegram/i;

/**
 * True when a called tool can ground market/account numbers — either a known
 * core namespace or any tool actually registered on the plugin host, so a
 * plugin tool with a novel id still counts once the plugin is installed.
 */
export function isEvidenceProvidingTool(toolName: string): boolean {
  if (MARKET_TOOL_PATTERN.test(toolName)) return true;
  return pluginHost.getTool(toolName) !== undefined;
}

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
 *
 * R8 (audit 2026-10-31): a value whose only support is a tool output the
 * emitter flagged stale (or that is older than the tool's documented live
 * window) does not ground. A value that also appears in a fresh output stays
 * grounded; the tolerance and every other check are unchanged.
 */
export function checkCanonicalEvidence(
  text: string,
  toolEvidence: readonly CanonicalToolEvidence[],
): CanonicalEvidenceCheck {
  const claims = collectCanonicalClaims(text);
  const marketTools = toolEvidence.filter((tool) => isEvidenceProvidingTool(tool.name));
  const findings: string[] = [];
  if (claims.length > 0 && marketTools.length === 0) {
    findings.push('numeric market claims were generated without a market-data tool result');
  } else if (claims.length > 0) {
    const { fresh, stale } = collectPartitionedEvidence(marketTools);
    const ungrounded = claims.filter(
      (claim) => !fresh.some((value) => Math.abs(value - claim) <= EVIDENCE_TOLERANCE),
    );
    const staleData: CanonicalStaleDatum[] = [];
    const invented: number[] = [];
    for (const claim of ungrounded) {
      const staleMatch = findStaleSupport(claim, stale);
      if (staleMatch === undefined) {
        invented.push(claim);
        continue;
      }
      const datum = staleDatumFor(claim, staleMatch);
      staleData.push(datum);
      findings.push(
        `numeric market claim ${claim} is supported only by stale ${datum.label} data (${describeStaleDatum(datum)}); a fresh tool result is required`,
      );
    }
    if (invented.length > 0) {
      findings.push(
        `numeric market claim(s) ${invented.join(', ')} were not found in the market-data tool output`,
      );
    }
    return {
      ok: findings.length === 0,
      findings,
      numericClaimCount: claims.length,
      ...(staleData.length > 0 ? { staleData } : {}),
    };
  }
  return { ok: findings.length === 0, findings, numericClaimCount: claims.length };
}

/**
 * Split every market tool's numeric values into fresh and stale using the
 * freshness envelope the output carries (R8). A non-JSON output discloses
 * nothing, so it grounds exactly as before.
 */
function collectPartitionedEvidence(marketTools: readonly CanonicalToolEvidence[]): {
  fresh: number[];
  stale: StaleNumber[];
} {
  const fresh: number[] = [];
  const stale: StaleNumber[] = [];
  for (const tool of marketTools) {
    const parsed = parseToolOutput(tool.resultText);
    if (parsed === undefined) {
      fresh.push(...extractNarrativeNumbers(tool.resultText));
      continue;
    }
    const partition = partitionNumbersByFreshness(parsed, { toolName: tool.name });
    fresh.push(...partition.fresh);
    stale.push(...partition.stale);
  }
  return { fresh, stale };
}

/** Parsed JSON output, or undefined when the result text is not JSON. */
function parseToolOutput(resultText: string): unknown {
  const trimmed = resultText.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** Closest stale value that could explain the claim, or undefined. */
function findStaleSupport(claim: number, stale: readonly StaleNumber[]): StaleNumber | undefined {
  let best: StaleNumber | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of stale) {
    const distance = Math.abs(candidate.value - claim);
    if (distance <= EVIDENCE_TOLERANCE && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function staleDatumFor(claim: number, stale: StaleNumber): CanonicalStaleDatum {
  return {
    value: claim,
    label: stale.entry.label,
    reason: stale.entry.staleReason === 'aged' ? 'aged' : 'flagged',
    ageSeconds: stale.entry.ageSeconds,
  };
}

export const CANONICAL_EVIDENCE_BLOCKED_MESSAGE =
  'I could not verify the numbers in that answer against market data, so I did not return it. Please ask again or request a fresh market check.';

/** How many stale data points the refusal message names before truncating. */
const MAX_STALE_DETAILS = 3;

/**
 * The refusal the user sees. The base sentence matches the historical
 * constant; when a value was refused because it was stale, the message also
 * names that datum and how old it was, so the user knows what to retry.
 */
export function canonicalEvidenceBlockedMessage(
  staleData: readonly CanonicalStaleDatum[] = [],
): string {
  if (staleData.length === 0) return CANONICAL_EVIDENCE_BLOCKED_MESSAGE;
  const details = staleData.slice(0, MAX_STALE_DETAILS).map(describeStaleDatumForUser);
  const extra =
    staleData.length > MAX_STALE_DETAILS
      ? ` (and ${staleData.length - MAX_STALE_DETAILS} more)`
      : '';
  return `${CANONICAL_EVIDENCE_BLOCKED_MESSAGE} ${details.join('; ')}${extra}`;
}

function describeStaleDatum(datum: CanonicalStaleDatum): string {
  return datum.reason === 'aged'
    ? `age ${formatAge(datum.ageSeconds)}, past its live window`
    : `served from a stale cache, ${datum.ageSeconds === null ? 'age unknown' : `age ${formatAge(datum.ageSeconds)}`}`;
}

function describeStaleDatumForUser(datum: CanonicalStaleDatum): string {
  if (datum.reason === 'aged') {
    return datum.ageSeconds === null
      ? `${datum.label} was older than its live window.`
      : `${datum.label} was ${formatAge(datum.ageSeconds)} old, past its live window.`;
  }
  return `${datum.label} was served from a stale cache${
    datum.ageSeconds === null ? '' : ` (age ${formatAge(datum.ageSeconds)})`
  }.`;
}

function formatAge(ageSeconds: number | null): string {
  return ageSeconds === null ? 'an unknown time' : `${Math.round(ageSeconds)}s`;
}

/**
 * Thrown instead of returning an answer whose numeric claims are unsupported
 * (audit plan §1.3, Q1: block hard, no repaired or degraded answer). When the
 * refusal came from a stale-only value, `message` names the datum and age.
 */
export class CanonicalEvidenceBlockedError extends Error {
  readonly code = 'CANONICAL_EVIDENCE_BLOCKED';

  constructor(
    readonly findings: readonly string[],
    readonly staleData: readonly CanonicalStaleDatum[] = [],
  ) {
    super(canonicalEvidenceBlockedMessage(staleData));
    this.name = 'CanonicalEvidenceBlockedError';
  }
}

export function assertCanonicalEvidence(evidence: CanonicalEvidenceCheck): void {
  if (!evidence.ok) {
    throw new CanonicalEvidenceBlockedError(evidence.findings, evidence.staleData ?? []);
  }
}
