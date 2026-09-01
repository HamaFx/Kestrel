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

// Model resolution helpers — shared by the single-agent retry loop,
// multi-agent orchestration, and all Mastra composition edges.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { ByokPayload, ProviderId } from '@kestrel/shared/encryption';
import { z } from 'zod';

import { BYOK_PROVIDERS, type ModelDomain } from './byok-providers';
import { resolveChatModel, resolveModelForProvider, type ChatModelResolution } from './model-chat';
// ---------------------------------------------------------------------------
// Legacy fallback helpers retained for non-Mastra callers.
// ---------------------------------------------------------------------------

import type { RoutingDomain } from './routing';
import type { ResolveModelEnv } from './vertex-factory';

export type { ChatModelResolution } from './model-chat';

export type MastraModelPurpose = 'canonical-chat' | 'mode' | 'xauusd' | 'worker';

export const MastraModelSnapshotSchema = z
  .object({
    providerId: z.string().min(1),
    bareModelId: z.string().min(1),
  })
  .strict();

export interface MastraModelSnapshot {
  readonly providerId: string;
  readonly bareModelId: string;
}

/** Immutable, auditable result shared by every Mastra execution path. */
export interface MastraResolvedModel extends ChatModelResolution {
  purpose: MastraModelPurpose;
  domain: ModelDomain;
  snapshot: MastraModelSnapshot;
}

export interface ResolveMastraModelInput {
  purpose: MastraModelPurpose;
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  env: ResolveModelEnv;
  domain: ModelDomain;
  modelOverride?: string | null;
  /** Immutable enqueue-time selection. When present, no provider failover is allowed. */
  snapshot?: MastraModelSnapshot;
}

function configuredOverride(value: string | null | undefined): string | null {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('Mastra model overrides must use the provider:model format.');
  }
  return value;
}

function pinnedModelFor(purpose: MastraModelPurpose): string | null {
  if (purpose === 'mode')
    return process.env.MASTRA_MODE_MODEL ?? process.env.MASTRA_XAUUSD_MODEL ?? null;
  if (purpose === 'xauusd') return process.env.MASTRA_XAUUSD_MODEL ?? null;
  if (purpose === 'worker')
    return process.env.MASTRA_WORKER_MODEL ?? process.env.MASTRA_MODE_MODEL ?? null;
  return null;
}

/**
 * Resolve every Mastra model through one contract.
 *
 * `snapshot` is authoritative for durable worker jobs. Otherwise the caller's
 * explicit override wins, then the purpose-specific operator pin, then the
 * user's normal chat selection/default. XAUUSD reports intentionally ignore a
 * normal chat selection unless explicitly overridden or pinned because that
 * pipeline has a bounded technical-model contract.
 */
export function resolveMastraModel(args: ResolveMastraModelInput): ChatModelResolution {
  if (args.snapshot) {
    const providerId = args.snapshot.providerId as ProviderId;
    return resolveModelForProvider(
      providerId,
      args.settings,
      args.env,
      args.snapshot.bareModelId,
      args.domain,
    );
  }

  const selected = configuredOverride(args.modelOverride) ?? pinnedModelFor(args.purpose);
  if (selected) {
    return resolveChatModel(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: selected },
      args.env,
      args.domain,
    );
  }

  if (args.purpose === 'xauusd') {
    return resolveChatModel(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: null },
      args.env,
      args.domain,
    );
  }
  return resolveChatModel(args.settings, args.env, args.domain);
}

export function resolveMastraExecutionModel(args: ResolveMastraModelInput): MastraResolvedModel {
  const resolution = resolveMastraModel(args);
  return {
    ...resolution,
    purpose: args.purpose,
    domain: args.domain,
    snapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
  };
}

export function toModelDomain(domain: RoutingDomain): ModelDomain {
  return domain === 'generic' ? 'technical' : domain;
}

export function pickNextFallbackProvider(
  chain: string[],
  currentProviderId: ProviderId | string | undefined,
  decryptedByokKeys: ByokPayload | null,
  envGoogleKey: string | undefined,
  routingDomain: RoutingDomain,
): { providerId: ProviderId; modelId: string | null } | null {
  const currentProvider: ProviderId | string = currentProviderId || 'google';
  const idx = chain.indexOf(currentProvider);
  const startIdx = idx === -1 ? -1 : idx;

  for (let i = startIdx + 1; i < chain.length; i++) {
    const pid = chain[i] as ProviderId;
    const key = decryptedByokKeys?.[pid] || (pid === 'google' ? envGoogleKey : undefined);

    if (typeof key === 'string' && key.trim().length > 0) {
      const spec = BYOK_PROVIDERS[pid];
      const tier = toModelDomain(routingDomain);
      const modelId = spec?.defaultModels[tier] ?? spec?.defaultModels.technical ?? null;
      return { providerId: pid, modelId };
    }
  }
  return null;
}
