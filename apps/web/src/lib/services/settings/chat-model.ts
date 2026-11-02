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

// Chat-model picker: the single save path shared by `PUT /api/settings/chat-model`
// and the Settings server action.
//
// Phase 3 Task 3 — the action used to save the raw `providerId:modelId` string
// with no checks while the API route enforced API-key ownership, catalog
// membership, and the embedding-tier rule. Both callers now go through this
// function so a forged action payload cannot save an unavailable provider or
// an embedding-only model as the chat model.

import { BYOK_PROVIDERS } from '@kestrel/ai';
import { getUserWithSettings, updateUserSettingsField } from '@kestrel/db';
import { decryptByok, type ProviderId } from '@kestrel/shared/encryption';

function apiError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Validate a chat-model selection and persist it.
 *
 * Enforces, in order:
 *   1. the provider exists in the BYOK catalog,
 *   2. the user owns an API key for it (the catalog only exposes keyed
 *      providers, so a forged request cannot save an unavailable one and
 *      later silently fall back to another model),
 *   3. the model id is in the provider's catalog,
 *   4. the model is not embedding-only (chat turns cannot consume one).
 *
 * Returns the persisted `providerId:bareModelId` value. Errors carry a
 * `statusCode` so `errorResponse` maps them to the right HTTP status.
 */
export async function validateAndSaveChatModel(
  userId: string,
  providerId: ProviderId,
  modelId: string,
): Promise<{ chatModel: string }> {
  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) {
    throw apiError(`Unknown provider: ${providerId}`, 400);
  }

  const { settings } = await getUserWithSettings(userId);
  const keys = decryptByok(settings?.aiApiKeys);
  const apiKey = keys?.[providerId];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw apiError(`No API key configured for provider: ${providerId}`, 403);
  }

  // Preserve the exact catalog model id. Some providers (notably OpenRouter)
  // intentionally use slash-containing ids such as "anthropic/claude-sonnet".
  const bareModelId = modelId.startsWith(`${providerId}/`)
    ? modelId.slice(providerId.length + 1)
    : modelId;

  // Phase D2 — defense in depth. The picker UI filters out tier: 'embedding'
  // models, but a direct API call could still store one.
  const pickedModel = spec.models.find((model) => model.modelId === bareModelId);
  if (!pickedModel) {
    throw apiError(`Model ${modelId} is not in the ${providerId} catalog`, 400);
  }
  if (pickedModel.tier === 'embedding') {
    throw apiError(
      `${modelId} is an embedding-only model and can't be used as a chat model. ` +
        `Pick a chat-capable model (flagship / pro / fast / lite) instead.`,
      400,
    );
  }

  const value = `${providerId}:${bareModelId}`;
  await updateUserSettingsField(userId, 'chatModel', value);
  return { chatModel: value };
}
