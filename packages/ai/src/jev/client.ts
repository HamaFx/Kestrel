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
 * Phase 1 (Jev System One) — vendor-neutral `POST /v1/systemone` client.
 *
 * One request carries a `state` plus many parallel typed questions; the
 * response carries one calibrated answer per question. The client is guarded
 * by Kestrel's shared circuit breaker and generation ledger, bounded by an
 * 800 ms AbortController timeout by default, and — critically — returns
 * `null` on every failure path (network, timeout, non-2xx, schema drift) so
 * callers degrade to their deterministic regex/keyword logic instead of
 * failing the turn.
 */

import { metrics } from '@kestrel/shared';
import { z } from 'zod';

import { isCircuitOpen, recordModelFailure, recordModelSuccess } from '../models/circuit-breaker';
import { clamp01, computeChoiceConfidence, computeNoulConfidence, computeScoreConfidence } from './calibration';
import { jevCircuitKey, resolveJevEndpoint } from './resolve-endpoint';
import type {
  JevAnswer,
  JevAnswersOf,
  JevEnv,
  JevEvaluationResult,
  JevGenerationLedger,
  JevQuestion,
  JevSettings,
  JevUsage,
  ResolvedJevEndpoint,
} from './types';

/** Default per-request budget — Jev is non-autoregressive; 800 ms is generous. */
export const DEFAULT_JEV_TIMEOUT_MS = 800;

/** HTTP statuses that trip the shared circuit breaker. */
function isBreakerStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 529;
}

const JevAnswerEnvelopeSchema = z.object({
  type: z.string().optional(),
  noul: z.number().optional(),
  choice: z.string().optional(),
  probabilities: z
    .union([z.array(z.number()), z.record(z.string(), z.number())])
    .optional(),
  confidence: z.number().optional(),
});

const JevResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), z.unknown()),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .partial()
    .optional(),
});

export interface EvaluateJevArgs<Q extends Record<string, JevQuestion>> {
  /**
   * Request state. Per the security invariant, callers pass ONLY sanitized
   * user text (`sanitizeExternalText`) and deterministic numeric/metadata
   * structures — never raw untrusted external prose.
   */
  state: unknown;
  questions: Q;
  /** BYOK settings row (encrypted `aiApiKeys` column), when available. */
  settings?: JevSettings | null;
  env?: JevEnv | null;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  /** Test seam / custom transport. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Pre-resolved endpoint (skips resolution; still circuit-checked). */
  endpoint?: ResolvedJevEndpoint | null;
  /** Optional generation ledger the request cost is recorded into. */
  ledger?: JevGenerationLedger | null;
  /** Stable id for the ledger entry (idempotency key). */
  ledgerEntryId?: string;
}

/** USD estimate for one Jev call (output tokens are free on every provider). */
export function estimateJevCostUsd(
  endpoint: Pick<ResolvedJevEndpoint, 'inputCostPerMTokUsd'>,
  usage: JevUsage,
): number {
  if (endpoint.inputCostPerMTokUsd <= 0) return 0;
  const cost = (endpoint.inputCostPerMTokUsd * usage.inputTokens) / 1_000_000;
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

function toNumberRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function toNumberArray(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const arr = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
    return arr.length === value.length && arr.length > 0 ? arr : null;
  }
  const record = toNumberRecord(value);
  if (!record) return null;
  return Object.keys(record)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => record[key]!);
}

/** Parse one raw envelope into a calibrated answer for its question type. */
export function parseJevAnswer(question: JevQuestion, raw: unknown): JevAnswer | null {
  const parsed = JevAnswerEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;

  if (question.type === 'noul') {
    if (typeof data.noul !== 'number') return null;
    const { value, probability, confidence } = computeNoulConfidence(data.noul);
    return {
      type: 'noul',
      value,
      probability,
      confidence: clamp01(data.confidence ?? confidence),
    };
  }

  if (question.type === 'choice') {
    const probabilities = toNumberRecord(data.probabilities);
    if (probabilities) {
      const computed = computeChoiceConfidence(probabilities);
      const choice = data.choice ?? computed.choice;
      return {
        type: 'choice',
        choice,
        probabilities,
        confidence: clamp01(data.confidence ?? computed.confidence),
      };
    }
    if (typeof data.choice === 'string' && data.choice.length > 0) {
      return {
        type: 'choice',
        choice: data.choice,
        probabilities: {},
        confidence: clamp01(data.confidence ?? 0.5),
      };
    }
    return null;
  }

  const probabilities = toNumberArray(data.probabilities);
  if (!probabilities) return null;
  const computed = computeScoreConfidence(probabilities);
  return {
    type: 'score',
    score: computed.score,
    probabilities,
    confidence: clamp01(data.confidence ?? computed.confidence),
  };
}

