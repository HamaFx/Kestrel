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

/**
 * Thread title producer — Mastra-native replacement for the legacy
 * `generateTitle` that died with the pre-Mastra chat plane (Phase 9).
 *
 * Best-effort by contract: any model failure falls back to a deterministic
 * title clipped from the first user message, so a thread always ends up with
 * a title and the caller never blocks on it. The pure helpers are exported so
 * unit tests can target them without an LLM call.
 */

import type { LanguageModel } from 'ai';

import { estimateCostUsd } from '../cost';
import type { GenerationLedger } from '../generation-ledger';
import { resolveModel, type ResolveModelEnv } from '../model';
import { runMastraText } from './text-runner';

export interface GenerateThreadTitleArgs {
  userId: string;
  threadId: string;
  /** Plain text of the first user message in the thread. */
  firstUser: string;
  /** Plain text of the first assistant reply (may be empty on fallback paths). */
  firstAssistant: string;
  /** Qualified model id (`<provider>/<bare>`) — derive via `deriveTitleModel`. */
  titleModelId: string;
  env: ResolveModelEnv;
  signal?: AbortSignal;
  accounting?: {
    onComplete?: (costUsd: number) => void | Promise<void>;
  };
  ledger?: GenerationLedger;
  ledgerId?: string;
}

export interface GenerateThreadTitleResult {
  /** ≤ 60 codepoints, trimmed. Always set, even on fallback. */
  title: string;
  source: 'llm' | 'fallback';
  /** Populated only when `source === 'fallback'`. */
  reason?: 'budget' | 'empty' | 'error' | 'unresolved-model';
}

const MAX_CODEPOINTS = 60;
const PROMPT_INPUT_BUDGET = 1024;

const SYSTEM_PROMPT =
  'Reply with a 3–7 word title for this conversation. No quotes. No trailing punctuation.';

/**
 * Codepoint-safe truncation to 60 codepoints with a trailing ellipsis when the
 * source is longer. Pure — no I/O.
 */
export function deterministicFallbackTitle(firstUser: string): string {
  const trimmed = firstUser.trim();
  const codepoints = Array.from(trimmed);
  if (codepoints.length <= MAX_CODEPOINTS) {
    return codepoints.join('');
  }
  return codepoints.slice(0, MAX_CODEPOINTS).join('') + '…';
}

/**
 * Strip a single matching pair of surrounding quotes (`"`, `'`, or backtick)
 * then apply the codepoint clip, so the persisted title length invariant holds
 * regardless of what the model returned. Pure — no I/O.
 */
export function cleanTitleForPersistence(raw: string): string {
  const trimmed = raw.trim();
  const codepoints = Array.from(trimmed);
  if (codepoints.length >= 2) {
    const first = codepoints[0]!;
    const last = codepoints[codepoints.length - 1]!;
    if ((first === '"' || first === "'" || first === '`') && first === last) {
      return deterministicFallbackTitle(codepoints.slice(1, -1).join(''));
    }
  }
  return deterministicFallbackTitle(trimmed);
}

/**
 * Generate a 3–7 word thread title through the Mastra text runner. Falls back
 * to the deterministic title whenever the model cannot run (string/gateway
 * transport, empty output, or any thrown error).
 */
export async function generateThreadTitle(
  args: GenerateThreadTitleArgs,
): Promise<GenerateThreadTitleResult> {
  const { firstUser, firstAssistant } = args;

  const resolvedModel = resolveModel(args.titleModelId, args.env, args.userId);
  // The BYOK transport resolves to a concrete LanguageModel. A string means
  // a gateway-only env with no direct provider key — the legacy generateText
  // path was deleted with the old plane, so fall back deterministically.
  if (typeof resolvedModel === 'string') {
    return {
      title: deterministicFallbackTitle(firstUser),
      source: 'fallback',
      reason: 'unresolved-model',
    };
  }
  const model = resolvedModel as LanguageModel;

  const userPrompt = `${firstUser.slice(0, PROMPT_INPUT_BUDGET)}\n\n---\n\n${firstAssistant.slice(
    0,
    PROMPT_INPUT_BUDGET,
  )}`;

  try {
    const result = await runMastraText({
      task: 'title',
      model,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      userId: args.userId,
      threadId: args.threadId,
      ...(args.signal ? { signal: args.signal } : {}),
      maxOutputTokens: 80,
    });
    const costUsd = estimateCostUsd(args.titleModelId, result.inputTokens, result.outputTokens);
    args.ledger?.recordCost(
      args.ledgerId ?? `title:${args.threadId}`,
      'title',
      costUsd,
    );
    await args.accounting?.onComplete?.(
      // Title output is bounded; use the runner's actual token counts for
      // conservative parent-turn reconciliation.
      costUsd,
    );
    const cleaned = cleanTitleForPersistence(result.text);
    if (cleaned.length === 0) {
      return {
        title: deterministicFallbackTitle(firstUser),
        source: 'fallback',
        reason: 'empty',
      };
    }
    return { title: cleaned, source: 'llm' };
  } catch {
    return {
      title: deterministicFallbackTitle(firstUser),
      source: 'fallback',
      reason: 'error',
    };
  }
}
