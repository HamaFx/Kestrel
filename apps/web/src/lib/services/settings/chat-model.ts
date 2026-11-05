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

// User model pickers: the single save path shared by the Settings server
// actions and `PUT /api/settings/{chat,vision,embedding}-model`.
//
// Every role enforces the same contract: the provider exists in the BYOK
// catalog, the user owns a key for it (the catalog only exposes keyed
// providers, so a forged request cannot save an unavailable one), the model id
// is in the provider's catalog, and the role-specific capability holds. Chat
// additionally rejects embedding-only models. Model ids keep their exact
// catalog spelling, including slash-containing OpenRouter ids.

import { BYOK_PROVIDERS } from '@kestrel/ai';
import { getUserWithSettings, updateUserSettingsField } from '@kestrel/db';
import { decryptByok, type ProviderId } from '@kestrel/shared/encryption';

type UserModelRole = 'chat' | 'vision' | 'embedding';

const ROLE_SETTINGS = {
  chat: { field: 'chatModel', label: 'chat model' },
  vision: { field: 'visionModel', label: 'vision model' },
  embedding: { field: 'embeddingModel', label: 'embedding model' },
} as const satisfies Record<UserModelRole, { field: string; label: string }>;

function apiError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Validate a role-specific model selection and persist it.
 *
 * Returns the persisted `providerId:bareModelId` value. Errors carry a
 * `statusCode` so `errorResponse` maps them to the right HTTP status.
 */
export async function validateAndSaveUserModel(
  userId: string,
  role: UserModelRole,
  providerId: ProviderId,
  modelId: string,
): Promise<{ model: string }> {
  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) {
    throw apiError(`Unknown provider: ${providerId}`, 400);
  }

  const config = ROLE_SETTINGS[role];
  if (role === 'vision' && !spec.supports.vision) {
    throw apiError(`Provider ${providerId} does not support vision`, 400);
  }
  if (role === 'embedding' && !spec.supports.embedding) {
    throw apiError(`Provider ${providerId} does not support embedding`, 400);
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

  const pickedModel = spec.models.find((model) => model.modelId === bareModelId);
  if (!pickedModel) {
    throw apiError(`Model ${modelId} is not in the ${providerId} catalog`, 400);
  }
  if (role === 'chat' && pickedModel.tier === 'embedding') {
    throw apiError(
      `${modelId} is an embedding-only model and can't be used as a chat model. ` +
        `Pick a chat-capable model (flagship / pro / fast / lite) instead.`,
      400,
    );
  }

  const value = `${providerId}:${bareModelId}`;
  await updateUserSettingsField(userId, config.field, value);
  return { model: value };
}
