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

/**
 * Phase 1 (Jev System One) — per-turn fine-grained tool pruning
 * ("When2Call").
 *
 * After the domain subset has already cut the tool surface, one parallel
 * `/v1/systemone` request asks one `noul` question per candidate tool
 * ("does answering this request require tool X?"). Tools whose probability
 * clears 0.25 are kept — plus a mandatory safety floor so the agent can
 * always quote a price and search its own knowledge base.
 *
 * Safety properties:
 *   - Pruning can only REMOVE tools — the returned set is always a subset of
 *     the candidate set the caller passed.
 *   - `get_price` / `search_knowledge` are retained whenever they were
 *     candidates, regardless of their probability.
 *   - When `allowedToolNames` is supplied (canonical setup passes
 *     `READ_ONLY_TOOL_NAMES`), no retained tool may be outside it.
 *   - User-disabled tools are never retained.
 *   - Any timeout / missing provider / malformed response returns the
 *     candidate set completely unchanged.
 *   - The state is `sanitizeExternalText(userText, 600)` only — never raw
 *     external prose.
 */

import { sanitizeExternalText } from '../mastra-v2/packets/external-content';
import { evaluateJev } from './client';
import type { JevEnv, JevGenerationLedger, JevNoulQuestion, JevSettings } from './types';

/** Candidate sets at or below this size are already small — no call. */
export const JEV_TOOL_PRUNE_MIN_CANDIDATES = 6;

/** Retain a tool when its `noul` probability clears this bar. */
export const JEV_TOOL_PROBABILITY_THRESHOLD = 0.25;

/** Per-turn pruning budget — must never add serial wall-clock latency. */
export const JEV_TOOL_PRUNE_TIMEOUT_MS = 500;

/** Tools always retained when present in the candidate set. */
export const MANDATORY_JEV_TOOL_NAMES: readonly string[] = ['get_price', 'search_knowledge'];

/**
 * Short per-tool relevance criteria for the pruning questions. Unknown tool
 * names fall back to a generic phrasing, so plugins/extensions never crash
 * pruning.
 */
export const TOOL_SHORT_CRITERIA: Readonly<Record<string, string>> = {
  get_price: 'the current live price of a symbol',
  get_candles: 'OHLC candle history for a timeframe',
  get_indicators: 'indicator values such as RSI, MACD, EMA, ATR, or Bollinger bands',
  get_market_structure:
    'swing structure, break-of-structure, FVGs, order blocks, or liquidity sweeps',
  get_session_levels: 'session highs/lows or key intraday levels',
  get_news: 'recent news headlines',
  get_calendar: 'economic-calendar events',
  get_cot: 'CFTC commitment-of-traders positioning',
  get_seasonality: 'seasonal or monthly price tendencies',
  get_intermarket: 'cross-market readings such as DXY or real yields',
  get_intermarket_resonance: 'multi-market resonance between symbols',
  get_social_sentiment: 'social sentiment or market mood',
  get_correlation: 'correlation between symbols',
  forecast_volatility: 'a volatility forecast',
  analyze_technical: 'structured technical analysis of a chart',
  analyze_fundamental: 'structured fundamental/macro analysis',
  compute_risk: 'position sizing or risk math',
  web_search: 'fresh research from the public web',
  search_knowledge: 'semantic search over news, journal entries, or past briefings',
  verify_call: 'verifying a previously made call',
  convene_committee: 'a multi-desk committee review',
  get_journal_stats: 'the user trading-journal statistics',
  compute_position_health: 'the health of open positions',
  replay_setup: 'replaying a historical trade setup',
};

export interface PruneToolsWithJevArgs<T extends Record<string, unknown>> {
  userText: string;
  /** Routing domain, for context in the question state. */
  domain?: string | null | undefined;
  candidateTools: T;
  /** BYOK settings row for Jev key resolution. */
  settings?: JevSettings | null | undefined;
  env?: JevEnv | null | undefined;
  signal?: AbortSignal | null | undefined;
  fetchImpl?: typeof fetch | undefined;
  /**
   * Fail-closed allowlist (canonical setup passes `READ_ONLY_TOOL_NAMES`).
   * When provided, no retained tool may be outside it.
   */
  allowedToolNames?: ReadonlySet<string> | null | undefined;
  /** User-disabled tools — never retained. */
  disabledTools?: readonly string[] | null | undefined;
  timeoutMs?: number | undefined;
  ledger?: JevGenerationLedger | null | undefined;
  ledgerEntryId?: string | undefined;
}

/**
 * Prune a candidate tool map to the per-turn relevant subset. Always returns
 * a subset of `candidateTools`; on any Jev failure the full candidate set is
 * returned unchanged.
 */
export async function pruneToolsWithJev<T extends Record<string, unknown>>(
  args: PruneToolsWithJevArgs<T>,
): Promise<T> {
  const names = Object.keys(args.candidateTools);
  if (names.length <= JEV_TOOL_PRUNE_MIN_CANDIDATES) return args.candidateTools;

  const text = sanitizeExternalText(args.userText, 600);
  if (!text) return args.candidateTools;

  const questions: Record<string, JevNoulQuestion> = {};
  for (const name of names) {
    const criteria = TOOL_SHORT_CRITERIA[name] ?? 'this capability';
    questions[name] = {
      type: 'noul',
      instructions: `Does fully answering the user's request require the "${name}" tool, which provides ${criteria}?`,
    };
  }

  const result = await evaluateJev({
    state: JSON.stringify({ prompt: text, domain: args.domain ?? null }),
    // Per-tool relevance is simple enumeration — the simple Liquid tier (d1.1).
    tier: 'simple',
    questions,
    ...(args.settings !== undefined ? { settings: args.settings } : {}),
    ...(args.env !== undefined ? { env: args.env } : {}),
    ...(args.signal !== undefined ? { signal: args.signal } : {}),
    ...(args.fetchImpl !== undefined ? { fetchImpl: args.fetchImpl } : {}),
    timeoutMs: args.timeoutMs ?? JEV_TOOL_PRUNE_TIMEOUT_MS,
    ...(args.ledger !== undefined ? { ledger: args.ledger } : {}),
    ledgerEntryId: args.ledgerEntryId ?? 'tool-prune',
  });
  if (!result) return args.candidateTools;

  const mandatory = new Set(MANDATORY_JEV_TOOL_NAMES);
  const disabled = new Set(args.disabledTools ?? []);
  const allowed = args.allowedToolNames ?? null;

  const retained: Record<string, unknown> = {};
  for (const name of names) {
    if (disabled.has(name)) continue;
    if (allowed && !allowed.has(name)) continue;
    const answer = result.answers[name];
    // `evaluateJev` guarantees every question was answered (a partial batch
    // returns null); an absent answer is treated as "not required" while the
    // mandatory safety floor below still applies.
    const aboveThreshold = answer ? answer.probability >= JEV_TOOL_PROBABILITY_THRESHOLD : false;
    if (aboveThreshold || mandatory.has(name)) {
      retained[name] = args.candidateTools[name];
    }
  }
  // Never hand the agent an empty toolset: if every candidate fell below the
  // bar (and no mandatory tool was present), fall back to the candidate set.
  if (Object.keys(retained).length === 0) return args.candidateTools;
  return retained as T;
}
