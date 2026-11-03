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

// Mastra mode dispatch for /api/chat: bounded comparison, shared-packet
// symbol research (single and full committee modes, both streamed over SSE),
// and canonical conversation.
//
// Phase 4 Task 4 — XAUUSD runs the same dispatcher paths as every other
// symbol; the legacy packet/report route split is retired.

import type { UIMessage } from 'ai';

import {
  mastraComparisonScope,
  MAX_COMPARISON_SYMBOLS,
  type ExecutionPlan,
} from '@/lib/services/chat-ai';
import {
  runConversationalTurn,
  runResearchWorkflow,
} from '@/lib/services/mastra/chat/mastra-execution';

import { ROUTE_TIMEOUT_MS } from './constants';
import { errorJson } from './errors';
import type { PresentationPrefs } from './presentation-prefs';

export async function dispatchMastraRun(args: {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  userText: string;
  executionPlan: ExecutionPlan | null;
  modelOverride: string | null | undefined;
  prefs: PresentationPrefs;
  requestSignal: AbortSignal | null;
}): Promise<Response> {
  const { userId, threadId, userMessage, userText, executionPlan } = args;

  // A-01 (B-01/B-08): a prompt naming more symbols than the comparison cap
  // is disambiguated at the boundary — never silently collapsed into a
  // single-symbol run (same DX as the mutation confirmation flow).
  if (mastraComparisonScope(userText).overflow) {
    return errorJson(
      'MULTI_SYMBOL_LIMIT',
      `I can compare up to ${MAX_COMPARISON_SYMBOLS} symbols — which ones should I include?`,
      422,
    );
  }

  const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
  const signal = args.requestSignal ? AbortSignal.any([args.requestSignal, timeout]) : timeout;
  const symbol = executionPlan?.symbol ?? null;

  // A-01: bounded cross-symbol comparisons run the comparison graph —
  // evidence for every named symbol, then a cross-symbol fusion. This
  // takes precedence over both single-symbol paths in every mode.
  if (executionPlan?.route === 'multi-symbol-research') {
    const symbols = executionPlan.symbols;
    if (symbols.length < 2) {
      return errorJson('VALIDATION', 'A comparison needs at least two symbols.', 422);
    }
    return await runResearchWorkflow({
      plan: executionPlan,
      userId,
      threadId,
      userMessage,
      prompt: userText,
      symbol: symbols[0]!,
      symbols,
      modelOverride: args.modelOverride ?? null,
      signal,
      backfillExcludeMessageIdempotencyKey: `mastra-mode:${threadId}:${userMessage.id}:user`,
    });
  }

  // Single-symbol research (XAUUSD included) uses the bounded shared-packet
  // Mastra mode workflow when the user has explicitly named a supported
  // symbol. Both analysis modes stream live desk progress over SSE; `full`
  // runs the strict 4-of-4 committee in the same request. Symbol-free prompts
  // and implicit report follow-ups fall through to canonical chat.
  if (executionPlan?.route === 'symbol-research' && symbol !== null) {
    return await runResearchWorkflow({
      plan: executionPlan,
      userId,
      threadId,
      userMessage,
      prompt: userText,
      symbol,
      modelOverride: args.modelOverride ?? null,
      signal,
      backfillExcludeMessageIdempotencyKey: `mastra-mode:${threadId}:${userMessage.id}:user`,
    });
  }

  // Ordinary conversation is handled by the streaming canonical Mastra agent,
  // which owns the reviewed read-only Kestrel tool allowlist.
  return await runConversationalTurn({
    plan: executionPlan!,
    userId,
    threadId,
    userMessage,
    prompt: userText,
    modelOverride: args.modelOverride ?? null,
    ...(args.prefs.customInstructions ? { customInstructions: args.prefs.customInstructions } : {}),
    responseStyle: args.prefs.responseStyle,
    citeSources: args.prefs.citeSources,
    signal,
  });
}
