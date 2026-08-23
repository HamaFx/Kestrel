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

import 'server-only';

import { ALL_SYMBOLS, isKnownSymbol, normalizeSymbol } from '@kestrel/shared';

const CANONICAL_SYMBOL_PATTERN = new RegExp(`\\b(?:${ALL_SYMBOLS.join('|')})\\b`, 'gi');

const XAUUSD_TERMS = /\b(?:xauusd|xau\/usd|gold)\b/i;
const OTHER_SYMBOL_TERMS =
  /\b(?:btc|bitcoin|eth|ethereum|eurusd|eur\/usd|gbpusd|gbp\/usd|usdjpy|usd\/jpy|silver|oil|nasdaq|spx|s&p\s*500)\b/i;

// ---------------------------------------------------------------------------
// Concern 1 — Mutation Intent Detection (strict, narrow)
// ---------------------------------------------------------------------------
// These terms with surrounding quantitative/imperative context indicate the
// user wants to *execute* a trade, not analyse the market.  False positives
// from analysis-oriented phrasing ("best trade setup", "position sizing",
// "portfolio review") are caught by NEGATIVE_READONLY_PATTERNS below.

/** Core trade-execution verbs — short and imperative. */
const EXECUTION_VERBS = /\b(?:buy|sell|execute|place|order)\b/i;

/** Phrases where an execution verb is clearly a trade command. */
const EXECUTION_PHRASES =
  /\b(?:(?:buy|sell)\s+(?:\d+(?:\.\d+)?\s*(?:lot|unit|contract|oz|ounce)s?)|(?:(?:execute|place)\s+(?:the\s+)?(?:trade|order))|(?:(?:buy|sell)\s+(?:at|@)\s+(?:market|\d)))\b/i;

/** Context-free dangerous terms that are almost never read-only. */
const ALWAYS_UNSAFE = /\b(?:automate|schedule)\b/i;

/**
 * High-confidence command phrases: alert/journal commands that the model
 * classifier (`mutation-detect.ts`) also flags as mutations.  These are
 * unambiguous — a user asking to "set an alert" is not asking for analysis.
 */
const MUTATION_COMMANDS =
  /\b(?:set|create|add|make)\b[\s\S]{0,30}?\balert\b|\balert\s+me\b|\bnotify\s+me\b|\bremind\s+me\b|\blog\s+(?:a\s+)?(?:trade|journal|entry)\b|\bjournal\s+(?:this|my|a)\s+trade\b|\bshare\s+(?:this|snapshot|summary)\b/i;

/**
 * High-confidence mutation request.  The model-based classifier runs first
 * (when mutations are enabled); this lexical gate is a zero-cost second
 * opinion used when the model is unavailable or disagrees.
 */
