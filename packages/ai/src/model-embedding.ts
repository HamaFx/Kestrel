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

// P1-1 — Extracted from model.ts. Embedding model resolution.
//
// Dependency: model-helpers.ts (parsePickedModelId, PROVIDER_PRIORITY,
// envFallbackKeys).

import type { UserSettingsRow } from '@kestrel/db/schema';
import { decryptByok } from '@kestrel/shared/encryption';
import type { EmbeddingModel } from 'ai';

import { buildByokEmbeddingModel, providerCapabilities } from './byok-providers';
import type { ResolveModelEnv } from './env-model-factory';
import { envFallbackKeys } from './model-helpers';
import { resolveModelForRole } from './model-role';

export interface EmbeddingModelResolutionDetails {
  model: EmbeddingModel | string;
  modelId: string;
}

/**
 * Phase D2 — result of resolving the user's default embedding model.
 * Returns the qualified model id string.
 */
export type EmbeddingModelResolution = string;

/**
 * Resolve the user's default embedding model details, returning both the
 * qualified model id string and an instantiated EmbeddingModel instance
 * when a direct provider BYOK key is configured.
 */
export function resolveEmbeddingModelDetails(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>,
  env: ResolveModelEnv,
): EmbeddingModelResolutionDetails {
  const stored = decryptByok(userSettings.aiApiKeys);
  const res = resolveModelForRole('embedding', stored ?? {}, env, {
    userSettings: { embeddingModel: userSettings.embeddingModel },
  });

  const providerId = res.providerId;
  const keys = {
    ...envFallbackKeys(env),
    ...(stored ?? {}),
  };
  const apiKey = keys[providerId];

  if (apiKey && providerCapabilities[providerId]?.supportsEmbedding) {
    try {
      const model = buildByokEmbeddingModel(providerId, res.bareModelId, apiKey);
      return { model, modelId: res.modelId };
    } catch {
      // Fall through to modelId string (Gateway routing)
    }
  }

  return { model: res.modelId, modelId: res.modelId };
}

/**
 * Resolve the user's default embedding model.
 *
 * Decision tree:
 *   1. If `userSettings.embeddingModel` is set + valid → use it.
 *   2. Else if `env.AI_EMBEDDING_MODEL` is set (operator override) →
 *      use it. The default is `openai/text-embedding-3-small` which
 *      routes through the AI Gateway.
 *   3. Else pick the highest-priority configured provider's
 *      `spec.defaultModels.embedding`.
 *   4. Else return the hardcoded universal default
 *      `openai/text-embedding-3-small` (works across providers via
 *      the AI Gateway; OpenAI's text-embedding-3-small has the
 *      widest cross-vendor compatibility).
 */
export function resolveEmbeddingModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>,
  env: ResolveModelEnv,
): EmbeddingModelResolution {
  return resolveEmbeddingModelDetails(userSettings, env).modelId;
}
