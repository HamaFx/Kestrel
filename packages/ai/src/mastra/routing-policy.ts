/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { ALL_SYMBOLS, isKnownSymbol, normalizeSymbol } from '@kestrel/shared';
import type { UIMessage } from 'ai';

const XAUUSD_TERMS = /\b(?:xauusd|xau\/usd|gold)\b/i;
const OTHER_SYMBOL_TERMS =
  /\b(?:btc|bitcoin|eth|ethereum|eurusd|eur\/usd|gbpusd|gbp\/usd|usdjpy|usd\/jpy|silver|oil|nasdaq|spx|s&p\s*500)\b/i;
const DEEP_RESEARCH_TERMS =
  /\b(?:analy[sz]e|analysis|outlook|forecast|predict|technical|fundamental|macro|structure|indicator|level|setup|bullish|bearish|bias|scenario|support|resistance|volatility)\b/i;
const INJECTION_TERMS =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)?\s*instructions|system\s*:|developer\s*:|DAN\s+mode)\b/i;
const FORBIDDEN_FOLLOWUP_TERMS =
  /\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i;
const FOLLOWUP_TERMS =
  /\b(?:why|explain|how|what\s+changed|based\s+on|according\s+to|invalidation|trigger|scenario|risk|report|analysis|you\s+said)\b/i;
const MUTATION_TERMS =
  /\b(?:set|create|add|make|schedule|send)\b[\s\S]{0,60}?\balert\b|\balert\s+me\b|\bnotify\s+me\b|\bremind\s+me\b|\b(?:log|record|write|journal|note)\b[\s\S]{0,60}?\b(?:trade|journal|entry|position|transaction)\b|\b(?:share|send|export|publish)\b[\s\S]{0,40}?\b(?:snapshot|summary|analysis|report|link)\b|\b(?:run|execute|trigger|perform)\b[\s\S]{0,40}?\b(?:system\s+action|maintenance|cleanup|diagnostic|backup)\b/i;

export type AnalysisMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';
export type ResolvedMode = Exclude<AnalysisMode, 'auto'>;

/** Resolve the explicit or automatic mode at the canonical routing boundary. */
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
  if (/(analyze|analysis|outlook|view on|what do you think|forecast|predict)/.test(lower))
    return 'standard';
  if (/(technical (and|&) fundamental)/.test(lower)) return 'standard';
  if (lower.length < 10) return 'single';
  return 'standard';
}

export function resolveMode(mode: AnalysisMode, userMessage: string): ResolvedMode {
  return mode === 'auto' ? autoDetectMode(userMessage) : mode;
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
  return MUTATION_TERMS.test(prompt);
}

export function isMastraXauusdCandidate(prompt: string): boolean {
  return (
    XAUUSD_TERMS.test(prompt) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !isInjectionAttempt(prompt) &&
    !isMutationIntent(prompt)
  );
}

export function isMastraSymbolCandidate(prompt: string): boolean {
  return (
    extractMastraSymbol(prompt) !== null && !isInjectionAttempt(prompt) && !isMutationIntent(prompt)
  );
}

export function isMastraXauusdFollowupCandidate(prompt: string): boolean {
  return (
    FOLLOWUP_TERMS.test(prompt) &&
    !FORBIDDEN_FOLLOWUP_TERMS.test(prompt) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !isInjectionAttempt(prompt) &&
    !isMutationIntent(prompt)
  );
}

export function mastraXauusdChatKind(
  prompt: string,
  hasCurrentReport = false,
): 'research' | 'conversation' {
  if (hasCurrentReport && isMastraXauusdFollowupCandidate(prompt)) return 'conversation';
  return DEEP_RESEARCH_TERMS.test(prompt) ? 'research' : 'conversation';
}
