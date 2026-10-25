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

// Durable Full-analysis dispatch: enqueue a Mastra workflow run (pending
// snapshot) for the worker to claim.
//
// Q7 decision: the user's model override is serialized onto the queue payload
// through the execution plan's immutable model snapshot, and the worker
// resolves exactly that model from the row (no failover). If the override
// cannot be resolved at enqueue time, fail closed with a clear message.

import type { UserSettingsRow } from '@kestrel/db';

import type { getServerEnv } from '@/lib/env';
import type { createRequestLogger } from '@/lib/logger';
import {
  AnalysisQueuedEventSchema,
  enqueueFullAnalysis,
  resolveMastraModeModel,
  resolveProviderMode,
  traceIdStorage,
  withDiagnostics,
  type ExecutionPlan,
} from '@/lib/services/api-boundary';

import { errorJson } from './errors';
import type { ChatUserParts } from './request-validation';

type RequestLogger = ReturnType<typeof createRequestLogger>;

export async function enqueueFullAnalysisResponse(args: {
  userId: string;
  threadId: string;
  requestId: string | undefined;
  userMessageText: string;
  userMessageParts: ChatUserParts;
  lastMessageId: string;
  settings: UserSettingsRow;
  serverEnv: ReturnType<typeof getServerEnv>;
  modelOverride: string | null;
  executionPlan: ExecutionPlan;
  log: RequestLogger;
}): Promise<Response> {
  const { userId, threadId, settings, serverEnv, modelOverride, executionPlan, log } = args;

  let resolvedModel: ReturnType<typeof resolveMastraModeModel>;
  try {
    resolvedModel = resolveMastraModeModel(settings, serverEnv, modelOverride, executionPlan);
  } catch {
    return errorJson(
      'MODEL_OVERRIDE_UNAVAILABLE',
      'The selected model is unavailable for durable Full analysis. Pick another model or run the request as Single instead.',
      422,
    );
  }

  return withDiagnostics(
    userId,
    threadId,
    async () => {
      try {
        const runId = await enqueueFullAnalysis({
          userId,
          threadId,
          userMessageText: args.userMessageText,
          userMessageParts: args.userMessageParts,
          idempotencyKey: `full:${threadId}:${args.lastMessageId}`,
          traceId: traceIdStorage.getStore() ?? crypto.randomUUID(),
          maxDailyUsd: settings.maxDailyUsd ?? serverEnv.MAX_DAILY_USD ?? 5,
          modelSnapshot: {
            modelId: resolvedModel.modelId,
            providerId: resolvedModel.providerId,
            bareModelId: resolvedModel.bareModelId,
          },
          providerMode: resolveProviderMode(settings.aiApiKeys, resolvedModel.modelId),
          executionPlan: executionPlan ?? undefined,
        });
        if (!runId) {
          log.error({ threadId }, 'Full-analysis queue enqueue failed');
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
        log.error({ err: String(enqueueError), threadId }, 'Full-analysis enqueue threw');
        return errorJson('INTERNAL', 'Failed to queue analysis job.', 500);
      }
    },
    args.requestId ? { requestId: args.requestId } : {},
  );
}
