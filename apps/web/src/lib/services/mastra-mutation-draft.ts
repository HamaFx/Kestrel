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

/**
 * Mutation draft entry point for the chat boundary.
 *
 * When the mutation capability is enabled and the user clearly asks for a
 * supported mutation (alert / journal / share / system action), this service
 * classifies the request, extracts a structured input with the fast model,
 * and starts the confirmation workflow — which suspends at `draft` and
 * returns the confirmation-card payload (single-use token + summary).
 *
 * Nothing is written here: the draft only mints + persists the token digest.
 * The actual write happens on the confirm route after the user confirms.
 */

import { deriveTitleModel } from '@kestrel/ai';
import {
  assertMastraMutationDraftAllowed,
  classifyMutationRequest,
  createMutationWorkflow,
  extractMutationInput,
  getKestrelMastra,
  MutationExtractionError,
  resolveModel,
  runMutationWorkflow,
  type MutationKind,
  type MutationSuspendPayload,
} from '@kestrel/ai/mastra';
import { getUserRole, getUserWithSettings, type UserSettingsRow } from '@kestrel/db';
import type { LanguageModel } from 'ai';

import { getServerEnv } from '@/lib/env';
import { createCategorizedLogger } from '@/lib/logger';

const mlog = createCategorizedLogger('ai', { component: 'mutation-draft' });

export interface StartMutationDraftArgs {
  userId: string;
  threadId: string;
  /** The full user prompt that classified as a mutation request. */
  userText: string;
  /** Pre-classified mutation kind (avoids double classification by the route). */
  kind?: MutationKind;
}

export interface StartMutationDraftResult {
  type: 'mutation-draft';
  payload: MutationSuspendPayload;
}

/**
 * Classify + extract + start a mutation draft. Throws on policy/extraction
 * failures so the chat route can map them to HTTP responses.
 */
export async function startMutationDraft(
  args: StartMutationDraftArgs,
): Promise<StartMutationDraftResult> {
  const { userId, threadId, userText } = args;

  // Use the pre-classified kind from the route when available, avoiding
  // a redundant classification call.
  const kind = args.kind ?? classifyMutationRequest(userText);
  if (!kind) {
    throw new MutationExtractionError(
      'No supported mutation detected in this request.',
      'set_alert',
    );
  }

  assertMastraMutationDraftAllowed({ mutation: kind, userId, threadId });

  const isAdmin =
    kind === 'run_system_action' ? (await getUserRole(userId)) === 'admin' : undefined;
  const { settings } = await getUserWithSettings(userId);
  const settingsRow = settings as unknown as
    Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> | null | undefined;
  const env = getServerEnv();
  const extractionModelId = deriveTitleModel(
    settingsRow ?? { aiApiKeys: null, chatModel: null },
    env,
  );
  if (!extractionModelId) {
    throw new MutationExtractionError('No model is configured for mutation extraction.', kind);
  }

  // Resolve through the same BYOK transport the agents use. A string means a
  // gateway-only env with no direct provider key — extraction needs a real
  // model, so fail clearly instead of guessing.
  const resolved = resolveModel(extractionModelId, env, userId) as LanguageModel | string;
  if (typeof resolved === 'string') {
    throw new MutationExtractionError(
      'No direct provider model is configured for mutation extraction.',
      kind,
    );
  }

  const input = await extractMutationInput({
    kind,
    text: userText,
    model: resolved,
    userId,
    threadId,
  });

  const mastra = getKestrelMastra().instance;
  const workflow = createMutationWorkflow({
    mutation: kind,
    userId,
    threadId,
    // The draft suspends before execute; the confirm route builds the real
    // executor. A stub here is a defensive tripwire.
    execute: async () => {
      throw new Error('mutation executor is only wired on the confirm route');
    },
    ...(isAdmin !== undefined ? { isAdmin } : {}),
    writeAudit: async () => {},
    mastra,
  });

  const result = await runMutationWorkflow(workflow, {
    input,
    userId,
    threadId,
  });

  if (result.status !== 'suspended' || !result.suspendPayload) {
    mlog.error({ kind, runId: result.runId }, 'mutation draft did not suspend as expected');
    throw new Error('Mutation draft could not be prepared. Please try again.');
  }

  return { type: 'mutation-draft', payload: result.suspendPayload };
}
