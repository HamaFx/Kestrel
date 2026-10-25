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

// Error envelopes and failure mapping for the /api/chat boundary.

import type { createRequestLogger } from '@/lib/logger';
import {
  BudgetExceededError,
  CanonicalEvidenceBlockedError,
  GuardrailUnavailableError,
  isBudgetEnforced,
  MutationExtractionError,
  TripWire,
} from '@/lib/services/api-boundary';

type RequestLogger = ReturnType<typeof createRequestLogger>;

export function errorJson(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function mastraFailureResponse(error: unknown): Response {
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Mastra could not complete this request. Please try again.'
      : error instanceof Error
        ? error.message
        : String(error);
  return errorJson('MASTRA_FAILED', message, 502);
}

/** 429 envelope for the per-user chat turn rate limit. */
export function chatRateLimitResponse(rateLimit: { count: number; limit: number }): Response {
  return Response.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: `Too many chat turns (${rateLimit.count}/${rateLimit.limit} per minute). Slow down.`,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': String(rateLimit.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

/** Map a failed mutation-draft attempt to its route-boundary response. */
export function mutationDraftFailureResponse(
  error: unknown,
  log: RequestLogger,
  threadId: string,
  mutationKind: string,
): Response {
  if (error instanceof MutationExtractionError) {
    return errorJson('MUTATION_EXTRACTION_FAILED', error.message, 422);
  }
  if (error instanceof Error && error.name === 'MastraMutationPolicyError') {
    return errorJson('FORBIDDEN', error.message, 403);
  }
  log.error({ err: String(error), threadId, mutation: mutationKind }, 'Mutation draft failed');
  return errorJson(
    'MUTATION_DRAFT_FAILED',
    'Could not prepare this mutation for confirmation.',
    502,
  );
}

/**
 * Map a chat-turn failure to a clean route response, or `null` when the error
 * is not one of the known boundary classes (caller logs + 502s).
 */
export function mapChatFailure(error: unknown): Response | null {
  // Q4 decision: spend is ledger-only — a 429 is possible only when the
  // operator explicitly set ENFORCE_BUDGET=true.
  if (error instanceof BudgetExceededError && isBudgetEnforced()) {
    return errorJson(
      'BUDGET_EXCEEDED',
      `Daily AI budget exceeded ($${error.spent.toFixed(2)} / $${error.max.toFixed(2)}). Resets at UTC midnight.`,
      429,
    );
  }
  if (error instanceof CanonicalEvidenceBlockedError) {
    return errorJson('EVIDENCE_UNVERIFIED', error.message, 422);
  }
  // Audit plan §1.9: strict-mode guardrails fail closed when the injection
  // detector model cannot be loaded — surface that as a retryable 503
  // instead of a generic 500/502.
  if (error instanceof GuardrailUnavailableError) {
    return errorJson(
      'GUARDRAIL_UNAVAILABLE',
      'The prompt-injection guardrail is unavailable right now, so this request was rejected. Please try again shortly.',
      503,
    );
  }
  // Audit plan §1.9: Mastra's LLM injection backstop tripped the tripwire
  // (guardrail strategy 'block') — a clean 422, not a raw stream error.
  if (error instanceof TripWire) {
    return errorJson(
      'INJECTION_BLOCKED',
      'I can help with read-only research, but I cannot process instruction-overriding requests. Please ask for a market explanation, analysis, or scenario review.',
      422,
    );
  }
  return null;
}
