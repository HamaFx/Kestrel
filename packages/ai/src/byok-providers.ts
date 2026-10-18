import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderId } from '@kestrel/shared/byok';
import type { EmbeddingModel } from 'ai';

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

// BYOK provider registry — re-export barrel.
//
// Types, helpers, and individual provider specs live under _providers/.
// The registry (BYOK_PROVIDERS, helper functions) lives in _providers/registry.ts.
// This barrel re-exports everything so all existing imports remain unchanged.
//
// ─── Adding a provider (checklist) ─────────────────────────────────────
//   1. Add the id to PROVIDER_IDS + ByokPayload in packages/shared/src/byok.ts
//   2. Create a new provider file under _providers/ using defineProvider()
//   3. Import and register it in _providers/registry.ts
//   4. If native SDK support is available, import createX from @ai-sdk/<x>
//      otherwise use openaiCompatibleFactory from _providers/helpers.ts
//   5. List flagship + fast/cheap + vision/embedding models with pricing
//   6. Ensure defaultModels.* ids exist in models[] (defineProvider checks this)
//   7. (Optional) extend envFallbackKeys() in model.ts for operator env keys
//   8. Add/adjust unit tests if defaults or capabilities change
//
// Catalog last reviewed against provider docs: 2026-07-14.

// Types
export type {
  ModelDomain,
  ModelSpec,
  ByokProviderModels,
  ByokProviderSpec,
} from './_providers/types';

// Registry and helper functions (the primary public API)
export {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  getProvider,
  defaultModelFor,
  lookupModelRate,
  buildCatalogRateTable,
} from './_providers/registry';

export interface ProviderCapability {
  supportsVision: boolean;
  supportsEmbedding: boolean;
  supportsToolCalling: boolean;
  modelPrefix: string;
}

/**
 * Static map of provider capabilities. Prevents re-deriving capabilities
 * on every routing turn.
 */
export const providerCapabilities: Record<ProviderId, ProviderCapability> = {
  google: {
    supportsVision: true,
    supportsEmbedding: true,
    supportsToolCalling: true,
    modelPrefix: 'google/',
  },
  anthropic: {
    supportsVision: true,
    supportsEmbedding: false,
    supportsToolCalling: true,
    modelPrefix: 'anthropic/',
  },
  openai: {
    supportsVision: true,
    supportsEmbedding: true,
    supportsToolCalling: true,
    modelPrefix: 'openai/',
  },
  groq: {
    supportsVision: true,
    supportsEmbedding: false,
    supportsToolCalling: true,
    modelPrefix: 'groq/',
  },
  mistral: {
    supportsVision: true,
    supportsEmbedding: true,
    supportsToolCalling: true,
    modelPrefix: 'mistral/',
  },
  openrouter: {
    supportsVision: true,
    supportsEmbedding: false,
    supportsToolCalling: true,
    modelPrefix: 'openrouter/',
  },
  xai: {
    supportsVision: true,
    supportsEmbedding: false,
    supportsToolCalling: true,
    modelPrefix: 'xai/',
  },
  deepseek: {
    supportsVision: false,
    supportsEmbedding: false,
    supportsToolCalling: true,
    modelPrefix: 'deepseek/',
  },
  iamhc: {
    supportsVision: true,
    supportsEmbedding: false,
    supportsToolCalling: true,
    modelPrefix: 'iamhc/',
  },
  hcnsec: {
    supportsVision: false,
    supportsEmbedding: false,
    supportsToolCalling: true,
    modelPrefix: 'hcnsec/',
  },
};

/**
 * Instantiate an EmbeddingModel for direct provider BYOK calls without
 * requiring the global Vercel AI Gateway (AI_GATEWAY_API_KEY).
 */
export function buildByokEmbeddingModel(
  provider: ProviderId,
  modelId: string,
  apiKey: string,
): EmbeddingModel {
  const bareModelId = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;
  switch (provider) {
    case 'google':
      return createGoogle({ apiKey }).embeddingModel(bareModelId);
    case 'openai':
      return createOpenAICompatible({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey,
      }).embeddingModel(bareModelId);
    case 'mistral':
      return createOpenAICompatible({
        name: 'mistral',
        baseURL: 'https://api.mistral.ai/v1',
        apiKey,
      }).embeddingModel(bareModelId);
    default:
      throw new Error(`Provider "${provider}" does not support direct text embeddings.`);
  }
}
