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

// P2-1 — Externalized routing keyword patterns.
//
// Previously these were hardcoded in routing.ts. Moving them to a
// separate config file makes the keyword corpus auditable, tunable,
// and potentially loadable from a database or JSON file in the future
// without modifying domain logic (OCP).
//
// Each pattern has a regex and a weight. Higher-weight patterns are
// stronger signals for classification. The scoring algorithm in
// routing.ts stays unchanged — it iterates these arrays and sums weights.

export interface RoutingKeywordPattern {
  re: RegExp;
  weight: number;
}

/** Macro / event / "why" reasoning patterns. */
export const FUNDAMENTAL_PATTERNS: RoutingKeywordPattern[] = [
  {
    re: /\b(why|because|driver|reason|cause|implication|catalyst|going\s+up|going\s+down|rally|sell-?off|behind\s+the|what's\s+driving|what\s+is\s+driving)\b/,
    weight: 2,
  },
  {
    re: /\b(fundamental|macro|policy|monetary|hawkish|dovish|stagflation|balance\s+sheet|quantitative|tightening|easing)\b/,
    weight: 3,
  },
  {
    re: /\b(fed|fomc|powell|ecb|lagarde|boe|bailey|boj|rba|rbnz|cpi|nfp|pce|gdp|ppi|pmi|jobs|jobless|claims|unemployment|retail\s+sales)\b/,
    weight: 3,
  },
  {
    re: /\b(real yield|yields|10y|treasury|treasuries|dxy|dollar index|usdx|bond|bonds|spread|spreads)\b/,
    weight: 2,
  },
  {
    re: /\b(geopolit|war|tariff|sanction|risk-?on|risk-?off|safe\s*haven|flight\s*to)\b/,
    weight: 2,
  },
  { re: /\b(scenario|outlook|forecast|expect|positioning|sentiment|bullish|bearish)\b/, weight: 1 },
  {
    re: /\b(committee|review my trade|rate my setup|should i take|trade idea|worried\s+about|concerned\s+about)\b/,
    weight: 3,
  },
];

/** Chart / indicator / structure patterns. */
export const TECHNICAL_PATTERNS: RoutingKeywordPattern[] = [
  {
    re: /\b(chart|candle|candles|bar|bars|wick|body|pattern|patterns|formation|flag|wedge|triangle|double\s*(top|bottom)|head\s*and\s*shoulders)\b/,
    weight: 1,
  },
  {
    re: /\b(rsi|macd|ema|sma|bollinger|atr|stoch|stochastic|adx|ichimoku|pivot|pivots|fibonacci|fib|retracement|volume|vol|vwap)\b/,
    weight: 3,
  },
  {
    re: /\b(liquidity|swing high|swing low|swings|pdh|pdl|asian range|session high|session low|key level)\b/,
    weight: 2,
  },
  {
    re: /\b(timeframe|tf|1m|5m|15m|30m|1h|4h|1d|1w|daily|weekly|hourly|intraday|swing)\b/,
    weight: 1,
  },
  {
    re: /\b(support|resistance|breakout|rejection|trend|reversal|range|consolidation|channel|pullback|retest)\b/,
    weight: 2,
  },
  {
    re: /\b(top-?down|bias|setup|invalidation|stop|entry|target|risk\s*reward|r\s*:?s*r)\b/,
    weight: 2,
  },
  { re: /\b(price|level|levels|key level|cable|fibre|gold|xau|eur|gbp|dollar)\b/, weight: 1 },
];

/** Summary / recap / listing patterns. */
export const SUMMARY_PATTERNS: RoutingKeywordPattern[] = [
  { re: /\b(summari[sz]e|recap|brief|overview|tldr)\b/, weight: 3 },
  { re: /\b(news|headline|headlines|article|articles|story|stories)\b/, weight: 2 },
  { re: /\b(calendar|event|events|schedule|upcoming|today|tomorrow|this week)\b/, weight: 2 },
  { re: /\b(journal|trade|trades|win rate|r-?multiple|stats)\b/, weight: 2 },
  { re: /\b(list|show me|what(?:'s| is) (?:on|happening))\b/, weight: 1 },
];

// ─────────────────────────────────────────────────────────────────────────────
// P0-3 unified routing lexicon (audit plan §1.1).
//
// Every chat-boundary regex used for symbol detection, injection detection,
// deep-research classification, and mutation intent lives here exactly once.
// Both `packages/ai/src/mastra-v2/planning/routing-policy.ts` (the unified
// router) and the web boundary (`apps/web/src/lib/services/mastra/`) import
// from this file so the layers can never drift apart again.
// ─────────────────────────────────────────────────────────────────────────────

/** Other canonical symbols that disambiguate away from a pure XAUUSD prompt. */
export const OTHER_SYMBOL_TERMS =
  /\b(?:btc|bitcoin|eth|ethereum|eurusd|eur\/usd|gbpusd|gbp\/usd|usdjpy|usd\/jpy|silver|oil|nasdaq|spx|s&p\s*500)\b/i;

/**
 * Lexical prompt-injection / jailbreak markers (always blocks, no exceptions).
 *
 * P1-12 — the previous pattern's trailing `\b` applied after every
 * alternative, so the colon forms (`system\s*:`, `developer\s*:`) could only
 * match when a word character directly followed the colon — the common
 * "system: you are now…" / "developer: hi" spacings never fired. The
 * role-spoof forms now tolerate optional whitespace around the colon but
 * still require payload content after it, and the ignore-instructions form
 * tolerates short connective phrasings ("ignore the above instructions").
 */
export const INJECTION_TERMS =
  /(?:\b(?:ignore|disregard|forget)\s+(?:\w+\s+){0,3}?instructions\b|\b(?:system|developer)\s*:\s*\S|\bDAN\s+mode\b|<\|im_start\|>|\[INST\])/i;

/** Report-followup phrasing (inherits scope from a saved verified report). */
export const FOLLOWUP_TERMS =
  /\b(?:why|explain|how|what\s+changed|based\s+on|according\s+to|invalidation|trigger|scenario|risk|report|analysis|you\s+said)\b/i;

/** Follow-up wording that is actually a trade command and must not inherit. */
export const FORBIDDEN_FOLLOWUP_TERMS =
  /\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i;

/**
 * User-data read intent: the prompt asks about the caller's own journal,
 * alerts, positions, or trade history. Routes such reads through the
 * `sensitive-user-read` capability instead of the public market-data surface.
 */
const USER_DATA_READ_TERMS =
  /\b(?:my\s+(?:journal|trades?|alerts?|positions?|performance|win\s*rate|results?|stats|statistics)|journal\s+(?:stats|statistics|summary|overview)|trade\s+(?:stats|statistics)|(?:my|the)\s+position\s+health|position\s+health|replay\s+(?:my|this|that|the)\s+(?:setup|trade)|how\s+(?:am|are)\s+(?:i|my\s+trades?)\s+doing)\b/i;

/** True when the prompt is asking for the user's own trading data. */
export function isUserDataReadIntent(prompt: string): boolean {
  return USER_DATA_READ_TERMS.test(prompt);
}

/**
 * Per-kind mutation-intent patterns. The chat-boundary classifier and the
 * unified router's broad mutation exclusion both read this one table.
 */
export const MUTATION_INTENT_PATTERNS = {
  set_alert:
    /\b(?:set|create|add|make|schedule|send)\b[\s\S]{0,60}?\balert\b|\balert\s+me\b|\bnotify\s+me\b|\bremind\s+me\b|\bwatch\s+for\b/i,
  log_journal:
    /\b(?:log|record|add|write|journal|note)\b[\s\S]{0,60}?\b(?:trade|journal|entry|position|transaction)\b|\b(?:trade|journal|position)\b[\s\S]{0,40}?\b(?:log|record|add|write|entry)\b/i,
  share_snapshot:
    /\b(?:share|send|export|publish)\b[\s\S]{0,40}?\b(?:snapshot|summary|analysis|report|link)\b|\bshare\s+this\b/i,
  run_system_action:
    /\b(?:run|execute|trigger|perform)\b[\s\S]{0,40}?\b(?:system\s+action|maintenance|cleanup|diagnostic|backup)\b|\bsystem\s+action\b/i,
} as const;

/**
 * Broad mutation-routing exclusion. Used by the unified router to route a
 * prompt *away* from the research/symbol paths; it is intentionally wider
 * than the high-confidence chat gate below.
 */
export const BROAD_MUTATION_TERMS = new RegExp(
  Object.values(MUTATION_INTENT_PATTERNS)
    .map((pattern) => `(?:${pattern.source})`)
    .join('|'),
  'i',
);

// — High-confidence mutation gate (the chat-boundary 422 classifier) ————

/** Core trade-execution verbs — short and imperative. */
const EXECUTION_VERBS = /\b(?:buy|sell|execute|place|order)\b/i;

/** Phrases where an execution verb is clearly a trade command. */
const EXECUTION_PHRASES =
  /\b(?:(?:buy|sell)\s+(?:\d+(?:\.\d+)?\s*(?:lot|unit|contract|oz|ounce)s?)|(?:(?:execute|place)\s+(?:the\s+)?(?:trade|order))|(?:(?:buy|sell)\s+(?:at|@)\s+(?:market|\d)))\b/i;

/** Context-free dangerous terms that are almost never read-only. */
const ALWAYS_UNSAFE = /\b(?:automate|schedule)\b/i;

/**
 * High-confidence command phrases: alert/journal commands that the model
 * classifier (`mutation-detect.ts`) also flags as mutations.
 */
const MUTATION_COMMANDS =
  /\b(?:set|create|add|make)\b[\s\S]{0,30}?\balert\b|\balert\s+me\b|\bnotify\s+me\b|\bremind\s+me\b|\blog\s+(?:a\s+)?(?:trade|journal|entry)\b|\bjournal\s+(?:this|my|a)\s+trade\b|\bshare\s+(?:this|snapshot|summary)\b/i;

/** Terms that are often read-only analysis despite containing trade words. */
const NEGATIVE_READONLY_PATTERNS =
  /\b(?:what\s+(?:is|are|would|should)|tell\s+me|explain|analy[sz]e|analysis|outlook|forecast|predict|setup|setup idea|trade\s+setup|trade\s+idea|best\s+(?:trade|entry|setup)|suggest(?:ion)?|recommend(?:ation)?|thoughts?\s+on|opinion|what\s+do\s+you\s+think|how\s+(?:do|would|should|to|is|about)|show\s+me|can\s+you|please\s+(?:analy|tell|show|explain)|close\s+price|today.?\s*(?:close|price)|position\s+siz(?:e|ing)|portfolio\s+(?:review|allocation|check|look|summary|overview)|journal\s+(?:entry|note|log|my|this)|alert\s+me\s+(?:when|if|at)|entry\s+(?:point|level|zone|area|price)|enter\s+(?:a\s+)?(?:trade|position|at))\b/i;

/** Question-starter patterns: interrogative grammar is read-only context. */
const QUESTION_STARTERS =
  /^(?:what|how|when|where|why|who|should|could|would|can|do|does|did|is|are|will|has|have)\b|\?/i;

/** Returns true when a prompt's trade terms are clearly in a read-only context. */
export function isReadOnlyContext(prompt: string): boolean {
  if (QUESTION_STARTERS.test(prompt.trim())) return true;
  return NEGATIVE_READONLY_PATTERNS.test(prompt);
}

/**
 * High-confidence mutation request (chat-boundary 422 gate). Narrow by
 * design: only unambiguous trade commands and always-unsafe verbs fire.
 */
export function isHighConfidenceMutationIntent(prompt: string): boolean {
  if (!prompt || prompt.trim().length < 3) return false;
  if (ALWAYS_UNSAFE.test(prompt)) return true;
  if (MUTATION_COMMANDS.test(prompt)) return true;
  if (EXECUTION_PHRASES.test(prompt)) return true;
  if (EXECUTION_VERBS.test(prompt) && !isReadOnlyContext(prompt)) return true;
  return false;
}
