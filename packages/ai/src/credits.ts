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

// Canonical USD → credit conversion.
//
// Plan §6.1: 1 credit = $0.001 (CREDITS_PER_DOLLAR=1000). Everything that
// converts money to credits lives here — route handlers, budget handles and
// the ledger all import this module so rounding can never drift.
//
// BYOK turns are structurally free (D1). They still emit telemetry and a
// zero-credit reservation marker; the platform fee default is 0.

import { KNOWN_BYOK_PROVIDERS, type ByokPayload } from '@kestrel/shared';
import { decryptByok } from '@kestrel/shared/encryption';

import { estimateKnownCostUsd, estimateCostUsd, resolveModelRate } from './cost';

export type ProviderMode = 'byok' | 'managed';
export type CreditTurnMode = 'single' | 'full';

/** 1 credit = 1 / CREDITS_PER_DOLLAR USD. D3 default: $0.001. */
export function creditsPerDollar(): number {
  const raw = Number(process.env.CREDITS_PER_DOLLAR ?? 1000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
}

/** Convert USD to integer credits, rounding UP so fractions never give value away. */
export function usdToCredits(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.ceil(usd * creditsPerDollar());
}

/** Display helper: credits → USD. */
export function creditsToUsd(credits: number): number {
  return credits / creditsPerDollar();
}

export function platformFeeCredits(): number {
  const raw = Number(process.env.PLATFORM_FEE_CREDITS ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function fullModeCreditEstimate(): number {
  const raw = Number(process.env.FULL_MODE_CREDIT_ESTIMATE ?? 250);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 250;
}

/** Default token mix for a single turn estimate (plan §6.3). */
export const DEFAULT_INPUT_TOKENS = 5_000;
export const EXPECTED_OUTPUT_TOKENS = 1_500;
/** Round up 20% so reconciliations are usually refunds. */
export const SINGLE_TURN_ESTIMATE_BUFFER = 1.2;

/**
 * Credits charged for an actual turn.
 * BYOK → platform fee (0 by default); managed → ceil(actual USD × credits/$).
 */
export function creditsForTurn(opts: {
  providerMode: ProviderMode;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  if (opts.providerMode === 'byok') return platformFeeCredits();
  const usd = estimateKnownCostUsd(opts.modelId, opts.inputTokens, opts.outputTokens);
  return usdToCredits(usd);
}

/** Non-throwing variant for observability/legacy models. */
export function estimateCreditsForTokens(
  providerMode: ProviderMode,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (providerMode === 'byok') return platformFeeCredits();
  return usdToCredits(estimateCostUsd(modelId, inputTokens, outputTokens));
}

/**
 * Pre-flight reservation estimate. Model-aware for single turns; Full uses
 * the operator-configured committee estimate because its fan-out is not
 * derivable from one model rate.
 */
export function estimateCreditsForTurn(opts: {
  mode: CreditTurnMode;
  providerMode: ProviderMode;
  modelId?: string | null;
}): number {
  if (opts.providerMode === 'byok') return platformFeeCredits();
  if (opts.mode === 'full') return fullModeCreditEstimate();
  if (!opts.modelId || !resolveModelRate(opts.modelId)) {
    // Historical/unknown model: keep the legacy $0.01 placeholder (10 credits).
    return usdToCredits(0.01);
  }
  const base = estimateKnownCostUsd(opts.modelId, DEFAULT_INPUT_TOKENS, EXPECTED_OUTPUT_TOKENS);
  return Math.max(1, usdToCredits(base * SINGLE_TURN_ESTIMATE_BUFFER));
}

/**
 * D1 detection: a turn is BYOK only when the user has their own key for the
 * resolved provider. Operator env fallback keys are platform-paid (managed).
 */
export function hasUserKeyForProvider(
  aiApiKeys: string | null | undefined,
  providerId: string,
): boolean {
  if (!aiApiKeys) return false;
  let stored: ByokPayload | null;
  try {
    stored = decryptByok(aiApiKeys);
  } catch {
    return false;
  }
  return Boolean(stored && stored[providerId as keyof ByokPayload]);
}

/** Resolve provider mode from a qualified model id (`provider/model`). */
export function resolveProviderMode(aiApiKeys: string | null | undefined, modelId: string | null | undefined): ProviderMode {
  if (!modelId) return 'managed';
  const slash = modelId.indexOf('/');
  const prefix = slash === -1 ? 'google' : modelId.slice(0, slash);
  if (!KNOWN_BYOK_PROVIDERS.has(prefix)) return 'managed';
  return hasUserKeyForProvider(aiApiKeys, prefix) ? 'byok' : 'managed';
}

/** Stable per-turn idempotency key shared by budget + credit reservations. */
export function turnCreditIdempotencyKey(parts: {
  threadId?: string | null;
  userMessageId?: string | null;
  runId?: string | null;
  jobId?: string | null;
}): string {
  if (parts.jobId) return `credit:job:${parts.jobId}`;
  if (parts.userMessageId) return `credit:turn:${parts.threadId ?? 'thread'}:${parts.userMessageId}`;
  return `credit:run:${parts.runId ?? crypto.randomUUID()}`;
}
