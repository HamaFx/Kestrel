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

// Low-level environment-based model resolution.
//
// Resolves models using server-level credentials:
//   - AI_GATEWAY_API_KEY (routes via Vercel AI Gateway)
//   - GOOGLE_GENERATIVE_AI_API_KEY (direct Google Gemini API for google/* models)

import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export interface ResolveModelEnv {
  AI_GATEWAY_API_KEY?: string | undefined;
  GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
  /**
   * Operator-set platform default for the embedding model.
   * Defaults to openai/text-embedding-3-small via AI Gateway.
   */
  AI_EMBEDDING_MODEL?: string | undefined;
}

/**
 * Resolve a model id to either:
 *   - a `LanguageModel` instance (direct Google Gemini), or
 *   - the same string (gateway mode).
 *
 * Throws if no transport is configured for the requested id.
 */
export function resolveModel(
  modelId: string,
  env: ResolveModelEnv,
  _tenantId?: string,
): LanguageModel | string {
  if (env.AI_GATEWAY_API_KEY) {
    return modelId;
  }

  if (modelId.startsWith('google/')) {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY is required to use a `google/...` model when AI_GATEWAY_API_KEY is not set',
      );
    }
    const bareId = modelId.slice('google/'.length);
    return google(bareId);
  }

  throw new Error(
    `Cannot resolve model "${modelId}". Set AI_GATEWAY_API_KEY for gateway routing, or use a "google/..." id with GOOGLE_GENERATIVE_AI_API_KEY.`,
  );
}
