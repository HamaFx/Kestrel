/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { ALL_SYMBOLS, isKnownSymbol, normalizeSymbol } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import {
  BROAD_MUTATION_TERMS,
  DEEP_RESEARCH_TERMS,
  FOLLOWUP_TERMS,
  FORBIDDEN_FOLLOWUP_TERMS,
  INJECTION_TERMS,
  isHighConfidenceMutationIntent,
  OTHER_SYMBOL_TERMS,
  XAUUSD_TERMS,
} from '../../routing-keywords';

/**
 * Q2 decision (docs/plans/decisions.log.md): exactly two analysis modes exist
 * — `single` and `full`. The Q8 shim removal (audit plan §4.6) retired the
 * one-release compat shim: legacy `quick`/`standard`/`auto` values are
 * rejected at every boundary (HTTP schemas, durable plan parsing) instead of
 * being mapped for old clients.
 */
export type AnalysisMode = 'single' | 'full';
export type ResolvedMode = 'single' | 'full';

/**
 * Two-mode heuristic detector (`single` vs `full`). Exported utility only —
 * no live input path feeds it since the Q8 shim removal removed the legacy
 * `auto` value.
 */
export function autoDetectMode(message: string): ResolvedMode {
  const lower = message.toLowerCase().trim();
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye|good morning|good night)\b/.test(lower))
    return 'single';
  if (/(what'?s the price|current price|quote|how much is)/.test(lower)) return 'single';
  if (/^(price|quote|rate)\s+(for|of)?\s*\w{3,6}\??$/i.test(lower)) return 'single';
  if (/should i (buy|sell|enter|go long|go short|trade)/.test(lower)) return 'full';
  if (/(is it (a )?good time (to|for)|is now (a )?good time)/.test(lower)) return 'full';
  if (/(buy or sell|long or short|bullish or bearish)/.test(lower)) return 'full';
  if (
    /(full|complete|comprehensive|deep dive|all four|committee)/.test(lower) &&
    /(analysis|analy[sz]e|review|read|outlook|assessment|committee)/.test(lower)
  )
    return 'full';
  if (/(deep dive|full analysis|comprehensive analysis)/.test(lower)) return 'full';
  return 'single';
}

/**
 * Q2 two-mode contract boundary. The Q8 shim removal (audit plan §4.6)
 * retired the `quick`→`single` / `standard`→`full` / `auto`→detector maps:
 * HTTP schemas reject legacy values upstream, and JS callers that bypass
 * the schema fail closed here instead of being silently mapped.
 */
export function resolveMode(mode: AnalysisMode, userMessage: string): ResolvedMode {
  void userMessage; // kept for the call-boundary signature (no `auto` detection since Q8)
  switch (mode) {
    case 'single':
    case 'full':
      return mode;
    default: {
      // Runtime guard for schema-less callers: never guess a legacy value.
      const legacy = String(mode);
      throw new Error(
        `Unknown analysis mode "${legacy}"; expected "single" or "full" (Q2 two-mode contract, docs/plans/decisions.log.md).`,
      );
    }
  }
}

export function messageText(message: UIMessage): string {
  return (message.parts ?? [])
    .map((part) =>
      part && typeof part === 'object' && 'text' in part ? String(part.text ?? '') : '',
    )
    .join(' ')
    .trim();
}

export function extractMastraSymbol(prompt: string): string | null {
  if (/\bgold\b/i.test(prompt)) return 'XAUUSD';
  const explicitSymbols = ALL_SYMBOLS.filter((symbol) => prompt.toUpperCase().includes(symbol));
  if (explicitSymbols.length > 1) return null;
  if (explicitSymbols.length === 1) return explicitSymbols[0]!;
  const matches = [...prompt.matchAll(new RegExp(`\\b(?:${ALL_SYMBOLS.join('|')})\\b`, 'gi'))].map(
    (match) => normalizeSymbol(match[0] ?? ''),
  );
  const unique = [...new Set(matches)].filter(isKnownSymbol);
  return unique.length === 1 ? unique[0]! : null;
}

export function isInjectionAttempt(prompt: string): boolean {
  return INJECTION_TERMS.test(prompt);
}

export function isMutationIntent(prompt: string): boolean {
  // Broad routing-level exclusion (P0-3): the high-confidence chat gate is
  // `isHighConfidenceMutationIntent` in routing-keywords.ts.
  return BROAD_MUTATION_TERMS.test(prompt);
}

export function isMastraXauusdCandidate(prompt: string): boolean {
  return (
    XAUUSD_TERMS.test(prompt) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !isInjectionAttempt(prompt) &&
    !isHighConfidenceMutationIntent(prompt)
  );
}

export function isMastraSymbolCandidate(prompt: string): boolean {
  return (
    extractMastraSymbol(prompt) !== null &&
    !isInjectionAttempt(prompt) &&
    !isHighConfidenceMutationIntent(prompt)
  );
}

export function isMastraXauusdFollowupCandidate(prompt: string): boolean {
  return (
    FOLLOWUP_TERMS.test(prompt) &&
    !FORBIDDEN_FOLLOWUP_TERMS.test(prompt) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !isInjectionAttempt(prompt) &&
    !isHighConfidenceMutationIntent(prompt)
  );
}

export function mastraXauusdChatKind(
  prompt: string,
  hasCurrentReport = false,
): 'research' | 'conversation' {
  if (hasCurrentReport && isMastraXauusdFollowupCandidate(prompt)) return 'conversation';
  return DEEP_RESEARCH_TERMS.test(prompt) ? 'research' : 'conversation';
}
