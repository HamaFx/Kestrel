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
 * Two deterministic scorers that reuse the existing report machinery:
 *
 * - `grounding`: runs the XAUUSD report verifier (`verifyXauusdReport`) and
 *   scores 1 when the candidate report passes every deterministic check
 *   (schema, evidence IDs, safety, numeric grounding, narrative grounding,
 *   temporal disclosure), 0 otherwise. Pass/fail → 0/1.
 * - `citation`: the legacy citation oracle (`computeCitationScore`, 0..1)
 *   that measures how many price/event claims in the assistant text are
 *   backed by supporting tool calls.
 *
 * These run without an LLM judge — they are pure functions over the agent
 * output — so they are free to attach to every turn (no sampling cost).
 */

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { createScorer, type MastraScorer } from '@mastra/core/evals';

import { computeCitationScore } from '../../eval/citation-oracle';
import { verifyXauusdReport } from '../../mastra/report-verifier';
import type { XauusdResearchPacket } from '../../mastra/research-types';

const clog = createCategorizedLogger('ai', { component: 'mastra-evals-custom' });

export interface GroundingScorerRunInput {
  /** Candidate report to verify (already parsed by the workflow). */
  report: unknown;
  /** The evidence packet the report must ground against. */
  packet: XauusdResearchPacket;
}

export interface CitationScorerRunInput {
  /** Assistant text to scan for unsupported price/event claims. */
  text: string;
  /** Tool calls made during the turn. */
  toolCalls: Array<{ name: string }>;
}

/**
 * Grounding scorer — 1 when the candidate report passes the full
 * deterministic verification chain, 0 otherwise. Attach to the
 * symbol-research fusion output (after verification runs) or to research
 * agents whose structured output is a report.
 */
export function createGroundingScorer(): MastraScorer<
  'kestrel-grounding',
  GroundingScorerRunInput,
  unknown,
  Record<'preprocessStepResult', { ok: boolean; findings: string[] }>
> {
  return createScorer({
    id: 'kestrel-grounding',
    name: 'Kestrel Report Grounding',
    description:
      'Scores 1 when the candidate XAUUSD report passes every deterministic verification check (schema, evidence IDs, safety, numeric/narrative grounding, temporal disclosure).',
  })
    .preprocess(async ({ run }) => {
      const explicit =
        run.input && typeof run.input === 'object'
          ? (run.input as Partial<GroundingScorerRunInput>)
          : undefined;
      const report = explicit?.report ?? run.output;
      const packet = explicit?.packet ?? extractPacket(run.output);
      if (!report || !packet) {
        metrics.increment('scorer_missing_input_total', { tags: { scorer: 'kestrel-grounding' } });
        return { ok: false, findings: ['missing report or packet input'] };
      }
      const result = verifyXauusdReport(report, packet);
      if (!result.ok) {
        clog.warn('Grounding scorer: report failed verification', {
          findings: result.findings.slice(0, 5),
        });
      }
      return { ok: result.ok, findings: result.findings };
    })
    .generateScore(({ results }) => {
      return results.preprocessStepResult?.ok ? 1 : 0;
    });
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
      const name = (call as { toolName?: unknown; name?: unknown }).toolName ??
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

function extractPacket(value: unknown): XauusdResearchPacket | null {
  if (!value || typeof value !== 'object') return null;
  const packet = (value as { packet?: unknown }).packet;
  return packet && typeof packet === 'object' ? (packet as XauusdResearchPacket) : null;
}

export const CUSTOM_SCORER_IDS = ['kestrel-grounding', 'kestrel-citation'] as const;
