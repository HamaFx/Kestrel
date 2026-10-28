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

/**
 * Phase 1 (Jev System One) — free-first provider resolution.
 *
 * Resolution order (audit plan §2), skipping any candidate whose circuit is
 * currently open (`isCircuitOpen('jev:<providerId>:<modelId>')`):
 *
 *   1. OpenCode Console    `jev-1.13-free`     $0.00             (byok.opencode | env.OPENCODE_API_KEY)
 *   2. Vercel AI Gateway   `typesafe-ai/jev`   free credits      (env.AI_GATEWAY_API_KEY)
 *   3. Liquid AI           `d1-ultra`/`d1.1`   $0.042/$0.02/1M   (byok.liquid | env.LIQUID_API_KEY)
 *   4. TypeSafe AI         `jev-latest`        $0.042/1M in      (byok.typesafe | env.TYPESAFE_API_KEY)
 *   5. OpenRouter          `typesafe/jev-1.14` $0.042/1M in      (byok.openrouter)
 *
 * Liquid AI is the cheapest paid tier and speaks the same `/systemone`
 * contract, so it sits ahead of the $0.042 BYOK endpoints. Its hosted d1
 * family is tiered by task complexity: `d1-ultra` for complex judgement and
 * `d1.1` for simple classification (see `JevTaskTier`).
 *
 * `JEV_BASE_URL` lets self-hosters point the OpenCode/TypeSafe slots at a
 * proxy or a local gateway without changing the resolution order.
 */

import type { ByokPayload } from '@kestrel/shared/byok';
import { decryptByok } from '@kestrel/shared/encryption';

import { isCircuitOpen } from '../models/circuit-breaker';
import type { JevEnv, JevProviderId, JevSettings, JevTaskTier, ResolvedJevEndpoint } from './types';

/** Default endpoint URLs per provider (overridable via `JEV_BASE_URL`). */
export const JEV_ENDPOINTS = {
  'opencode-free': 'https://opencode.ai/inference/systemone/v1/systemone',
  'vercel-gateway': 'https://ai-gateway.vercel.sh/typesafe/v1/systemone',
  liquid: 'https://api.liquid.ai/decisions/v1/systemone',
  typesafe: 'https://api.typesafe.ai/v1/systemone',
  openrouter: 'https://openrouter.ai/api/v1/systemone',
} as const satisfies Record<JevProviderId, string>;

/** Liquid AI hosted decision models, by task complexity. */
export const LIQUID_MODEL_COMPLEX = 'd1-ultra';
export const LIQUID_MODEL_SIMPLE = 'd1.1';
/** USD per 1M input tokens (Liquid bills input only; output is $0). */
export const LIQUID_COST_PER_MTOK_COMPLEX = 0.042;
export const LIQUID_COST_PER_MTOK_SIMPLE = 0.02;

/** Circuit-breaker key for one Jev endpoint. */
export function jevCircuitKey(providerId: JevProviderId, modelId: string): string {
  return `jev:${providerId}:${modelId}`;
}

/**
 * Resolve the highest-priority Jev endpoint available to this request, or
 * null when no key is configured / every candidate's circuit is open.
 */
export function resolveJevEndpoint(
  settings?: JevSettings | null,
  env?: JevEnv | null,
  tier: JevTaskTier = 'complex',
): ResolvedJevEndpoint | null {
  let byok: ByokPayload | null = null;
  if (settings?.aiApiKeys) {
    try {
      byok = decryptByok(settings.aiApiKeys);
    } catch {
      // Decryption failures degrade to env-only resolution; never throw.
      byok = null;
    }
  }

  const candidates: ResolvedJevEndpoint[] = [];
  const opencodeKey = byok?.opencode ?? env?.OPENCODE_API_KEY;
  const typesafeKey = byok?.typesafe ?? env?.TYPESAFE_API_KEY;
  const liquidKey = byok?.liquid ?? env?.LIQUID_API_KEY;
  const openrouterKey = byok?.openrouter;
  const gatewayKey = env?.AI_GATEWAY_API_KEY;
  const baseUrlOverride = env?.JEV_BASE_URL;

  if (opencodeKey) {
    candidates.push({
      providerId: 'opencode-free',
      endpointUrl: baseUrlOverride ?? JEV_ENDPOINTS['opencode-free'],
      modelId: 'jev-1.13-free',
      apiKey: opencodeKey,
      inputCostPerMTokUsd: 0,
    });
  }
  if (gatewayKey) {
    candidates.push({
      providerId: 'vercel-gateway',
      endpointUrl: JEV_ENDPOINTS['vercel-gateway'],
      modelId: 'typesafe-ai/jev',
      apiKey: gatewayKey,
      inputCostPerMTokUsd: 0,
    });
  }
  if (liquidKey) {
    candidates.push({
      providerId: 'liquid',
      endpointUrl: JEV_ENDPOINTS.liquid,
      modelId: tier === 'simple' ? LIQUID_MODEL_SIMPLE : LIQUID_MODEL_COMPLEX,
      apiKey: liquidKey,
      inputCostPerMTokUsd:
        tier === 'simple' ? LIQUID_COST_PER_MTOK_SIMPLE : LIQUID_COST_PER_MTOK_COMPLEX,
    });
  }
  if (typesafeKey) {
    candidates.push({
      providerId: 'typesafe',
      endpointUrl: baseUrlOverride ?? JEV_ENDPOINTS.typesafe,
      modelId: 'jev-latest',
      apiKey: typesafeKey,
      inputCostPerMTokUsd: 0.042,
    });
  }
  if (openrouterKey) {
    candidates.push({
      providerId: 'openrouter',
      endpointUrl: JEV_ENDPOINTS.openrouter,
      modelId: 'typesafe/jev-1.14',
      apiKey: openrouterKey,
      inputCostPerMTokUsd: 0.042,
    });
  }

  for (const candidate of candidates) {
    if (!isCircuitOpen(jevCircuitKey(candidate.providerId, candidate.modelId))) {
      return candidate;
    }
  }
  return null;
}
