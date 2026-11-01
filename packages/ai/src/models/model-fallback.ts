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

// R14 — mid-turn provider failover.
//
// `classifyStreamError` answers "is this error worth another provider?";
// this module answers "which provider, and how many". The chain is built from
// the user's own configuration (`aiFallbackChain` ordering over their
// configured providers), never from an operator default, and every candidate
// whose circuit is open is skipped. A turn with no configured fallback model
// still fails exactly as it did before.

import type { UserSettingsRow } from '@kestrel/db/schema';
import { decryptByok, type ByokPayload, type ProviderId } from '@kestrel/shared/encryption';
import type { LanguageModel } from 'ai';

import { BYOK_PROVIDERS, defaultModelFor, type ModelDomain } from './byok-providers';
import type { ChatModelResolution } from './chat';
import { isCircuitOpen, recordModelFailure } from './circuit-breaker';
import type { ResolveModelEnv } from './env-factory';
import { classifyStreamError, makeFallbackPart, type FallbackPartPayload } from './fallback';
import { envFallbackKeys } from './helpers';
import { getAvailableProviders } from './role';

/** How many fallback models one turn may try after the primary (product cap). */
export const MAX_TURN_FALLBACKS = 2;

export interface FallbackModelCandidate {
  providerId: ProviderId;
  bareModelId: string;
  modelId: string;
  model: LanguageModel;
}

export interface ResolveFallbackChainArgs {
  settings: Pick<UserSettingsRow, 'aiApiKeys'> & {
    aiFallbackChain?: readonly string[] | string[] | null | undefined;
  };
  env: ResolveModelEnv;
  domain: ModelDomain;
  /** The model already in use — never offered back as its own fallback. */
  primaryModelId: string;
  /** Any other models already attempted this turn. */
  excludeModelIds?: readonly string[];
  limit?: number;
}

/**
 * Build the ordered fallback chain for one turn: the configured providers in
 * the user's priority order (`aiFallbackChain` first), each provider's default
 * model for the turn's domain, minus the primary, minus circuit-open models.
 */
export function resolveFallbackChain(args: ResolveFallbackChainArgs): FallbackModelCandidate[] {
  const stored = decryptByok(args.settings.aiApiKeys);
  const keys: ByokPayload = {
    ...envFallbackKeys(args.env),
    ...(stored ?? {}),
  };
  const configured = getAvailableProviders(keys, {
    aiFallbackChain: args.settings.aiFallbackChain,
  });
  const excluded = new Set<string>(args.excludeModelIds ?? []);
  excluded.add(args.primaryModelId);
  const limit = Math.max(0, args.limit ?? MAX_TURN_FALLBACKS);
  const candidates: FallbackModelCandidate[] = [];

  for (const providerId of configured) {
    if (candidates.length >= limit) break;
    const spec = BYOK_PROVIDERS[providerId];
    if (!spec) continue;
    const bareModelId = defaultModelFor(providerId, args.domain) ?? spec.defaultModels.technical;
    if (!bareModelId) continue;
    const modelId = `${spec.id}/${bareModelId}`;
    if (excluded.has(modelId) || isCircuitOpen(modelId)) continue;
    const apiKey = keys[providerId];
    if (typeof apiKey !== 'string' || apiKey.length === 0) continue;
    candidates.push({
      providerId,
      bareModelId,
      modelId,
      model: spec.factory(apiKey)(bareModelId),
    });
  }
  return candidates;
}

export interface RunWithModelFallbackArgs<T> {
  /** The resolved primary model (as configured by the user / execution plan). */
  primary: ChatModelResolution;
  /** Ordered candidates from `resolveFallbackChain`. */
  candidates: readonly FallbackModelCandidate[];
  /** Execute one attempt. Retry policy belongs to the caller's attempt. */
  attempt: (resolution: ChatModelResolution, signal?: AbortSignal) => Promise<T>;
  signal?: AbortSignal | undefined;
  /** Upper bound on fallback models tried, independent of chain length. */
  maxFallbacks?: number;
  /**
   * Called with the resolution of every attempt before it starts, so a caller
   * can attribute a terminal failure to the model that actually failed.
   */
  onAttempt?: (resolution: ChatModelResolution) => void;
}

export interface RunWithModelFallbackResult<T> {
  result: T;
  /** The resolution that actually produced the result. */
  resolution: ChatModelResolution;
  /** One `data-fallback` payload per model switch, in order. */
  fallbackParts: FallbackPartPayload[];
}

function asResolution(candidate: FallbackModelCandidate): ChatModelResolution {
  return {
    model: candidate.model,
    modelId: candidate.modelId,
    providerId: candidate.providerId,
    bareModelId: candidate.bareModelId,
  };
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * Run `attempt` on the primary model, then on each fallback candidate in
 * order, but only for failures the classifier marks recoverable (auth,
 * rate-limit, upstream, timeout, context overflow). The number of model
 * switches is bounded; each switch is recorded against the failed model's
 * circuit so a persistently broken provider trips the breaker.
 *
 * A user cancellation or request-deadline abort stops the loop immediately —
 * failover must never race a client the user already closed.
 */
export async function runWithModelFallback<T>(
  args: RunWithModelFallbackArgs<T>,
): Promise<RunWithModelFallbackResult<T>> {
  const maxFallbacks = Math.max(0, args.maxFallbacks ?? MAX_TURN_FALLBACKS);
  const attempts: ChatModelResolution[] = [
    args.primary,
    ...args.candidates.slice(0, maxFallbacks).map(asResolution),
  ];
  const fallbackParts: FallbackPartPayload[] = [];
  let lastError: unknown;

  for (let index = 0; index < attempts.length; index++) {
    const resolution = attempts[index]!;
    if (args.signal?.aborted) throw abortError(args.signal);
    args.onAttempt?.(resolution);
    try {
      const result = await args.attempt(resolution, args.signal);
      return { result, resolution, fallbackParts };
    } catch (error) {
      lastError = error;
      // The caller cancelled (tab closed, request deadline, shutdown) — do
      // not continue the turn on another provider.
      if (args.signal?.aborted) throw error;
      const decision = classifyStreamError(error);
      if (!decision.fallback || index >= attempts.length - 1) throw error;
      // A recoverable mid-turn failure is a real provider failure: count it
      // so the circuit breaker can open for this model.
      recordModelFailure(resolution.modelId);
      fallbackParts.push(makeFallbackPart(resolution.modelId, decision));
    }
  }

  throw lastError;
}
