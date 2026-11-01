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

// R14 — bounded failover for the canonical chat attempt, extracted from
// `stream.ts`/`chat.ts` so the turn orchestrators stay under the
// maintainability limit. The caller owns the attempt body; this module owns
// the chain, the bound, the retry wrapper, and failure attribution.

import {
  MAX_TURN_FALLBACKS,
  resolveFallbackChain,
  runWithModelFallback,
  type ChatModelResolution,
  type FallbackPartPayload,
  type ModelDomain,
} from '@ai/models/model';
import { withRetry } from '@ai/runtime/retry';

import type { RunMastraCanonicalChatArgs } from './types';

export interface OpenCanonicalAttemptArgs<T> {
  run: RunMastraCanonicalChatArgs;
  runId: string;
  primary: ChatModelResolution;
  domain: ModelDomain;
  /** One generation attempt on the given model (before the retry wrapper). */
  stream: (candidate: ChatModelResolution) => Promise<T>;
  /** Terminal attempt failure — the caller records the run/breaker outcome. */
  onFailure: (failed: ChatModelResolution, error: unknown) => Promise<void>;
}

export interface CanonicalAttemptResult<T> {
  output: T;
  resolution: ChatModelResolution;
  fallbackParts: FallbackPartPayload[];
}

/**
 * Run the canonical turn on the primary model, then on the user's next
 * configured model for a classified recoverable failure. Each attempt gets
 * one bounded retry, matching the pre-existing canonical retry policy. An
 * execution-plan snapshot pins the model (no failover for durable jobs), and
 * a user cancellation/deadline abort never switches providers.
 */
export async function openCanonicalAttempt<T>(
  args: OpenCanonicalAttemptArgs<T>,
): Promise<CanonicalAttemptResult<T>> {
  const fallbackCandidates = args.run.executionPlan?.model
    ? []
    : resolveFallbackChain({
        settings: args.run.settings,
        env: args.run.env,
        domain: args.domain,
        primaryModelId: args.primary.modelId,
      });
  // Attribute a terminal failure to the model that actually failed, not the
  // primary, when the turn already moved providers.
  let lastAttempted = args.primary;
  try {
    const opened = await runWithModelFallback({
      primary: args.primary,
      candidates: fallbackCandidates,
      signal: args.run.signal,
      maxFallbacks: MAX_TURN_FALLBACKS,
      onAttempt: (attempted) => {
        lastAttempted = attempted;
      },
      attempt: (candidate) =>
        withRetry(() => args.stream(candidate), {
          maxAttempts: 2,
          signal: args.run.signal,
        }),
    });
    return {
      output: opened.result,
      resolution: opened.resolution,
      fallbackParts: opened.fallbackParts,
    };
  } catch (error) {
    await args.onFailure(lastAttempted, error);
    throw error;
  }
}
