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
// `classifyStreamError` (merged from fallback.ts) answers "is this error worth
// another provider?"; this module answers "which provider, and how many". The
// chain is built from the user's own configuration (`aiFallbackChain` ordering
// over their configured providers), never from an operator default, and every
// candidate whose circuit is open is skipped. A turn with no configured
// fallback model still fails exactly as it did before.

import type { UserSettingsRow } from '@kestrel/db/schema';
import { decryptByok, type ByokPayload, type ProviderId } from '@kestrel/shared/encryption';
import type { LanguageModel } from 'ai';

import { BYOK_PROVIDERS, defaultModelFor, type ModelDomain } from './byok-providers';
import type { ChatModelResolution } from './chat';
import { isCircuitOpen, recordModelFailure } from './circuit-breaker';
import type { ResolveModelEnv } from './env-factory';
import { envFallbackKeys } from './helpers';
import { getAvailableProviders } from './role';

/**
 * Fallback policy for the agent — when a model override fails,
 * decide whether to retry with the default domain model.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 15.
 *
 * The classifier is intentionally narrow. We DO NOT retry on:
 *   - 4xx other than 401/403/429 — bad request shapes won't be
 *     fixed by switching models.
 *   - Network timeouts after partial output — partial state is
 *     already on the wire; rolling back would be confusing.
 *
 * We DO retry on:
 *   - 401 / 403 — likely a key-permission problem with the
 *     override's provider.
 *   - 429 — rate-limit on the override's provider. The default
 *     provider might have spare capacity.
 *   - 5xx — transient upstream failure.
 *
 * The classifier only sees the error object. The agent wraps the
 * actual streamText call in a try/catch, captures the rejection,
 * and decides whether to fall back.
 */

/** Regex for context-window overflow error messages across providers. */
const CTX_OVERFLOW_RX =
  /context\s*(length|window|limit|size)|maximum\s*context|reduce\s*the\s*length|too\s*many\s*tokens|max[_-]?tokens|input\s*is\s*too\s*(long|large)|exceeds\s*(the\s*)?(context|limit|maximum)|token\s*(count\s*)?exceeds|too\s*(long|large|many)|exceed\w*\s*(the\s*)?(context|limit|max)/;

type FallbackReason =
  | 'auth' // 401 / 403
  | 'rate-limit' // 429
  | 'upstream' // 5xx
  | 'context-overflow' // context window exceeded (400 — retry with larger-model provider)
  | 'timeout' // network timeout
  | 'hard-error' // non-auth 4xx (400, 404, 405, etc.) — not retryable
  | 'unknown'; // genuinely unclassifiable — retry once as cheap insurance (C3 fix)

export interface FallbackDecision {
  fallback: boolean;
  reason: FallbackReason;
  /** Short user-facing reason string for the data-fallback part. */
  message: string;
}

/**
 * Inspect an error thrown during model resolution or streaming and
 * produce a fallback decision. Pure function — no I/O, safe to call
 * from anywhere.
 *
 * Heuristics: we look at statusCode, HTTP status text, and the
 * provider SDK's typical error messages. We also accept the AI
 * SDK's `APICallError` and `AI_APICallError` shape, but the
 * classifier only relies on duck-typed fields.
 */
export function classifyStreamError(err: unknown): FallbackDecision {
  const statusCode = getStatusCode(err);
  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /unauthor|forbidden|invalid\s*api\s*key|incorrect\s*api\s*key/.test(lowerMessage)
  ) {
    return { fallback: true, reason: 'auth', message: 'Override provider rejected the API key' };
  }
  if (statusCode === 429 || /rate\s*limit|too\s*many\s*requests|quota/.test(lowerMessage)) {
    return {
      fallback: true,
      reason: 'rate-limit',
      message: 'Override provider rate-limited the request',
    };
  }
  if (statusCode !== null && statusCode >= 500 && statusCode < 600) {
    return {
      fallback: true,
      reason: 'upstream',
      message: `Override provider returned HTTP ${statusCode}`,
    };
  }
  // F15 — context-window errors. Providers return these when the message
  // history exceeds their context limit. Common response codes: 400 (Bad Request),
  // 413 (Payload Too Large). Also checked when no status code is present
  // (e.g. errors wrapped by SDKs or proxies). Falling back to a different
  // provider (e.g. Claude 200K → Gemini 1M) is the correct remediation.
  if (
    (statusCode === 400 || statusCode === 413 || statusCode === null) &&
    CTX_OVERFLOW_RX.test(lowerMessage)
  ) {
    return {
      fallback: true,
      reason: 'context-overflow',
      message: 'Context window exceeded — trying a larger-model provider',
    };
  }
  if (/timeout|timed?\s*out|aborted|network|fetch\s*failed/.test(lowerMessage)) {
    return { fallback: true, reason: 'timeout', message: 'Override provider timed out' };
  }
  // Non-auth 4xx (400, 404, 405, 406, etc.) — these are hard client errors
  // that retrying won't fix. Distinct from 'unknown' (no status code, no
  // pattern) which IS worth retrying once (C3 fix — RELIABILITY_AUDIT_REPORT.md).
  if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
    return { fallback: false, reason: 'hard-error', message };
  }
  return { fallback: false, reason: 'unknown', message };
}

/**
 * Convenience wrapper — returns the boolean only.
 */
export function shouldFallback(err: unknown): boolean {
  return classifyStreamError(err).fallback;
}

/**
 * Build the payload of a `data-fallback` UIMessage part. The shape
 * matches what ChatScreen / message.tsx already renders for
 * `data-citation-warning` parts: typed fields, no React.
 *
 * Caller is responsible for appending this to `parts` so it shows
 * up in the rendered message and is persisted with the rest of
 * the assistant turn.
 */
export interface FallbackPartPayload {
  type: 'data-fallback';
  reason: FallbackReason;
  /** Override model id that failed (so the user knows what to fix). */
  override: string;
  /** Human-readable explanation. */
  message: string;
}

export function makeFallbackPart(
  override: string,
  decision: FallbackDecision,
): FallbackPartPayload {
  return {
    type: 'data-fallback',
    reason: decision.reason,
    override,
    message: decision.message,
  };
}

/**
 * Duck-typed status-code extractor. Many SDKs stash the HTTP
 * status on `err.statusCode` or `err.status`. We check a few
 * common locations before falling back to scanning the message.
 */
function getStatusCode(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;
  for (const key of ['statusCode', 'status', 'httpStatus', 'code']) {
    const v = e[key];
    if (typeof v === 'number' && v >= 100 && v < 600) return v;
  }
  // The AI SDK's APICallError exposes `response.status`.
  const response = e.response;
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (typeof r.status === 'number' && r.status >= 100 && r.status < 600) {
      return r.status;
    }
  }
  return null;
}

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
