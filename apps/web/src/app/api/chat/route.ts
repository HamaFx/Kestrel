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

import {
  classifyMutationRequest,
  isMastraMutationEnabled,
  MutationExtractionError,
  resolveMastraModeModel,
} from '@kestrel/ai/mastra';
import { getUserWithSettings } from '@kestrel/db';
import { UserMessagePartsSchema } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createRequestLogger } from '@/lib/logger';
import {
  AnalysisQueuedEventSchema,
  BudgetExceededError,
  enqueueFullAnalysis,
  extractUserMessageText,
  getThread,
  listMessages,
  resolveMode,
  traceIdStorage,
  withDiagnostics,
  withRateLimit,
} from '@/lib/services/api-boundary';
import { runMastraCanonicalChatStreamService } from '@/lib/services/mastra-canonical-chat-stream';
import { runMastraXauusdChat } from '@/lib/services/mastra-chat';
import { mastraChatResponse } from '@/lib/services/mastra-chat-response';
import {
  extractMastraSymbol,
  isInjectionAttempt,
  isMastraSymbolCandidate,
  isMastraXauusdCandidate,
  isMastraXauusdFollowupCandidate,
  isMutationIntent,
  mastraXauusdChatKind,
} from '@/lib/services/mastra-chat-routing';
import { runMastraXauusdConversationStreamChat } from '@/lib/services/mastra-chat-stream';
import { runMastraModeChat } from '@/lib/services/mastra-mode';
import { mastraModeResponse } from '@/lib/services/mastra-mode-response';
import { startMutationDraft } from '@/lib/services/mastra-mutation-draft';
import {
  extractLatestMastraReport,
  mayReferToMastraReport,
} from '@/lib/services/mastra-report-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE_TIMEOUT_MS = 55_000;
const CHAT_RATE_LIMIT = Number(process.env.AI_CHAT_RATE_LIMIT ?? '30');

const BodySchema = z.object({
  threadId: z.string().uuid(),
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  analysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().max(200),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(50_000, 'Message too long').default(''),
        parts: z.array(z.unknown()).max(50, 'Too many message parts').default([]),
      }),
    )
    .min(1)
    .max(100, 'Too many messages'),
});

