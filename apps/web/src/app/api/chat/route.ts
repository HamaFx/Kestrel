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

// /api/chat — Mastra-owned chat boundary. Kestrel retains HTTP validation,
// authentication, persistence, budgets, and the UI transport; Mastra owns
// agent selection, workflows, tool loops, structured research, and synthesis.

import type { UIMessage } from 'ai';

import { withAuth } from '@/lib/http/api';
import { createRequestLogger } from '@/lib/logger';
import {
  createExecutionPlan,
  extractMastraSymbols,
  extractUserMessageText,
  getThread,
  getUserWithSettings,
  isHighConfidenceMutationIntent,
  isInjectionAttempt,
  isMastraMutationEnabled,
  listMessages,
  resolveMode,
  routeUnified,
  withRateLimit,
} from '@/lib/services/api-boundary';
import { startMutationDraft } from '@/lib/services/mastra/mutation-handler';
import { extractLatestMastraReport } from '@/lib/services/mastra/xauusd-handler';

import { CHAT_RATE_LIMIT } from './_lib/constants';
import { dispatchCustomAgent } from './_lib/custom-agent-dispatch';
import {
  chatRateLimitResponse,
  errorJson,
  mapChatFailure,
  mastraFailureResponse,
  mutationDraftFailureResponse,
} from './_lib/errors';
import { parseChatRequest } from './_lib/request-validation';
import { dispatchMastraRun } from './_lib/run-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withAuth<void>(async (req, { user }) => {
  const log = createRequestLogger(req, user);
  const rateLimit = await withRateLimit(user.userId, 'ai_chat', CHAT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return chatRateLimitResponse(rateLimit);
  }

  const parsed = await parseChatRequest(req);
  if (!parsed.ok) return parsed.response;
  const { body, serverEnv, userParts, last, customInstructions, responseStyle, citeSources } =
    parsed.request;

  const thread = await getThread(user.userId, body.threadId);
  if (!thread) return errorJson('NOT_FOUND', 'Thread not found', 404);

  const rawMode = body.analysisMode ?? (thread.analysisMode === 'full' ? 'full' : 'single');
  const analysisMode: 'single' | 'full' = rawMode === 'full' ? 'full' : 'single';
  const userMessage = { ...last, parts: userParts } as UIMessage;
  const userText = extractUserMessageText(userMessage);
  const resolvedMode = resolveMode(analysisMode, userText);
  // P2-01: the thread pin is a fallback for prompts that name no symbol, or
  // that name the pinned symbol among others. A prompt that names other
  // symbols but not the pin must stay ambiguous (null) instead of being
  // silently routed to an unrelated pinned market.
  const mentionedSymbols = extractMastraSymbols(userText);
  const pinnedSymbol = thread.pinnedSymbol ?? null;
  const fallbackSymbol =
    mentionedSymbols.length === 1
      ? mentionedSymbols[0]!
      : mentionedSymbols.length === 0
        ? pinnedSymbol
        : pinnedSymbol && mentionedSymbols.includes(pinnedSymbol)
          ? pinnedSymbol
          : null;
  // Build one auditable policy/model decision at the boundary. Existing
  // route-specific services remain responsible for persistence and streaming;
  // this decision is used for parity validation and future migration.
  const { settings: userSettings } = await getUserWithSettings(user.userId);
  if (!userSettings) {
    return errorJson(
      'ONBOARDING_REQUIRED',
      'Complete onboarding to configure your AI provider and model before starting chat.',
      409,
    );
  }

  // ── Standalone custom agents (`@handle` or an explicit composer pick) ──
  const agentResponse = await dispatchCustomAgent({
    userId: user.userId,
    threadId: body.threadId,
    userMessage,
    userText,
    agentSlug: body.agentSlug,
    modelOverride: body.modelOverride,
    prefs: { customInstructions, responseStyle, citeSources },
    requestSignal: req.signal,
  });
  if (agentResponse) return agentResponse;

  const provisionalReport =
    /\b(?:why|explain|how|what\s+changed|based\s+on|according\s+to|invalidation|trigger|scenario|risk|report|analysis|you\s+said)\b/i.test(
      userText,
    ) &&
    !/\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i.test(
      userText,
    )
      ? await listMessages(user.userId, body.threadId, 100)
      : [];
  const priorReportAvailable = extractLatestMastraReport(provisionalReport) !== null;
  // Unified router (audit plan §1.1): domain, symbol, injection, mutation,
  // capability, and model resolution all classify in one pass. The lexical
  // fallbacks only run when user settings are absent (onboarding edge).
  const unified = userSettings
    ? await routeUnified({
        userMessage,
        mode: resolvedMode,
        modelOverride: body.modelOverride ?? null,
        settings: userSettings,
        env: serverEnv,
        priorReportAvailable,
        symbol: fallbackSymbol,
      })
    : null;
  const injectionBlocked = unified ? unified.injection.blocked : isInjectionAttempt(userText);
  const highConfidenceMutationIntent = unified
    ? unified.highConfidenceMutationIntent
    : isHighConfidenceMutationIntent(userText);
  const mutationKind = unified?.mutationKind ?? null;
  const executionPlan = userSettings
    ? await createExecutionPlan({
        userMessage,
        mode: resolvedMode,
        modelOverride: body.modelOverride ?? null,
        settings: userSettings,
        env: serverEnv,
        tenantId: user.userId,
        priorReportAvailable,
        mutationRequested: mutationKind !== null,
        routingDecision: unified?.decision,
        symbol: fallbackSymbol,
      })
    : null;

  // Injection/jailbreak attempts are always blocked — no model should
  // process them regardless of mutation capability.
  if (injectionBlocked) {
    return errorJson(
      'READ_ONLY_REQUEST_REQUIRED',
      'I can help with read-only research, but I cannot process instruction-overriding requests. Please ask for a market explanation, analysis, or scenario review.',
      422,
    );
  }

  // Mutation detection runs in two layers:
  // 1. Model-based classifier (when mutation capability is enabled)
  // 2. Lexical high-confidence gate (zero-cost fallback)
  //
  // The lexical gate only fires on unambiguous trade commands ("buy 1 lot",
  // "sell at market").  Analysis-oriented phrasing ("best trade setup",
  // "portfolio review") passes through to the read-only agents.
  if (isMastraMutationEnabled()) {
    if (mutationKind !== null) {
      try {
        const draft = await startMutationDraft({
          userId: user.userId,
          threadId: body.threadId,
          userText,
          kind: mutationKind,
        });
        return Response.json(draft);
      } catch (error) {
        return mutationDraftFailureResponse(error, log, body.threadId, mutationKind);
      }
    }
    // Fall through — even when mutations are enabled, if neither the model
    // nor the lexical gate flagged it, treat as read-only.
  }

  // Lexical high-confidence mutation gate — only blocks unambiguous trade
  // commands that the model classifier may have missed.
  if (highConfidenceMutationIntent) {
    return errorJson(
      'READ_ONLY_REQUEST_REQUIRED',
      'I can analyze a trade idea, but I cannot execute trades from chat. Please rephrase this as a read-only analysis request, or use the confirmation workflow for an explicitly supported action.',
      422,
    );
  }

  try {
    return await dispatchMastraRun({
      userId: user.userId,
      threadId: body.threadId,
      userMessage,
      userText,
      userParts,
      lastMessageId: last.id,
      provisionalReport,
      executionPlan,
      userSettings,
      serverEnv,
      modelOverride: body.modelOverride,
      prefs: { customInstructions, responseStyle, citeSources },
      requestId: req.headers.get('x-request-id') ?? undefined,
      log,
      requestSignal: req.signal,
    });
  } catch (error) {
    const mapped = mapChatFailure(error);
    if (mapped) return mapped;
    log.error({ err: String(error), threadId: body.threadId }, 'Mastra chat failed');
    return mastraFailureResponse(error);
  }
});