export function isMutationIntent(prompt: string): boolean {
  if (!prompt || prompt.trim().length < 3) return false;
  if (ALWAYS_UNSAFE.test(prompt)) return true;
  if (MUTATION_COMMANDS.test(prompt)) return true;
  if (EXECUTION_PHRASES.test(prompt)) return true;
  // Single execution verb without a read-only qualifier.
  if (EXECUTION_VERBS.test(prompt) && !isReadOnlyContext(prompt)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Concern 2 — Read-Only Capability Classification
// ---------------------------------------------------------------------------

/** Terms that are often read-only analysis despite containing trade/proximity words. */
const NEGATIVE_READONLY_PATTERNS =
  /\b(?:what\s+(?:is|are|would|should)|tell\s+me|explain|analy[sz]e|analysis|outlook|forecast|predict|setup|setup idea|trade\s+setup|trade\s+idea|best\s+(?:trade|entry|setup)|suggest(?:ion)?|recommend(?:ation)?|thoughts?\s+on|opinion|what\s+do\s+you\s+think|how\s+(?:do|would|should|to|is|about)|show\s+me|can\s+you|please\s+(?:analy|tell|show|explain)|close\s+price|today.?\s*(?:close|price)|position\s+siz(?:e|ing)|portfolio\s+(?:review|allocation|check|look|summary|overview)|journal\s+(?:entry|note|log|my|this)|alert\s+me\s+(?:when|if|at)|entry\s+(?:point|level|zone|area|price)|enter\s+(?:a\s+)?(?:trade|position|at))\b/i;

/** Question-starter patterns: prompts that start like a question are read-only even when they contain trade words. */
const QUESTION_STARTERS =
  /^(?:what|how|when|where|why|who|should|could|would|can|do|does|did|is|are|will|has|have)\b|\?/i;

/** Returns true when a prompt's surface-level trade terms are clearly in a read-only context. */
function isReadOnlyContext(prompt: string): boolean {
  // Prompts structured as questions (starts with question word, or contains ?)
  // are read-only context — users don't execute trades with interrogative grammar.
  if (QUESTION_STARTERS.test(prompt.trim())) return true;
  return NEGATIVE_READONLY_PATTERNS.test(prompt);
}

/** Safe boundary for the generic conversational runner. */
export function isMastraCanonicalCandidate(prompt: string, hasCurrentReport = false): boolean {
  if (isInjectionAttempt(prompt)) return false;
  if (isMutationIntent(prompt)) return false;
  if (extractMastraSymbol(prompt) !== null || DEEP_RESEARCH_TERMS.test(prompt)) return false;
  if (hasCurrentReport && isMastraXauusdFollowupCandidate(prompt)) return false;
  return true;
}

/**
 * Decide whether a user message is safe to consider for the read-only Mastra
 * XAUUSD agent.  The model must not decide whether it is allowed to route
 * itself — this is lexical and deterministic.
 *
 * Only blocks on injection and high-confidence mutation intent.  Ambiguous
 * trade terms in a read-only context are allowed through.
 */
export function isMastraXauusdCandidate(prompt: string): boolean {
  return (
    XAUUSD_TERMS.test(prompt) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !isInjectionAttempt(prompt) &&
    !isMutationIntent(prompt)
  );
}

/** Classify the Mastra single-mode execution contract without using a model. */
export type MastraXauusdChatKind = 'research' | 'conversation';

export function mastraXauusdChatKind(
  prompt: string,
  hasCurrentReport = false,
): MastraXauusdChatKind {
  if (hasCurrentReport && isMastraXauusdFollowupCandidate(prompt)) return 'conversation';
  return DEEP_RESEARCH_TERMS.test(prompt) ? 'research' : 'conversation';
}

/** Follow-ups inherit XAUUSD scope from the saved report but remain read-only. */
export function isMastraXauusdFollowupCandidate(prompt: string): boolean {
  return (
    /\b(?:why|explain|how|what\s+changed|based\s+on|according\s+to|invalidation|trigger|scenario|risk|report|analysis|you\s+said)\b/i.test(
      prompt,
    ) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !isInjectionAttempt(prompt) &&
    !isMutationIntent(prompt)
  );
}

/** Return the one canonical symbol explicitly mentioned by a safe prompt. */
export function extractMastraSymbol(prompt: string): string | null {
  if (prompt.toLowerCase().includes('gold')) return 'XAUUSD';
  const explicitSymbols = ALL_SYMBOLS.filter((symbol) => prompt.toUpperCase().includes(symbol));
  if (explicitSymbols.length > 1) return null;
  if (explicitSymbols.length === 1) return explicitSymbols[0]!;
  if (/\bgold\b/i.test(prompt)) return 'XAUUSD';
  const matches = [...prompt.matchAll(CANONICAL_SYMBOL_PATTERN)].map((match) =>
    normalizeSymbol(match[0] ?? ''),
  );
  const unique = [...new Set(matches)].filter(isKnownSymbol);
  return unique.length === 1 ? unique[0]! : null;
}

/** Generalized read-only symbol eligibility for Quick/Standard/Full Mastra modes. */
export function isMastraSymbolCandidate(prompt: string): boolean {
  return (
    extractMastraSymbol(prompt) !== null &&
    !isInjectionAttempt(prompt) &&
    !isMutationIntent(prompt)
  );
}

// ---------------------------------------------------------------------------
// Concern 3 — Safety Block (injection, jailbreak, abuse)
// ---------------------------------------------------------------------------

const INJECTION_TERMS =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)?\s*instructions|system\s*:|developer\s*:|DAN\s+mode)\b/i;

/** Injection/jailbreak detection — always blocks, no exceptions. */
export function isInjectionAttempt(prompt: string): boolean {
  return INJECTION_TERMS.test(prompt);
}

// ---------------------------------------------------------------------------
// Concern 4 — Read-Only Safety Gate (backward-compatible)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `isInjectionAttempt` + `isMutationIntent` separately.
 * Kept for backward compatibility with existing callers.
 */
export function isMastraPromptUnsafe(prompt: string): boolean {
  return isInjectionAttempt(prompt) || isMutationIntent(prompt);
}

// ---------------------------------------------------------------------------
// Common research terms (unchanged)
// ---------------------------------------------------------------------------

const DEEP_RESEARCH_TERMS =
  /\b(?:analy[sz]e|analysis|outlook|forecast|predict|technical|fundamental|macro|structure|indicator|level|setup|bullish|bearish|bias|scenario|support|resistance|volatility)\b/i;