/**
 * Evaluate one Jev request. Returns null — never throws — when no provider is
 * configured, the endpoint circuit is open, the call times out, the endpoint
 * errors, or the response does not satisfy the `/v1/systemone` contract.
 */
export async function evaluateJev<Q extends Record<string, JevQuestion>>(
  args: EvaluateJevArgs<Q>,
): Promise<JevEvaluationResult<Q> | null> {
  const endpoint = args.endpoint ?? resolveJevEndpoint(args.settings, args.env);
  if (!endpoint) return null;

  const circuitKey = jevCircuitKey(endpoint.providerId, endpoint.modelId);
  if (isCircuitOpen(circuitKey)) return null;

  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const controller = new AbortController();
  const timeoutMs = args.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (args.signal) {
    if (args.signal.aborted) {
      clearTimeout(timeout);
      return null;
    }
    args.signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  const startedAt = Date.now();
  try {
    const response = await fetchImpl(endpoint.endpointUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({
        model: endpoint.modelId,
        state: args.state,
        questions: args.questions,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (isBreakerStatus(response.status)) {
        recordModelFailure(circuitKey);
      }
      metrics.increment('jev_request_failed_total', {
        tags: { provider: endpoint.providerId, status: String(response.status) },
      });
      return null;
    }

    const payload = JevResponseSchema.safeParse(await response.json());
    if (!payload.success) {
      recordModelFailure(circuitKey);
      metrics.increment('jev_request_failed_total', {
        tags: { provider: endpoint.providerId, cause: 'invalid_response' },
      });
      return null;
    }

    const answers: Record<string, JevAnswer> = {};
    for (const [name, question] of Object.entries(args.questions)) {
      const answer = parseJevAnswer(question, payload.data.answers[name]);
      if (answer) answers[name] = answer;
    }
    // A partial response is treated as a failed request: callers must never
    // threshold against a question the endpoint silently skipped.
    if (Object.keys(answers).length !== Object.keys(args.questions).length) {
      recordModelFailure(circuitKey);
      metrics.increment('jev_request_failed_total', {
        tags: { provider: endpoint.providerId, cause: 'incomplete_answers' },
      });
      return null;
    }

    const usage: JevUsage = {
      inputTokens: Math.max(0, payload.data.usage?.input_tokens ?? 0),
      outputTokens: Math.max(0, payload.data.usage?.output_tokens ?? 0),
    };
    const costUsd = estimateJevCostUsd(endpoint, usage);
    if (costUsd > 0 && args.ledger) {
      args.ledger.recordCost(
        `jev:${endpoint.providerId}:${args.ledgerEntryId ?? 'call'}`,
        'auxiliary',
        costUsd,
      );
    }
    recordModelSuccess(circuitKey);
    metrics.observe('jev_request_latency_ms', Date.now() - startedAt, {
      tags: { provider: endpoint.providerId },
    });

    return {
      model: payload.data.model ?? endpoint.modelId,
      providerId: endpoint.providerId,
      answers: answers as JevAnswersOf<Q>,
      usage,
      costUsd,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    recordModelFailure(circuitKey);
    metrics.increment('jev_request_failed_total', {
      tags: {
        provider: endpoint.providerId,
        cause: controller.signal.aborted ? 'timeout' : 'network',
      },
    });
    void error;
    return null;
  } finally {
    clearTimeout(timeout);
    if (args.signal) args.signal.removeEventListener('abort', onOuterAbort);
  }
}
