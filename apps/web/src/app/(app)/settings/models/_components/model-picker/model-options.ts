// SPDX-License-Identifier: Apache-2.0

// Catalog filtering + option shaping for the generic per-domain model picker
// (chat / vision / embedding), shared by the fetch hook and the option rows.

import type { ProviderMeta } from '@kestrel/shared';

export type ModelPickerKind = 'chat' | 'vision' | 'embedding';

export interface ModelOption {
  value: string;
  label: string;
  providerLabel: string;
  tier: string;
  inputPrice?: number | null | undefined;
  outputPrice?: number | null | undefined;
}

export const ENDPOINTS: Record<ModelPickerKind, string> = {
  chat: '/api/settings/chat-model',
  vision: '/api/settings/vision-model',
  embedding: '/api/settings/embedding-model',
};

export const RESPONSE_KEYS: Record<
  ModelPickerKind,
  'chatModel' | 'visionModel' | 'embeddingModel'
> = {
  chat: 'chatModel',
  vision: 'visionModel',
  embedding: 'embeddingModel',
};

/**
 * IconFilter that decides whether a model in the catalog should appear
 * in the picker for a given kind. Three checks:
 *   - tier: chat/vision forbid 'embedding'; embedding only allows 'embedding'
 *   - provider.supports: vision requires supports.vision; embedding
 *     requires supports.embedding
 *   - chat allows any non-embedding tier
 */
export function isModelAllowedForKind(
  tier: string | undefined,
  supports: { vision?: boolean; embedding?: boolean } | undefined,
  kind: ModelPickerKind,
): boolean {
  const t = tier ?? 'flagship';
  if (kind === 'chat') {
    return t !== 'embedding';
  }
  if (kind === 'vision') {
    if (t === 'embedding') return false;
    return Boolean(supports?.vision);
  }
  // embedding
  if (t !== 'embedding') return false;
  return Boolean(supports?.embedding);
}

// IconFilter options by domain. Same shape as the ChatModelPicker of
// Phase F but tier- + capability-aware so embedding-only models
// never surface in the chat picker, etc.
export function providerOptions(provider: ProviderMeta, kind: ModelPickerKind): ModelOption[] {
  const options: ModelOption[] = [];
  for (const model of provider.models) {
    if (!isModelAllowedForKind(model.tier, provider.supports, kind)) continue;
    options.push({
      value: `${provider.id}:${model.modelId}`,
      label: model.label ?? model.modelId,
      providerLabel: provider.displayName,
      tier: model.tier ?? 'flagship',
      inputPrice: model.inputPerMTokUsd,
      outputPrice: model.outputPerMTokUsd,
    });
  }
  return options;
}

export function buildModelOptions(providers: ProviderMeta[], kind: ModelPickerKind): ModelOption[] {
  return providers.flatMap((provider) => providerOptions(provider, kind));
}
