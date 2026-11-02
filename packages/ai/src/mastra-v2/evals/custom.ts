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
 * Phase 6 evals — custom Kestrel scorers.
 *
 * The legacy citation oracle (`computeCitationScore`, 0..1) measures how many
 * price/event claims in the assistant text are backed by supporting tool calls.
 *
 * Phase 4 Task 4 — the `grounding` scorer verified the retired XAUUSD report
 * artifact; with reports retired there is no report to verify, so only the
 * citation scorer remains.
 *
 * These run without an LLM judge — they are pure functions over the agent
 * output — so they are free to attach to every turn (no sampling cost).
 */

import { metrics } from '@kestrel/shared';
import { createScorer, type MastraScorer } from '@mastra/core/evals';

import { computeCitationScore } from '../../eval/citation-oracle';

export interface CitationScorerRunInput {
  /** Assistant text to scan for unsupported price/event claims. */
  text: string;
  /** Tool calls made during the turn. */
  toolCalls: Array<{ name: string }>;
}

/**
 * Citation oracle scorer — 0..1 ratio of supported price/event claims to
 * total claims, using the legacy `computeCitationScore` oracle. A response
 * with no detectable claims scores 1.0.
 */
export function createCitationScorer(): MastraScorer<
  'kestrel-citation',
  CitationScorerRunInput,
  unknown,
  Record<'preprocessStepResult', { score: number }>
> {
  return createScorer({
    id: 'kestrel-citation',
    name: 'Kestrel Citation Oracle',
    description:
      'Scores the ratio of price/event claims in the assistant text that are backed by supporting tool calls (0..1).',
  })
    .preprocess(async ({ run }) => {
      const explicit =
        run.input && typeof run.input === 'object'
          ? (run.input as Partial<CitationScorerRunInput>)
          : undefined;
      const text = explicit?.text ?? outputText(run.output);
      const toolCalls = explicit?.toolCalls ?? outputToolCalls(run.output);
      if (!text) {
        metrics.increment('scorer_missing_input_total', { tags: { scorer: 'kestrel-citation' } });
        return { score: 0 };
      }
      return { score: computeCitationScore(text, toolCalls) };
    })
    .generateScore(({ results }) => {
      return results.preprocessStepResult?.score ?? 0;
    });
}

function outputText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const candidate = value as { text?: unknown; result?: { text?: unknown } };
  if (typeof candidate.text === 'string') return candidate.text;
  if (candidate.result && typeof candidate.result.text === 'string') return candidate.result.text;
  return '';
}

function outputToolCalls(value: unknown): Array<{ name: string }> {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as {
    toolCalls?: unknown;
    response?: { messages?: unknown };
  };
  if (Array.isArray(candidate.toolCalls)) {
    return candidate.toolCalls.flatMap((call) => {
      if (!call || typeof call !== 'object') return [];
      const name =
        (call as { toolName?: unknown; name?: unknown }).toolName ??
        (call as { name?: unknown }).name;
      return typeof name === 'string' ? [{ name }] : [];
    });
  }
  if (!Array.isArray(candidate.response?.messages)) return [];
  return candidate.response.messages.flatMap((message) => {
    if (!message || typeof message !== 'object') return [];
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const candidatePart = part as { type?: unknown; toolName?: unknown };
      return candidatePart.type === 'tool-call' && typeof candidatePart.toolName === 'string'
        ? [{ name: candidatePart.toolName }]
        : [];
    });
  });
}

export const CUSTOM_SCORER_IDS = ['kestrel-citation'] as const;
