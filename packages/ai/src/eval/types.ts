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

// Shared eval-runner types. Kept dependency-free so reporters, drift tools,
// and regression gates can import them without pulling the network client.

import type { AgentProgressSnapshot, ParsedStreamMetadata, ParsedToolCall } from './parse-stream';
import type { EvalQualityGateResult, EvalQualityGateThresholds } from './quality-gate';

// --- types -----------------------------------------------------------------

export interface RunEvalsArgs {
  /** Base URL the harness will POST to, e.g. `http://localhost:3000`. */
  baseUrl: string;
  /** Full `Cookie` header value, e.g. `hfx_auth=...`. */
  cookie: string;
  /** Directory the markdown report is written into. Created if missing. */
  outDir: string;
  /** Optional override for the prompts file. Defaults to `./prompts.json`. */
  promptsPath?: string;
  /** Per-prompt abort timeout in ms. Defaults to 120_000. */
  timeoutMs?: number;
  /** Optional progress sink. Defaults to `console.log`. */
  onProgress?: (line: string) => void;
  qualityGate?: EvalQualityGateThresholds;
}

export interface PromptDef {
  id: string;
  prompt: string;
  /** Phase 7c — tool-trace assertions. Optional; when present the runner
   *  evaluates them and surfaces pass/fail in the report.
   *  - `expectedTools`: every tool listed must appear in the trace.
   *  - `forbiddenTools`: none of these tools may appear in the trace.
   *  - `mustContainSubstrings`: each substring (case-insensitive) must
   *     appear in the streamed assistant text.
   */
  expectedTools?: string[];
  forbiddenTools?: string[];
  mustContainSubstrings?: string[];
  /** Optional mode sent with this case (Q2: normalized to single|full). */
  analysisMode?: 'single' | 'full';
  /** Every listed specialist must appear in an observed progress snapshot. */
  expectedAgents?: string[];
  /** Final observed status required for each specialist. */
  expectedAgentStatuses?: Record<string, string>;
  /** Expected terminal result status; supports expected Full-mode failures. */
  expectedTerminalStatus?: 'complete' | 'failed' | 'retrying';
  /** Exact numeric values expected in a structured tool output. */
  expectedToolOutputs?: Array<{
    tool: string;
    path: string;
    value: number;
    tolerance?: number;
  }>;
  /** Deterministic quality gates for safety, grounding, latency, and cost. */
  quality?: {
    requireNumericToolSupport?: boolean;
    requireEventToolSupport?: boolean;
    forbiddenOutputSubstrings?: string[];
    requiredOutputSubstrings?: string[];
    maxTtftMs?: number;
    maxTotalMs?: number;
    maxCostUsd?: number;
  };
}

export interface AssertionFailure {
  kind:
    | 'missing_tool'
    | 'forbidden_tool'
    | 'missing_substring'
    | 'wrong_mode'
    | 'missing_agent'
    | 'wrong_agent_status'
    | 'wrong_terminal_status'
    | 'numeric_mismatch'
    | 'unsupported_numeric_claim'
    | 'unsupported_event_claim'
    | 'unsafe_output'
    | 'missing_safety_text'
    | 'ttft_exceeded'
    | 'latency_exceeded'
    | 'cost_exceeded';
  detail: string;
}

export interface PromptResult {
  id: string;
  prompt: string;
  ttftMs: number | null;
  totalMs: number;
  text: string;
  toolCalls: ParsedToolCall[];
  agentProgress: AgentProgressSnapshot[];
  metadata: ParsedStreamMetadata;
  terminalStatus: string | null;
  ok: boolean;
  error?: string;
  /**
   * Phase C citation oracle — 0..1. Fraction of numeric/event claims in the
   * text that are supported by an appropriate market-data / news tool call.
   * 1.0 means every detected claim is grounded (or no claims were made);
   * null means the result errored before text could be scored.
   */
  citationScore?: number | null;
  /**
   * Phase 7c — assertion failures collected from the case definition. The
   * `ok` flag remains driven by transport / parse failures; assertion
   * failures are reported separately so we don't conflate "the model
   * crashed" with "the model picked a different tool".
   */
  assertions?: AssertionFailure[];
  /**
   * Id of the persisted assistant message this case produced, when the
   * stream completed far enough to emit one. Links the eval case to real
   * user feedback (`ai_message_feedback.message_id`) for the training loop.
   */
  assistantMessageId?: string | null;
}

export interface RunEvalsResult {
  results: PromptResult[];
  reportPath: string;
  /** Machine-readable JSON report path (written alongside the Markdown). */
  jsonPath: string;
  score: EvaluationScore;
  qualityGate: EvalQualityGateResult;
}

export interface EvaluationScore {
  total: number;
  transportPassRate: number;
  assertionPassRate: number;
  agentCoverageRate: number | null;
  overallPassRate: number;
}

export type { AgentProgressSnapshot, ParsedStreamMetadata, ParsedToolCall };
