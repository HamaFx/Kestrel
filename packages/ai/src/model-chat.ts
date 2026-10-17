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

// P1-1 — Extracted from model.ts. Chat model resolution: resolveChatModel,
// resolveModelForProvider, derivePlannerModel, and deriveTitleModel.
//
// Dependency: model-helpers.ts (PROVIDER_PRIORITY, envFallbackKeys).

import type { UserSettingsRow } from '@kestrel/db/schema';
import {
  decryptByok,
  type ByokPayload,
  type ProviderId,
} from '@kestrel/shared/encryption';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { LanguageModel } from 'ai';

import { BYOK_PROVIDERS, type ModelDomain } from './byok-providers';
import type { ResolveModelEnv } from './env-model-factory';
import { isCircuitOpen } from './model-circuit-breaker';
import { envFallbackKeys } from './model-helpers';
import { resolveModelForRole } from './model-role';

const modelChatLog = createCategorizedLogger('ai', { component: 'model-chat' });

// -----------------------------------------------------------------------
// Phase F — single-model resolution
// -----------------------------------------------------------------------

/**
 * Result of resolving the user's "default chat model" — the single
 * model that handles every main chat turn unless overridden per-thread
 * via `resolveOverrideModel`.
 *
 * `model` is the AI-SDK `LanguageModel` instance ready to pass to
 * `streamText` / `generateText`. `modelId` is the qualified
 * `"<provider>/<bare>"` string used for telemetry and cost attribution.
 * `providerId` and `bareModelId` are split out so callers don't have
 * to re-parse the modelId.
 */
export interface ChatModelResolution {
  model: LanguageModel;
  /** Qualified id "google/gemini-2.5-pro". */
  modelId: string;
  providerId: ProviderId;
  bareModelId: string;
}

/**
 * Resolve the user's single default chat model.
 *
 * Decision tree:
 *   1. If `userSettings.chatModel` is set, parse it as
 *      `"<providerId>:<bareModelId>"` and verify both are known.
 *   2. Else fall back to the highest-priority configured provider's
 *      `spec.defaultModels.technical`.
 *
 * The merged BYOK payload (decrypted + env fallback) determines
 * which providers are "configured". The picked provider must have
 * a key — otherwise we throw a clear error pointing at the UI.
 *
 * This replaces the previous per-domain `defaultModels` lookup in
 * the chat path. The legacy JSONB column is still in the schema
 * (consumed by convene-committee for per-role picks) but no UI
 * surface mutates it any more.
 */
export function resolveChatModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> & {
    aiFallbackChain?: readonly string[] | string[] | null | undefined;
  },
  env: ResolveModelEnv,
  /** Optional routing domain — picks the matching tier from defaultModels
   *  (fundamental→pro, technical→fast, summary→cheapest, etc.). Defaults to
   *  'technical' when omitted (backward-compatible). Ignored when the user
   *  has an explicit chatModel override set. */
  domain?: ModelDomain,
): ChatModelResolution {
  const stored = decryptByok(userSettings.aiApiKeys);
  const hasStoredKeys = stored && Object.keys(stored).length > 0;
  const byok = hasStoredKeys ? stored : (stored ?? {});
  const res = resolveModelForRole('chat', byok, env, {
    userSettings: {
      chatModel: userSettings.chatModel,
      aiFallbackChain: userSettings.aiFallbackChain,
    },
    domain,
  });

  return {
    model: res.model!,
    modelId: res.modelId,
    providerId: res.providerId,
    bareModelId: res.bareModelId,
  };
}

/**
 * Resolve a model specifically for a given provider ID.
 *
 * M4 fix — checks the circuit breaker before returning. If the resolved
 * model's circuit is open (3+ consecutive failures), the caller gets a
 * clear error rather than silently hitting a degraded model. Audit plan
 * §1.4 (P0-4): the breaker is keyed by the model id, so only the
 * specific requested/default model is skipped, not every model the
 * provider offers.
 */
export function resolveModelForProvider(
  providerId: ProviderId,
  userSettings: Pick<UserSettingsRow, 'aiApiKeys'>,
  env: ResolveModelEnv,
  requestedModelId?: string,
  domain: ModelDomain = 'technical',
): ChatModelResolution {
  const stored = decryptByok(userSettings.aiApiKeys);
  const keys: ByokPayload = {
    ...envFallbackKeys(env),
    ...(stored ?? {}),
  };
  const apiKey = keys[providerId];
  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${providerId}`);
  }
  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const bareModelId = requestedModelId ?? spec.defaultModels[domain];
  if (!bareModelId) {
    throw new Error(`Provider ${providerId} has no default technical model configured.`);
  }
  if (
    requestedModelId &&
    !(spec.models ?? []).some((model) => model.modelId === requestedModelId)
  ) {
    throw new Error(`Unknown model for provider ${providerId}: ${requestedModelId}`);
  }
  const modelId = `${providerId}/${bareModelId}`;
  if (isCircuitOpen(modelId)) {
    throw new Error(`Model ${modelId} is temporarily unavailable (circuit open).`);
  }
  return {
    model: spec.factory(apiKey)(bareModelId),
    modelId,
    providerId,
    bareModelId,
  };
}

/**
 * Pick the model the plan-then-act planner should use. The planner
 * runs a cheap pre-step for every fundamental/technical turn, so we
 * want a small/cheap model from the same provider as the user's chat.
 *
 * Logic:
 *   - Use the user's chat provider's `spec.defaultModels.summary`
 *     (e.g. claude-haiku for Anthropic, flash-lite for Google).
 *   - If the chat provider has no summary declared, fall back to the
 *     chat model itself (cheapest available is the one we have).
 *   - If `userSettings.chatModel` is unset (fallback path used), the
 *     resolver already chose the right provider's `technical`, so the
 *     same summary-derivation applies.
 *   - If everything fails (no summary, no chat provider), returns
 *     null so the caller can use `AI_DEFAULT_MODEL` instead.
 */
export function derivePlannerModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): string | null {
  try {
    const stored = decryptByok(userSettings.aiApiKeys);
    const hasStoredKeys = stored && Object.keys(stored).length > 0;
    const byok = hasStoredKeys ? stored : (stored ?? {});
    const res = resolveModelForRole('planner', byok, env, {
      userSettings: { chatModel: userSettings.chatModel },
    });
    return res.modelId;
  } catch (err) {
    modelChatLog.warn('planner model derivation fell back to default model', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Pick the model title generation should use. Title is a tiny
 * 3-7-word summary call — same cheap-model preference as the
 * planner. Currently identical to `derivePlannerModel`; kept as a
 * separate symbol so future tuning (e.g. "title should be even
 * cheaper than the planner") doesn't fork the planner path.
 */
export function deriveTitleModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): string | null {
  return derivePlannerModel(userSettings, env);
}
