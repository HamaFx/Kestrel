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

// Deterministic eval assertions (tools, agents, numbers, cost/latency).

import type { AssertionFailure, PromptDef, PromptResult } from './types';

export function evaluateAssertions(prompt: PromptDef, result: PromptResult): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  const calledTools = new Set(result.toolCalls.map((t) => t.name));
  if (prompt.analysisMode) {
    const observedModes = new Set(
      result.agentProgress
        .map((snapshot) => snapshot.mode)
        .filter((mode): mode is string => Boolean(mode)),
    );
    if (observedModes.size > 0 && !observedModes.has(prompt.analysisMode)) {
      failures.push({
        kind: 'wrong_mode',
        detail: `expected ${prompt.analysisMode}, observed ${[...observedModes].join(', ')}`,
      });
    }
  }
  const latestAgents = new Map<string, string>();
  for (const snapshot of result.agentProgress) {
    for (const agent of snapshot.agents) latestAgents.set(agent.agentName, agent.status);
  }
  for (const agent of prompt.expectedAgents ?? []) {
    if (!latestAgents.has(agent)) failures.push({ kind: 'missing_agent', detail: agent });
  }
  for (const [agent, expectedStatus] of Object.entries(prompt.expectedAgentStatuses ?? {})) {
    if (latestAgents.get(agent) !== expectedStatus) {
      failures.push({
        kind: 'wrong_agent_status',
        detail: `${agent}: expected ${expectedStatus}, observed ${latestAgents.get(agent) ?? 'missing'}`,
      });
    }
  }
  if (prompt.expectedTerminalStatus && result.terminalStatus !== prompt.expectedTerminalStatus) {
    failures.push({
      kind: 'wrong_terminal_status',
      detail: `expected ${prompt.expectedTerminalStatus}, observed ${result.terminalStatus ?? 'missing'}`,
    });
  }
  for (const t of prompt.expectedTools ?? []) {
    if (!calledTools.has(t)) {
      failures.push({ kind: 'missing_tool', detail: t });
    }
  }
  for (const t of prompt.forbiddenTools ?? []) {
    if (calledTools.has(t)) {
      failures.push({ kind: 'forbidden_tool', detail: t });
    }
  }
  const lowerText = result.text.toLowerCase();
  for (const sub of prompt.mustContainSubstrings ?? []) {
    if (!lowerText.includes(sub.toLowerCase())) {
      failures.push({ kind: 'missing_substring', detail: sub });
    }
  }

  for (const expected of prompt.expectedToolOutputs ?? []) {
    const call = result.toolCalls.find((toolCall) => toolCall.name === expected.tool);
    const actual = call ? readPath(call.output, expected.path) : undefined;
    if (typeof actual !== 'number' || !Number.isFinite(actual)) {
      failures.push({
        kind: 'numeric_mismatch',
        detail: `${expected.tool}.${expected.path}: expected ${expected.value}, observed ${String(actual ?? 'missing')}`,
      });
      continue;
    }
    const tolerance = expected.tolerance ?? 0;
    if (Math.abs(actual - expected.value) > tolerance) {
      failures.push({
        kind: 'numeric_mismatch',
        detail: `${expected.tool}.${expected.path}: expected ${expected.value} ± ${tolerance}, observed ${actual}`,
      });
    }
  }

  const quality = prompt.quality;
  if (quality) {
    if (quality.requireNumericToolSupport && hasUnsupportedNumericClaim(result.text, calledTools)) {
      failures.push({
        kind: 'unsupported_numeric_claim',
        detail:
          'price-like instrument claim was not accompanied by a numeric market-data tool call',
      });
    }
    if (quality.requireEventToolSupport && hasUnsupportedEventClaim(result.text, calledTools)) {
      failures.push({
        kind: 'unsupported_event_claim',
        detail: 'macro/event claim was not accompanied by a news or calendar tool call',
      });
    }
    for (const forbidden of quality.forbiddenOutputSubstrings ?? []) {
      if (lowerText.includes(forbidden.toLowerCase())) {
        failures.push({ kind: 'unsafe_output', detail: forbidden });
      }
    }
    for (const required of quality.requiredOutputSubstrings ?? []) {
      if (!lowerText.includes(required.toLowerCase())) {
        failures.push({ kind: 'missing_safety_text', detail: required });
      }
    }
    if (
      quality.maxTtftMs !== undefined &&
      (result.ttftMs === null || result.ttftMs > quality.maxTtftMs)
    ) {
      failures.push({
        kind: 'ttft_exceeded',
        detail: `expected ≤ ${quality.maxTtftMs}ms, observed ${result.ttftMs === null ? 'missing' : `${result.ttftMs}ms`}`,
      });
    }
    if (quality.maxTotalMs !== undefined && result.totalMs > quality.maxTotalMs) {
      failures.push({
        kind: 'latency_exceeded',
        detail: `expected ≤ ${quality.maxTotalMs}ms, observed ${result.totalMs}ms`,
      });
    }
    if (
      quality.maxCostUsd !== undefined &&
      (result.metadata.totalCostUsd === undefined ||
        result.metadata.totalCostUsd > quality.maxCostUsd)
    ) {
      failures.push({
        kind: 'cost_exceeded',
        detail: `expected ≤ $${quality.maxCostUsd.toFixed(4)}, observed ${result.metadata.totalCostUsd === undefined ? 'missing' : `$${result.metadata.totalCostUsd.toFixed(4)}`}`,
      });
    }
  }
  return failures;
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (segment.length === 0 || typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const NUMERIC_SUPPORT_TOOLS = new Set([
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'forecast_volatility',
  'analyze_technical',
  'analyze_fundamental',
  'get_session_levels',
  'get_intermarket',
  'compute_position_health',
  'compute_risk',
  'replay_setup',
]);
const EVENT_SUPPORT_TOOLS = new Set([
  'get_news',
  'get_calendar',
  'analyze_fundamental',
  'web_search',
  'search_knowledge',
]);
const INSTRUMENT_PRICE_CLAIM =
  /\b(?:xauusd|gold|eurusd|gbpusd|usdjpy|btcusdt)\b[^.!?\n]{0,100}\b(?:\d{1,5}\.\d{2,5}|0\.\d{3,6})\b/i;
const EVENT_CLAIM = /\b(?:cpi|nfp|fomc|ecb|boe|federal reserve|rate decision|central bank)\b/i;

function hasUnsupportedNumericClaim(text: string, calledTools: Set<string>): boolean {
  return INSTRUMENT_PRICE_CLAIM.test(text) && !hasAnyTool(calledTools, NUMERIC_SUPPORT_TOOLS);
}

function hasUnsupportedEventClaim(text: string, calledTools: Set<string>): boolean {
  return EVENT_CLAIM.test(text) && !hasAnyTool(calledTools, EVENT_SUPPORT_TOOLS);
}

function hasAnyTool(calledTools: Set<string>, supportedTools: ReadonlySet<string>): boolean {
  for (const tool of supportedTools) if (calledTools.has(tool)) return true;
  return false;
}
