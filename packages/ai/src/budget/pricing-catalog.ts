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

// Static pricing catalog + per-request cost estimation.
//
// The numbers are conservative upper bounds from public list prices
// (Q1 2026), so budget reservations stay on the safe side. Live catalog
// rates are merged from BYOK_PROVIDERS; on a key collision the catalog wins
// because it is the live source of truth.

import { buildCatalogRateTable } from '../models/byok-providers';

export interface ModelRate {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
}

// Static fallbacks for historical telemetry ids + tests.
const STATIC_RATES: Record<string, ModelRate> = {
  // Conservative upper bounds used by unit tests / historical telemetry.
  'openai/gpt-4.1': { inputPerM: 5, outputPerM: 15 },
  'openai/gpt-4.1-mini': { inputPerM: 0.4, outputPerM: 1.6 },
  'openai/gpt-4o': { inputPerM: 5, outputPerM: 15 },
  'openai/gpt-5.6-sol': { inputPerM: 5, outputPerM: 30 },
  'openai/gpt-5.6-terra': { inputPerM: 2.5, outputPerM: 15 },
  'openai/gpt-5.6-luna': { inputPerM: 1, outputPerM: 6 },
  'anthropic/claude-3.7-sonnet': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-sonnet-4': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-sonnet-4-5': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-sonnet-5': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-opus-4-8': { inputPerM: 5, outputPerM: 25 },
  'anthropic/claude-fable-5': { inputPerM: 5, outputPerM: 25 },
  'anthropic/claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
  'google/gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'google/gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'google/gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10 },
  'google/gemini-3.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'xai/grok-4.5': { inputPerM: 2, outputPerM: 6 },
  'xai/grok-4.3': { inputPerM: 1.25, outputPerM: 2.5 },
  'deepseek/deepseek-v4-pro': { inputPerM: 0.435, outputPerM: 0.87 },
  'deepseek/deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.28 },
};

const RATES: Record<string, ModelRate> = {
  ...STATIC_RATES,
  ...buildCatalogRateTable(),
};

const FALLBACK_RATE: ModelRate = { inputPerM: 5, outputPerM: 15 };

/** Error raised when production accounting cannot price a model safely. */
export class UnknownModelPricingError extends Error {
  readonly code = 'UNKNOWN_MODEL_PRICING' as const;

  constructor(readonly model: string) {
    super(`No pricing is configured for model "${model}".`);
    this.name = 'UnknownModelPricingError';
  }
}

/** Resolve a normalized model rate without applying the compatibility fallback. */
export function resolveModelRate(model: string): ModelRate | null {
  return RATES[rateKeyForModel(model)] ?? null;
}

/** Strict cost estimate for durable accounting; unknown models fail closed. */
export function estimateKnownCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = resolveModelRate(model);
  if (!rate) throw new UnknownModelPricingError(model);
  if (
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    throw new Error('token counts must be finite and non-negative');
  }
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}

export const DEFAULT_TURN_ESTIMATE_USD = 0.01;

/**
 * Default daily AI spend ceiling (USD). Mirrors the Zod schema's
 * `MAX_DAILY_USD.default(5)`.
 */
export const DEFAULT_MAX_DAILY_USD = 5;

/**
 * Normalize a streamed model id to a `RATES` key. Bare ids (no slash,
 * BYOK Google) get the `google/` prefix added.
 */
function rateKeyForModel(model: string): string {
  if (!model.includes('/') && model.startsWith('gemini-')) {
    return `google/${model}`;
  }
  return model;
}

/** Estimate USD cost from token counts. Always >= 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = resolveModelRate(model) ?? FALLBACK_RATE;
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}
