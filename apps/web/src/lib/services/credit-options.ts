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

import 'server-only';

import { resolveProviderMode, turnCreditIdempotencyKey, type CreditReservationOptions } from '@kestrel/ai';
import type { UserSettingsRow } from '@kestrel/db/schema';

/**
 * Build the credit pre-authorisation descriptor shared by every chat runner.
 *
 * The model snapshot on the execution plan is authoritative; the override /
 * settings / env chain is only a fallback for routes that do not pin one.
 */
export function buildChatCreditOptions(input: {
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  threadId: string;
  userMessageId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  mode: 'single' | 'full';
  executionPlan?: { model?: { providerId: string; bareModelId: string } | null } | null;
  modelOverride?: string | null;
  defaultModel?: string | null;
}): CreditReservationOptions {
  const planModel = input.executionPlan?.model;
  const override = input.modelOverride?.replace(':', '/') ?? null;
  const stored = input.settings.chatModel?.replace(':', '/') ?? null;
  const modelId =
    (planModel ? `${planModel.providerId}/${planModel.bareModelId}` : null) ??
    override ??
    stored ??
    input.defaultModel ??
    null;

  return {
    modelId,
    providerMode: resolveProviderMode(input.settings.aiApiKeys, modelId),
    mode: input.mode,
    idempotencyKey: turnCreditIdempotencyKey({
      threadId: input.threadId,
      userMessageId: input.userMessageId ?? null,
      runId: input.runId ?? null,
      jobId: input.jobId ?? null,
    }),
    threadId: input.threadId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
  };
}
