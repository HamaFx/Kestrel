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

// Unified model resolution helper across roles (chat, title, planner, embedding, vision).
// Deduplicates fallback chains and provider priority checks into a single function.

import { PROVIDER_IDS } from '@kestrel/shared/byok';
import { configuredProviders, type ByokPayload, type ProviderId } from '@kestrel/shared/encryption';
import type { LanguageModel } from 'ai';

import { BYOK_PROVIDERS, type ModelDomain } from './byok-providers';
import type { ResolveModelEnv } from './env-model-factory';
import { isCircuitOpen } from './model-circuit-breaker';
import { envFallbackKeys, parsePickedModelId, PROVIDER_PRIORITY } from './model-helpers';

export type ModelRole = 'chat' | 'title' | 'planner' | 'embedding' | 'vision';

export interface ResolveRoleOptions {
  userSettings?:
    | {
        chatModel?: string | null | undefined;
        embeddingModel?: string | null | undefined;
        visionModel?: string | null | undefined;
        aiFallbackChain?: readonly string[] | string[] | null | undefined;
      }
    | undefined;
  domain?: ModelDomain | undefined;
}

export interface ModelRoleResolution {
  providerId: ProviderId;
  bareModelId: string;
  modelId: string;
  model?: LanguageModel | undefined;
}

/**
 * Return configured providers in priority order, respecting userSettings.aiFallbackChain.
 */
export function getAvailableProviders(
  keys: ByokPayload,
  userSettings?: { aiFallbackChain?: readonly string[] | string[] | null | undefined } | null,
): ProviderId[] {
  const available = configuredProviders(keys);
  const availableSet = new Set(available);
  const customChain = Array.isArray(userSettings?.aiFallbackChain)
    ? (userSettings.aiFallbackChain as ProviderId[])
    : [];
  const orderedPriority = [
    ...customChain.filter((p) => (PROVIDER_IDS as readonly string[]).includes(p)),
    ...PROVIDER_PRIORITY.filter((p) => !customChain.includes(p)),
  ];
  return orderedPriority.filter((p) => availableSet.has(p));
}

/**
 * Resolve a model for a specific operational role using a unified fallback chain:
 * 1. User explicit pick (if provided in options and valid)
 * 2. Role-specific fallback (e.g. operator env for embedding, summary model for title)
 * 3. Priority-ordered configured providers
 * 4. Universal platform default
 */
