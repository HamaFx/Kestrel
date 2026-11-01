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
 * Audit R15 — the pure half of the provider-boundary indirect-content screen.
 *
 * It walks a model-bound prompt (the provider's `LanguageModelV2Prompt`, which
 * is where tool results finally become text) and screens every tool result:
 * instruction-like strings are replaced by the quarantine notice, and payloads
 * that declare `contentTrust: 'untrusted' | 'mixed-untrusted'` additionally get
 * the sanitizer and the `[UNTRUSTED EXTERNAL DATA]` delimiters.
 *
 * Nothing here performs I/O, logs, or emits metrics, so the walk is directly
 * testable. The processor that reports the outcome lives in
 * `./indirect-content-guardrail`; both are re-exported from `./guardrails`.
 */

import type { ProcessLLMRequestArgs } from '@mastra/core/processors';

import {
  declaresUntrustedContent,
  EXTERNAL_QUARANTINE_NOTICE,
  screenExternalText,
  screenTextValues,
} from './packets/external-content';

type ModelPrompt = ProcessLLMRequestArgs['prompt'];
type ModelPromptMessage = ModelPrompt[number];

interface ToolResultOutputLike {
  type: string;
  value?: unknown;
  [key: string]: unknown;
}

interface ToolResultPartLike {
  type: 'tool-result';
  toolName?: string;
  output?: ToolResultOutputLike;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isToolResultPart(part: unknown): part is ToolResultPartLike {
  return isRecord(part) && part.type === 'tool-result';
}

interface StringScreenStats {
  scanned: number;
  quarantined: number;
  wrapped: number;
  oversizeUntouched: number;
  unscannedNodes: number;
}

const EMPTY_STRING_STATS: StringScreenStats = {
  scanned: 0,
  quarantined: 0,
  wrapped: 0,
  oversizeUntouched: 0,
  unscannedNodes: 0,
};

/** Screen one tool-result output payload, leaving structure intact. */
function screenToolResultOutput(
  output: ToolResultOutputLike,
  untrusted: boolean,
): { output: ToolResultOutputLike; stats: StringScreenStats } {
  if (output.type === 'text' || output.type === 'error-text') {
    const screened = screenExternalText(output.value, { untrusted });
    return {
      output:
        screened.quarantined || screened.wrapped ? { ...output, value: screened.text } : output,
      stats: {
        scanned: 1,
        quarantined: screened.quarantined ? 1 : 0,
        wrapped: screened.wrapped ? 1 : 0,
        oversizeUntouched: 0,
        unscannedNodes: 0,
      },
    };
  }

  if (output.type === 'json' || output.type === 'error-json') {
    const screened = screenTextValues(output.value, { untrusted });
    return {
      output:
        screened.quarantined > 0 || screened.wrapped > 0
          ? { ...output, value: screened.value }
          : output,
      stats: {
        scanned: screened.scanned,
        quarantined: screened.quarantined,
        wrapped: screened.wrapped,
        oversizeUntouched: screened.oversizeUntouched,
        unscannedNodes: screened.unscannedNodes,
      },
    };
  }

  if (output.type === 'content' && Array.isArray(output.value)) {
    // Only text items are screened. Media data stays byte-identical: wrapping
    // or rewriting base64 would corrupt it.
    let scanned = 0;
    let quarantined = 0;
    let changed = false;
    const items = output.value.map((item) => {
      if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') return item;
      const screened = screenExternalText(item.text, { untrusted: false });
      scanned += 1;
      if (!screened.quarantined) return item;
      quarantined += 1;
      changed = true;
      return { ...item, text: screened.text };
    });
    return {
      output: changed ? { ...output, value: items } : output,
      stats: { scanned, quarantined, wrapped: 0, oversizeUntouched: 0, unscannedNodes: 0 },
    };
  }

  return { output, stats: EMPTY_STRING_STATS };
}

export interface PromptToolScreenResult {
  prompt: ModelPrompt;
  /** True when at least one string was rewritten. */
  changed: boolean;
  toolResults: number;
  untrustedToolResults: number;
  stringsScanned: number;
  stringsQuarantined: number;
  stringsWrapped: number;
  oversizeUntouched: number;
  /** Payload nodes left uninspected because a traversal budget ran out. */
  unscannedNodes: number;
  /** Tool names that carried at least one quarantined string. */
  flaggedTools: string[];
}

/**
 * Screen every tool result in a model-bound prompt (audit R15).
 *
 * Pure and exported for testing: it walks the provider prompt, quarantines
 * instruction-like strings in place, annotates declared-untrusted payloads
 * with the `[UNTRUSTED EXTERNAL DATA]` delimiters, and reports what it did so
 * the run can disclose it.
 */
export function screenPromptToolResults(prompt: ModelPrompt): PromptToolScreenResult {
  let changed = false;
  let toolResults = 0;
  let untrustedToolResults = 0;
  let stringsScanned = 0;
  let stringsQuarantined = 0;
  let stringsWrapped = 0;
  let oversizeUntouched = 0;
  let unscannedNodes = 0;
  const flaggedTools: string[] = [];

  const messages = prompt.map((message) => {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return message;
    let messageChanged = false;
    const parts = content.map((part: unknown) => {
      if (!isToolResultPart(part) || !part.output) return part;
      toolResults += 1;
      const untrusted = declaresUntrustedContent(part.output.value);
      if (untrusted) untrustedToolResults += 1;
      const screened = screenToolResultOutput(part.output, untrusted);
      stringsScanned += screened.stats.scanned;
      stringsQuarantined += screened.stats.quarantined;
      stringsWrapped += screened.stats.wrapped;
      oversizeUntouched += screened.stats.oversizeUntouched;
      unscannedNodes += screened.stats.unscannedNodes;
      if (screened.output === part.output) return part;
      messageChanged = true;
      if (screened.stats.quarantined > 0) {
        flaggedTools.push(typeof part.toolName === 'string' ? part.toolName : 'unknown-tool');
      }
      return { ...part, output: screened.output };
    });
    if (!messageChanged) return message;
    changed = true;
    return { ...message, content: parts } as ModelPromptMessage;
  });

  return {
    prompt: changed ? (messages as ModelPrompt) : prompt,
    changed,
    toolResults,
    untrustedToolResults,
    stringsScanned,
    stringsQuarantined,
    stringsWrapped,
    oversizeUntouched,
    unscannedNodes,
    flaggedTools,
  };
}

/** Withhold every tool result in a prompt (strict fail-closed fallback). */
export function withholdPromptToolResults(prompt: ModelPrompt): ModelPrompt {
  // Defensive: this runs on the failure path, so it must never throw. A value
  // that is not a prompt array carries no tool results to withhold.
  if (!Array.isArray(prompt)) return prompt;
  return prompt.map((message) => {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return message;
    let messageChanged = false;
    const parts = content.map((part: unknown) => {
      if (!isToolResultPart(part) || !part.output) return part;
      messageChanged = true;
      return { ...part, output: { type: 'text', value: EXTERNAL_QUARANTINE_NOTICE } };
    });
    return messageChanged ? ({ ...message, content: parts } as ModelPromptMessage) : message;
  });
}