function errorJson(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** Only allow presentation preferences into the AI request boundary. */
function sanitizeCustomInstructions(value: string): string | undefined {
  const controlCharacters = new RegExp(
    `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
    'g',
  );
  const normalized = value.replace(controlCharacters, ' ').trim().slice(0, 2_000);
  if (!normalized) return undefined;
  if (
    /\b(?:ignore|system|developer|tool|function|execute|mutation|safety|policy|reveal|secret|memory|permission|instruction|jailbreak|override)\b/i.test(
      normalized,
    )
  ) {
    return undefined;
  }
  return normalized;
}

function mastraFailureResponse(error: unknown): Response {
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Mastra could not complete this request. Please try again.'
      : error instanceof Error
        ? error.message
        : String(error);
  return errorJson('MASTRA_FAILED', message, 502);
}

export const POST = withAuth<void>(async (req, { user }) => {
  const log = createRequestLogger(req, user);
  const rateLimit = await withRateLimit(user.userId, 'ai_chat', CHAT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many chat turns (${rateLimit.count}/${rateLimit.limit} per minute). Slow down.`,
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (error) {
    return errorResponse(error);
  }

  const last = body.messages.at(-1);
  if (!last || last.role !== 'user') {
    return errorJson('VALIDATION', 'last message must be from the user', 400);
  }
  const userParts = UserMessagePartsSchema.safeParse(last.parts);
  if (!userParts.success) {
    return errorJson('VALIDATION', 'user message contains unsupported or malformed parts', 400);
  }

  let serverEnv: ReturnType<typeof getServerEnv>;
  try {
    serverEnv = getServerEnv();
  } catch (error) {
    return errorResponse(error);
  }

  const aiPrefsHeader = req.headers.get('X-AI-Prefs');
  let customInstructions: string | undefined;
  if (aiPrefsHeader) {
    try {
      const prefs = JSON.parse(aiPrefsHeader) as { customInstructions?: unknown };
      if (typeof prefs.customInstructions === 'string') {
        customInstructions = sanitizeCustomInstructions(prefs.customInstructions);
      }
    } catch {
      // Malformed optional preferences do not invalidate the chat request.
    }
  }

  const thread = await getThread(user.userId, body.threadId);
  if (!thread) return errorJson('NOT_FOUND', 'Thread not found', 404);

  const analysisMode = body.analysisMode ?? 'single';
  const userMessage = { ...last, parts: userParts.data } as UIMessage;
  const userText = extractUserMessageText(userMessage);
  const priorReport = mayReferToMastraReport(userText)
    ? extractLatestMastraReport(await listMessages(user.userId, body.threadId, 100))
    : null;
  const resolvedMode = resolveMode(analysisMode, userText);

  // Injection/jailbreak attempts are always blocked — no model should
  // process them regardless of mutation capability.
  if (isInjectionAttempt(userText)) {
    return errorJson(
      'READ_ONLY_REQUEST_REQUIRED',
      'This request is not eligible for the read-only Mastra research capabilities.',
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
    const mutationKind = classifyMutationRequest(userText);
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
        if (error instanceof MutationExtractionError) {
          return errorJson('MUTATION_EXTRACTION_FAILED', error.message, 422);
        }
        log.error(
          { err: String(error), threadId: body.threadId, mutation: mutationKind },
          'Mutation draft failed',
        );
        return errorJson(
          'MUTATION_DRAFT_FAILED',
          'Could not prepare this mutation for confirmation.',
          502,
        );
      }
    }
    // Fall through — even when mutations are enabled, if neither the model
    // nor the lexical gate flagged it, treat as read-only.
  }

  // Lexical high-confidence mutation gate — only blocks unambiguous trade
  // commands that the model classifier may have missed.
  if (isMutationIntent(userText)) {
    return errorJson(
      'READ_ONLY_REQUEST_REQUIRED',
      'Trade execution requests must go through the confirmation workflow.',
      422,
    );
  }

  try {
    // Full mode remains durable: the web request enqueues a Mastra workflow
    // run (pending snapshot) and the worker claims it. Explicit model
    // overrides are not yet serializable on the run payload, so reject them
    // clearly instead of silently selecting another model.
    if (resolvedMode === 'full') {
      const { settings } = await getUserWithSettings(user.userId);
      if (!settings) {
        return errorJson('ONBOARDING_REQUIRED', 'User settings not found.', 409);
      }
      if (body.modelOverride) {
        return errorJson(
          'INVALID_MODEL_OVERRIDE',
          'Full-mode model overrides are not supported by the durable queue yet.',
          400,
        );
      }
      const resolvedModel = resolveMastraModeModel(settings, serverEnv, null);
      const requestId = req.headers.get('x-request-id') ?? undefined;
      return withDiagnostics(
        user.userId,
        body.threadId,
        async () => {
          try {
            const runId = await enqueueFullAnalysis({
              userId: user.userId,
              threadId: body.threadId,
              userMessageText: userText,
              userMessageParts: userParts.data,
              idempotencyKey: `full:${body.threadId}:${last.id}`,
              traceId: traceIdStorage.getStore() ?? crypto.randomUUID(),
              maxDailyUsd: settings.maxDailyUsd ?? serverEnv.MAX_DAILY_USD ?? 5,
              modelSnapshot: {
                modelId: resolvedModel.modelId,
                providerId: resolvedModel.providerId,
                bareModelId: resolvedModel.bareModelId,
              },
            });
            if (!runId) {
              log.error({ threadId: body.threadId }, 'Full-analysis queue enqueue failed');
              return errorJson('INTERNAL', 'Failed to queue analysis job', 500);
            }
            return Response.json(
              AnalysisQueuedEventSchema.parse({
                type: 'analysis-queued',
                jobId: runId,
                status: 'queued',
              }),
            );
          } catch (enqueueError) {
            log.error({ err: String(enqueueError), threadId: body.threadId }, 'Full-analysis enqueue threw');
            return errorJson(
              'INTERNAL',
              'Failed to queue analysis job.',
              500,
            );
          }
        },
        requestId ? { requestId } : {},
      );
    }

    const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    const symbol = extractMastraSymbol(userText);
    const hasReportFollowup = priorReport !== null && isMastraXauusdFollowupCandidate(userText);

    // Deep XAUUSD analysis and verified-report follow-ups retain their
    // specialized packet/report verifier. This path is always preferred over
    // generic chat when the request is clearly about XAUUSD.
    //
    // Verified reports (kind === 'research') stay buffered until verification
    // completes. Ordinary XAUUSD conversation (kind === 'conversation') streams
    // provider tokens immediately.
    if (
      (symbol === 'XAUUSD' && (isMastraXauusdCandidate(userText) || hasReportFollowup)) ||
      (resolvedMode === 'single' && symbol === 'XAUUSD' && priorReport !== null)
    ) {
      const kind = mastraXauusdChatKind(userText, priorReport !== null);
      if (kind === 'conversation') {
        return runMastraXauusdConversationStreamChat({
          userId: user.userId,
          threadId: body.threadId,
          userMessage,
          prompt: userText,
          modelOverride: body.modelOverride ?? null,
          signal,
          backfillExcludeMessageIdempotencyKey: `ui:${userMessage.id}`,
          ...(priorReport ? { priorReport } : {}),
        });
      }
      const run = await runMastraXauusdChat({
        userId: user.userId,
        threadId: body.threadId,
        userMessage,
        prompt: userText,
        kind,
        modelOverride: body.modelOverride ?? null,
        signal,
        backfillExcludeMessageIdempotencyKey: `ui:${userMessage.id}`,
        ...(priorReport ? { followup: true, priorReport } : {}),
      });
      return mastraChatResponse({
        messageId: crypto.randomUUID(),
        text: run.result.text,
        runId: run.runId,
        modelId: run.modelId,
        providerId: run.providerId,
        report: run.report,
        researchStatus: run.packet.status,
        dataQuality: run.packet.dataQuality,
        packetId: run.packet.packetId,
        observedCost: run.observedCost,
      });
    }

    // Quick and Standard modes use the bounded shared-packet Mastra mode
    // workflow when the user has explicitly named a supported symbol.
    // Symbol-free prompts in these modes fall through to canonical chat.
    if ((resolvedMode === 'quick' || resolvedMode === 'standard') && symbol !== null) {
      if (!isMastraSymbolCandidate(userText)) {
        return errorJson(
          'UNSUPPORTED_RESEARCH_SCOPE',
          'Mastra requires a read-only research request with this symbol.',
          422,
        );
      }
      const run = await runMastraModeChat({
        userId: user.userId,
        threadId: body.threadId,
        userMessage,
        prompt: userText,
        symbol,
        mode: resolvedMode === 'quick' || resolvedMode === 'standard' ? resolvedMode : 'single',
        modelOverride: body.modelOverride ?? null,
        signal,
        backfillExcludeMessageIdempotencyKey: `mastra-mode:${body.threadId}:${userMessage.id}:user`,
      });
      return mastraModeResponse(run);
    }

    // Ordinary symbol-free conversation is handled by the streaming canonical
    // Mastra agent, which owns the reviewed read-only Kestrel tool allowlist.
    return runMastraCanonicalChatStreamService({
      userId: user.userId,
      threadId: body.threadId,
      userMessage,
      modelOverride: body.modelOverride ?? null,
      ...(customInstructions ? { customInstructions } : {}),
      signal,
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return errorJson(
        'BUDGET_EXCEEDED',
        `Daily AI budget exceeded ($${error.spent.toFixed(2)} / $${error.max.toFixed(2)}). Resets at UTC midnight.`,
        429,
      );
    }
    log.error({ err: String(error), threadId: body.threadId }, 'Mastra chat failed');
    return mastraFailureResponse(error);
  }
});
