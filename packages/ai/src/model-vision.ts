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

// P1-1 — Extracted from model.ts. Vision model resolution.
//
// Dependency: model-helpers.ts (parsePickedModelId, PROVIDER_PRIORITY,
// envFallbackKeys).

import type { UserSettingsRow } from '@kestrel/db/schema';
import {
  decryptByok,
  type ProviderId,
} from '@kestrel/shared/encryption';
import type { LanguageModel } from 'ai';

import type { ResolveModelEnv } from './env-model-factory';
import { resolveModelForRole } from './model-role';

/**
 * Phase D2 — result of resolving the user's "default vision model".
 * Used by `analyze_chart_image` and any other vision-capable tools.
 * Same shape as `ChatModelResolution` so callers can pass `.model`
 * straight into `generateText({ model })`.
 */
export interface VisionModelResolution {
  model: LanguageModel;
  /** Qualified id "google/gemini-2.5-pro". */
  modelId: string;
  providerId: ProviderId;
  bareModelId: string;
}

/**
 * Resolve the user's default vision model.
 *
 * Decision tree:
 *   1. If `userSettings.visionModel` is set + valid (provider supports
 *      vision AND model is in the spec catalog) → use it.
 *   2. Else pick the highest-priority configured provider's
 *      `spec.defaultModels.vision`. (Vision is a rarer capability
 *      than chat; if the user's primary BYOK doesn't declare a vision
 *      model, the resolver falls back to the next configured provider.)
 *   3. Else throw.
 *
 * Note: a user with Google + Anthropic keys can still
 * pick `google:gemini-2.5-pro` for vision even though their
 * chat model is Anthropic. The pick is independent.
 *
 * Phase D2 — AI_VISION_MODEL env var was removed. Operators no
 * longer override the vision model; BYOK users own this choice.
 * (Embedding still has AI_EMBEDDING_MODEL as the gateway fallback
 * because embeddings are cross-vendor via OpenAI's embedding API.)
 */
export function resolveVisionModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'visionModel'>,
  env: ResolveModelEnv,
): VisionModelResolution {
  const stored = decryptByok(userSettings.aiApiKeys);
  const res = resolveModelForRole('vision', stored ?? {}, env, {
    userSettings: { visionModel: userSettings.visionModel },
  });
  return {
    model: res.model!,
    modelId: res.modelId,
    providerId: res.providerId,
    bareModelId: res.bareModelId,
  };
}