export function resolveModelForRole(
  role: ModelRole,
  byok: ByokPayload,
  envFallback: ResolveModelEnv,
  options?: ResolveRoleOptions,
): ModelRoleResolution {
  const keys: ByokPayload = {
    ...envFallbackKeys(envFallback),
    ...(byok ?? {}),
  };

  const configured = getAvailableProviders(keys, options?.userSettings);

  if (role === 'embedding') {
    // 1. User's explicit pick
    if (options?.userSettings?.embeddingModel) {
      const parsed = parsePickedModelId(options.userSettings.embeddingModel, keys);
      if (parsed && parsed.spec.supports.embedding) {
        return {
          providerId: parsed.providerId,
          bareModelId: parsed.bareModelId,
          modelId: `${parsed.providerId}/${parsed.bareModelId}`,
        };
      }
    }

    // 2. Operator-set env fallback
    if (envFallback.AI_EMBEDDING_MODEL) {
      const slash = envFallback.AI_EMBEDDING_MODEL.indexOf('/');
      const providerId = (
        slash > 0 ? envFallback.AI_EMBEDDING_MODEL.slice(0, slash) : 'openai'
      ) as ProviderId;
      const bareModelId =
        slash > 0
          ? envFallback.AI_EMBEDDING_MODEL.slice(slash + 1)
          : envFallback.AI_EMBEDDING_MODEL;
      return {
        providerId,
        bareModelId,
        modelId: envFallback.AI_EMBEDDING_MODEL,
      };
    }

    // 3. Configured provider defaults
    for (const providerId of configured) {
      const spec = BYOK_PROVIDERS[providerId];
      if (spec?.supports.embedding && spec.defaultModels.embedding) {
        return {
          providerId,
          bareModelId: spec.defaultModels.embedding,
          modelId: `${providerId}/${spec.defaultModels.embedding}`,
        };
      }
    }

    // 4. Universal default
    return {
      providerId: 'openai',
      bareModelId: 'text-embedding-3-small',
      modelId: 'openai/text-embedding-3-small',
    };
  }

  if (role === 'vision') {
    // 1. User explicit pick
    if (options?.userSettings?.visionModel) {
      const parsed = parsePickedModelId(options.userSettings.visionModel, keys);
      if (parsed && parsed.spec.supports.vision) {
        return {
          providerId: parsed.providerId,
          bareModelId: parsed.bareModelId,
          modelId: `${parsed.providerId}/${parsed.bareModelId}`,
          model: parsed.spec.factory(parsed.apiKey)(parsed.bareModelId),
        };
      }
    }

    // 2. Highest-priority configured provider supporting vision
    for (const providerId of configured) {
      const spec = BYOK_PROVIDERS[providerId];
      if (!spec?.supports.vision || !spec.defaultModels.vision) continue;
      // Audit plan §1.4 (P0-4) — the breaker is keyed by model id: skip
      // only when this provider's vision model specifically has an open
      // circuit, not the whole provider.
      if (isCircuitOpen(`${providerId}/${spec.defaultModels.vision}`)) continue;
      const apiKey = keys[providerId]!;
      return {
        providerId,
        bareModelId: spec.defaultModels.vision,
        modelId: `${providerId}/${spec.defaultModels.vision}`,
        model: spec.factory(apiKey)(spec.defaultModels.vision),
      };
    }

    throw new Error('No vision-capable model available. Configure a provider supporting vision.');
  }

  // Base chat resolution (shared by chat, title, and planner)
  let chatResolution: ModelRoleResolution | undefined;

  // 1. Explicit pick for chat
  if (options?.userSettings?.chatModel) {
    const value = options.userSettings.chatModel;
    const sep = value.indexOf(':');
    if (sep >= 0) {
      const providerIdRaw = value.slice(0, sep);
      const bareModelId = value.slice(sep + 1);
      if (PROVIDER_IDS.includes(providerIdRaw as ProviderId)) {
        const providerId = providerIdRaw as ProviderId;
        const apiKey = keys[providerId];
        if (typeof apiKey === 'string' && apiKey.length > 0) {
          const spec = BYOK_PROVIDERS[providerId];
          if (spec) {
            const known = (spec.models ?? []).some(
              (m: { modelId: string }) => m.modelId === bareModelId,
            );
            if (known && !isCircuitOpen(`${spec.id}/${bareModelId}`)) {
              chatResolution = {
                providerId,
                bareModelId,
                modelId: `${spec.id}/${bareModelId}`,
                model: spec.factory(apiKey)(bareModelId),
              };
            }
          }
        }
      }
    }
  }

  // 2. Fall back to priority loop if no explicit chat pick
  if (!chatResolution) {
    const tier: ModelDomain = options?.domain ?? 'technical';
    let chosenProvider: ProviderId | undefined;
    for (const p of configured) {
      const bareModelId = BYOK_PROVIDERS[p]?.defaultModels[tier];
      if (!bareModelId) continue;
      // Audit plan §1.4 (P0-4) — the breaker is keyed by model id: skip a
      // provider only when the tier-default model this resolution would
      // actually use has an open circuit, not the whole provider.
      if (isCircuitOpen(`${p}/${bareModelId}`)) continue;
      chosenProvider = p;
      break;
    }

    if (!chosenProvider) {
      if (configured.length === 0) {
        throw new Error(
          'No AI API keys configured. Add a provider key in Settings → API Keys, ' +
            'or visit /onboarding to walk through the setup wizard.',
        );
      }
      throw new Error('No configured provider available (all circuits are open).');
    }

    const spec = BYOK_PROVIDERS[chosenProvider];
    const apiKey = keys[chosenProvider]!;
    const bareModelId = spec.defaultModels[tier];
    if (!bareModelId) {
      throw new Error(`Provider ${chosenProvider} has no default ${tier} model configured.`);
    }

    chatResolution = {
      providerId: chosenProvider,
      bareModelId,
      modelId: `${spec.id}/${bareModelId}`,
      model: spec.factory(apiKey)(bareModelId),
    };
  }

  if (role === 'chat') {
    return chatResolution;
  }

  // Role title or planner: prefer summary model of the chat provider
  const chatSpec = BYOK_PROVIDERS[chatResolution.providerId];
  const summaryModel = chatSpec?.defaultModels.summary;
  if (summaryModel) {
    const apiKey = keys[chatResolution.providerId];
    return {
      providerId: chatResolution.providerId,
      bareModelId: summaryModel,
      modelId: `${chatResolution.providerId}/${summaryModel}`,
      model: apiKey ? chatSpec.factory(apiKey)(summaryModel) : undefined,
    };
  }

  return chatResolution;
}
