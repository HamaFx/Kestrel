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

// Mastra mode dispatch for /api/chat: bounded comparison, durable Full
// analysis, specialized XAUUSD packet/report runs, shared-packet symbol
// research, and ordinary symbol-free canonical conversation.

import type { UserSettingsRow } from '@kestrel/db';
import type { UIMessage } from 'ai';

import type { getServerEnv } from '@/lib/env';
import type { createRequestLogger } from '@/lib/logger';
import {
  mastraComparisonScope,
  MAX_COMPARISON_SYMBOLS,
  type ExecutionPlan,
  type listMessages,
} from '@/lib/services/api-boundary';
import {
  runConversationalTurn,
  runResearchWorkflow,
} from '@/lib/services/mastra/chat-orchestrator';
import { extractLatestMastraReport } from '@/lib/services/mastra/xauusd-handler';

import { ROUTE_TIMEOUT_MS } from './constants';
import { errorJson } from './errors';
import { enqueueFullAnalysisResponse } from './full-analysis-enqueue';
import type { PresentationPrefs } from './presentation-prefs';
import type { ChatUserParts } from './request-validation';

type RequestLogger = ReturnType<typeof createRequestLogger>;

export async function dispatchMastraRun(args: {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  userText: string;
  userParts: ChatUserParts;
  lastMessageId: string;
  provisionalReport: Awaited<ReturnType<typeof listMessages>>;
  executionPlan: ExecutionPlan | null;
  userSettings: UserSettingsRow | null;
  serverEnv: ReturnType<typeof getServerEnv>;
  modelOverride: string | null | undefined;
  prefs: PresentationPrefs;
  requestId: string | undefined;
  log: RequestLogger;
  requestSignal: AbortSignal | null;
}): Promise<Response> {
  const { userId, threadId, userMessage, userText, executionPlan, userSettings } = args;

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

  // Full mode remains durable: the web request enqueues a Mastra workflow
  // run (pending snapshot) and the worker claims it.
  if (executionPlan?.route === 'full-analysis') {
    const settings = userSettings;
    if (!settings) {
      return errorJson('ONBOARDING_REQUIRED', 'User settings not found.', 409);
    }
    return enqueueFullAnalysisResponse({
      userId,
      threadId,
      requestId: args.requestId,
      userMessageText: userText,
      userMessageParts: args.userParts,
      lastMessageId: args.lastMessageId,
      settings,
      serverEnv: args.serverEnv,
      modelOverride: args.modelOverride ?? null,
      executionPlan,
      log: args.log,
    });
  }

  const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
  const signal = args.requestSignal ? AbortSignal.any([args.requestSignal, timeout]) : timeout;
  const symbol = executionPlan?.symbol ?? null;
  const priorReport = executionPlan?.reportFollowup
    ? extractLatestMastraReport(args.provisionalReport)
    : null;

  // Deep XAUUSD analysis and verified-report follow-ups retain their
  // specialized packet/report verifier. This path is always preferred over
  // generic chat when the request is clearly about XAUUSD.
  //
  // Verified reports (kind === 'research') stay buffered until verification
  // completes. Ordinary XAUUSD conversation (kind === 'conversation') streams
  // provider tokens immediately.
  if (
    executionPlan?.route === 'xauusd-conversation' ||
    executionPlan?.route === 'xauusd-research'
  ) {
    const sharedInput = {
      plan: executionPlan,
      userId,
      threadId,
      userMessage,
      prompt: userText,
      modelOverride: args.modelOverride ?? null,
      signal,
      backfillExcludeMessageIdempotencyKey: `ui:${userMessage.id}`,
      ...(priorReport ? { priorReport } : {}),
    };
    // Awaited so provider/runner failures are caught by the Mastra failure
    // boundary below rather than escaping the request as unhandled.
    return executionPlan.route === 'xauusd-conversation'
      ? await runConversationalTurn(sharedInput)
      : await runResearchWorkflow({ ...sharedInput, symbol: symbol ?? 'XAUUSD' });
  }

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

  // Quick and Standard modes use the bounded shared-packet Mastra mode
  // workflow when the user has explicitly named a supported symbol.
  // Symbol-free prompts in these modes fall through to canonical chat.
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

  // Ordinary symbol-free conversation is handled by the streaming canonical
  // Mastra agent, which owns the reviewed read-only Kestrel tool allowlist.
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
